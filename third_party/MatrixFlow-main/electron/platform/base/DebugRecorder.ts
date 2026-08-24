import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'patchright';
import { app } from 'electron';
import { cryptoService } from '../../core/CryptoService';
import { Logger } from '../../core/Logger';
import type { CryptoService } from '../../core/CryptoService';

const logger = new Logger('DebugRecorder');

export interface DebugSnapshot {
  screenshotPath: string;
  htmlSnippet: string;
  url: string;
  title: string;
}

export interface DebugStep {
  id: string;
  name: string;
  timestamp: number;
  durationMs?: number;
  before?: DebugSnapshot;
  after?: DebugSnapshot;
  error?: string;
  meta?: Record<string, unknown>;
  status: 'running' | 'done' | 'failed';
}

export interface DebugRecorderOptions {
  enabled: boolean;
  retentionDays: number;
  encrypt: boolean;
  redactPII: boolean;
  storagePath: string;
}

const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: (match: string, ...args: string[]) => string }> = [
  { pattern: /1\d{10}/g, replacement: (m) => `1****${m.slice(-4)}` },
  { pattern: /account[_\s]*(id[_\s:]*)?(\w{8,})/gi, replacement: () => 'account_***' },
  { pattern: /([a-zA-Z0-9])[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: (_m, first, domain) => `${first}***@${domain}` },
];

const COOKIE_TRUNCATE_LEN = 200;

export function redactPII(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  if (result.length > COOKIE_TRUNCATE_LEN) {
    result = result.slice(0, COOKIE_TRUNCATE_LEN) + '...[REDACTED]';
  }
  return result;
}

export class DebugRecorder {
  private options: DebugRecorderOptions;
  private crypto: CryptoService;
  private steps: Map<string, DebugStep> = new Map();
  private sessionDir: string;
  private _sessionId?: string;

  constructor(options: DebugRecorderOptions, crypto?: CryptoService) {
    this.options = options;
    this.crypto = crypto ?? cryptoService;
    this.sessionDir = options.storagePath;
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private get enabled(): boolean {
    return this.options.enabled;
  }

  async recordStep<T>(
    name: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const stepId = this.generateId();
    const timestamp = Date.now();

    const step: DebugStep = {
      id: stepId,
      name,
      timestamp,
      status: 'running',
      meta: context,
    };

    const sessionId = this.getSessionId();
    const sessionPath = this.getSessionPath(sessionId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const page = (context?.page as Page) ?? (context?.['page'] as Page);
    if (page) {
      try {
        step.before = await this.captureSnapshot(page, sessionId, 'before');
      } catch (err) {
        logger.warn(`[DebugRecorder] before snapshot failed for "${name}": ${err}`);
      }
    }

    const start = Date.now();
    try {
      const result = await fn();
      step.durationMs = Date.now() - start;
      step.status = 'done';
      if (page) {
        try {
          step.after = await this.captureSnapshot(page, sessionId, 'after');
        } catch (err) {
          logger.warn(`[DebugRecorder] after snapshot failed for "${name}": ${err}`);
        }
      }
      return result;
    } catch (err) {
      step.durationMs = Date.now() - start;
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      if (page) {
        try {
          step.after = await this.captureSnapshot(page, sessionId, 'after');
        } catch {
          // ignore
        }
      }
      throw err;
    } finally {
      this.persistStep(sessionId, step);
    }
  }

  async snapshot(name: string, page: Page): Promise<DebugSnapshot> {
    if (!this.enabled) {
      return { screenshotPath: '', htmlSnippet: '', url: page.url(), title: '' };
    }
    const sessionId = this.getSessionId();
    return this.captureSnapshot(page, sessionId, name);
  }

  async exportErrorPackage(taskId: string): Promise<string> {
    const sessionId = taskId;
    const sessionPath = this.getSessionPath(sessionId);
    try {
      const stepsFile = path.join(sessionPath, 'steps.json');
      if (fs.existsSync(stepsFile)) {
        const meta = {
          exportedAt: new Date().toISOString(),
          sessionId,
          taskId,
          steps: JSON.parse(fs.readFileSync(stepsFile, 'utf-8')),
        };
        const metaPath = path.join(this.sessionDir, `${sessionId}_meta.json`);
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        return metaPath;
      }
    } catch (err) {
      logger.error(`[DebugRecorder] exportErrorPackage failed: ${err}`);
    }
    return '';
  }

  async cleanup(): Promise<number> {
    if (!fs.existsSync(this.sessionDir)) return 0;

    const now = Date.now();
    const retentionMs = this.options.retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      const entries = fs.readdirSync(this.sessionDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionPath = path.join(this.sessionDir, entry.name);
        const stat = fs.statSync(sessionPath);
        if (now - stat.mtimeMs > retentionMs) {
          try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            deletedCount++;
          } catch {
            logger.warn(`[DebugRecorder] cleanup: failed to delete ${sessionPath}`);
          }
        }
      }
    } catch (err) {
      logger.error(`[DebugRecorder] cleanup error: ${err}`);
    }

    return deletedCount;
  }

  getSessionId(): string {
    return this._sessionId ??= this.generateSessionId();
  }

  setSessionId(id: string): void {
    this._sessionId = id;
  }

  toJSON(): DebugStep[] {
    return Array.from(this.steps.values());
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionDir, sessionId);
  }

  private async captureSnapshot(
    page: Page,
    sessionId: string,
    label: string,
  ): Promise<DebugSnapshot> {
    const stepId = this.generateId();
    const url = page.url();
    const title = await page.title().catch(() => '');

    let screenshotPath = '';
    try {
      const raw = await page.screenshot({ type: 'png', timeout: 10000 });
      if (this.options.encrypt) {
        const encrypted = await this.crypto.encrypt(raw.toString('base64'));
        screenshotPath = path.join(this.getSessionPath(sessionId), `${stepId}_${label}.enc`);
        fs.writeFileSync(screenshotPath, encrypted, 'utf-8');
      } else {
        screenshotPath = path.join(this.getSessionPath(sessionId), `${stepId}_${label}.png`);
        fs.writeFileSync(screenshotPath, raw);
      }
    } catch (err) {
      logger.warn(`[DebugRecorder] screenshot failed: ${err}`);
      screenshotPath = '';
    }

    let htmlSnippet = '';
    try {
      const rawHtml = await page.content().catch(() => '');
      const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const body = bodyMatch ? bodyMatch[1].slice(0, 2000) : rawHtml.slice(0, 2000);
      htmlSnippet = this.options.redactPII ? redactPII(body) : body;
    } catch {
      htmlSnippet = '';
    }

    return { screenshotPath, htmlSnippet, url, title };
  }

  private persistStep(sessionId: string, step: DebugStep): void {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }
      const stepsFile = path.join(sessionPath, 'steps.json');
      const existing: DebugStep[] = fs.existsSync(stepsFile)
        ? JSON.parse(fs.readFileSync(stepsFile, 'utf-8'))
        : [];
      existing.push(step);
      fs.writeFileSync(stepsFile, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`[DebugRecorder] persistStep failed: ${err}`);
    }
  }
}

let _defaultRecorder: DebugRecorder | null = null;

export function createDebugRecorder(options?: Partial<DebugRecorderOptions>): DebugRecorder {
  const userDataPath = app.getPath('userData');
  const storagePath = path.join(userDataPath, 'debug-sessions');

  const mergedOptions: DebugRecorderOptions = {
    enabled: false,
    retentionDays: 7,
    encrypt: true,
    redactPII: true,
    storagePath,
    ...options,
  };

  return new DebugRecorder(mergedOptions, cryptoService);
}

export function getDebugRecorder(): DebugRecorder {
  if (!_defaultRecorder) {
    _defaultRecorder = createDebugRecorder();
  }
  return _defaultRecorder;
}
