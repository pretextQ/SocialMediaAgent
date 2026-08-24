import fs from 'fs';
import path from 'path';
import type { BrowserContext } from 'patchright';
import type { ISessionManager, Platform, ConsistencyCheck, ConsistencyResult } from './types';
import { app, type Cookie } from 'electron';

interface StorageOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

function getDefaultBaseDir(): string {
  try {
    return path.join(app.getPath('userData'), 'storage');
  } catch {
    return path.join(process.cwd(), 'storage');
  }
}

export class SessionManager implements ISessionManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || getDefaultBaseDir();
    this.ensureDirectories();
  }

  async save(
    context: BrowserContext,
    accountId: string,
    platform: Platform
  ): Promise<string> {
    const storageState = await context.storageState();
    return this.writeStorageState(storageState, accountId, platform);
  }

  async saveFromCookies(
    cookies: Array<{ name: string; value: string; domain: string; path: string }>,
    accountId: string,
    platform: Platform
  ): Promise<string> {
    const storageState = {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      })),
      origins: [] as Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>,
    };
    return this.writeStorageState(storageState, accountId, platform);
  }

  async saveFromElectronCookies(
    cookies: Cookie[],
    accountId: string,
    platform: Platform,
    origins: StorageOrigin[] = []
  ): Promise<string> {
    const storageState = {
      cookies: cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain ?? '',
        path: cookie.path ?? '/',
        expires: cookie.expirationDate ?? -1,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite === 'strict'
          ? 'Strict'
          : cookie.sameSite === 'no_restriction'
            ? 'None'
            : 'Lax',
      })),
      origins,
    };

    return this.writeStorageState(storageState, accountId, platform);
  }

  private async writeStorageState(
    storageState: { cookies: unknown[]; origins: unknown[] },
    accountId: string,
    platform: Platform
  ): Promise<string> {
    const storagePath = this.getStoragePath(platform, accountId);
    const tmpStoragePath = `${storagePath}.tmp.${process.pid}`;

    try {
      await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.promises.writeFile(tmpStoragePath, JSON.stringify(storageState, null, 2));
      await fs.promises.rename(tmpStoragePath, storagePath);

      return storagePath;
    } catch (e) {
      await fs.promises.unlink(tmpStoragePath).catch(() => {});
      throw e;
    }
  }

  async load(accountId: string): Promise<Record<string, unknown> | null> {
    const accounts = await this.findAccountStorageFiles(accountId);
    if (accounts.length === 0) {
      return null;
    }

    const storagePath = accounts[0];
    const content = await fs.promises.readFile(storagePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  }

  async validate(accountId: string): Promise<boolean> {
    const storageState = await this.load(accountId);
    if (!storageState) {
      return false;
    }

    const cookies = storageState.cookies as Array<{ name: string }> | undefined;
    return Array.isArray(cookies) && cookies.length > 0;
  }

  async remove(accountId: string): Promise<void> {
    const files = await this.findAccountStorageFiles(accountId);
    
    await Promise.all(
      files.map(file => fs.promises.unlink(file).catch(() => {}))
    );
    
    const profileDirs = await this.findProfileDirs(accountId);
    await Promise.all(
      profileDirs.map(dir => fs.promises.rm(dir, { recursive: true }).catch(() => {}))
    );
  }

  async verifyConsistency(accountId: string, platform: Platform, dbRecordExists: boolean): Promise<ConsistencyResult> {
    const results: ConsistencyCheck[] = [];

    const storagePath = this.getStoragePath(platform, accountId);
    const storageExists = await fs.promises.access(storagePath).then(() => true).catch(() => false);
    results.push({ layer: 'storageState', exists: storageExists });

    const profilePath = this.getProfilePath(platform, accountId);
    const profileExists = await fs.promises.access(profilePath).then(() => true).catch(() => false);
    results.push({ layer: 'profile', exists: profileExists });

    results.push({ layer: 'database', exists: dbRecordExists });

    const allExist = results.every(r => r.exists);
    const noneExist = results.every(r => !r.exists);
    
    if (allExist || noneExist) {
      return { consistent: true, details: results };
    }

    return { 
      consistent: false, 
      details: results,
      repairAction: this.determineRepairAction(results),
    };
  }

  private ensureDirectories(): void {
    const dirs = [
      path.join(this.baseDir, 'cookies'),
      path.join(this.baseDir, 'browser_data'),
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private getStoragePath(platform: Platform, accountId: string): string {
    return path.join(this.baseDir, 'cookies', `${platform}_${accountId}.json`);
  }

  private getProfilePath(platform: Platform, accountId: string): string {
    return path.join(this.baseDir, 'browser_data', platform, accountId);
  }

  private async findAccountStorageFiles(accountId: string): Promise<string[]> {
    const cookiesDir = path.join(this.baseDir, 'cookies');
    if (!fs.existsSync(cookiesDir)) {
      return [];
    }

    const files = await fs.promises.readdir(cookiesDir);
    return files
      .filter(f => f.includes(`_${accountId}.json`))
      .map(f => path.join(cookiesDir, f));
  }

  private async findProfileDirs(accountId: string): Promise<string[]> {
    const browserDataDir = path.join(this.baseDir, 'browser_data');
    if (!fs.existsSync(browserDataDir)) {
      return [];
    }

    const platforms = await fs.promises.readdir(browserDataDir);
    const dirs: string[] = [];

    for (const platform of platforms) {
      const profileDir = path.join(browserDataDir, platform, accountId);
      if (fs.existsSync(profileDir)) {
        dirs.push(profileDir);
      }
    }

    return dirs;
  }

  private determineRepairAction(results: ConsistencyCheck[]): 'relogin' | 'rebuild_db' | 'cleanup_and_relogin' {
    const storageState = results.find(r => r.layer === 'storageState');
    const profile = results.find(r => r.layer === 'profile');
    const database = results.find(r => r.layer === 'database');

    if (!storageState?.exists && !profile?.exists && database?.exists) {
      return 'relogin';
    }

    if (storageState?.exists && !database?.exists) {
      return 'rebuild_db';
    }

    return 'cleanup_and_relogin';
  }
}
