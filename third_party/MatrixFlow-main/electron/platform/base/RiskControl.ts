import type { WebContents } from 'electron';
import type { Page } from 'patchright';

export type RiskTextPattern = string | RegExp;

export interface RiskTextFieldQuery {
  labelPatterns: RiskTextPattern[];
  placeholderPatterns: RiskTextPattern[];
  preferMultiline?: boolean;
  allowFallback?: boolean;
}

// ---- 拟人化操作选项 ----

export interface HumanizedActionOptions {
  /** 最小延迟 (ms)，默认从配置读取 */
  minDelayMs?: number;
  /** 最大延迟 (ms)，默认从配置读取 */
  maxDelayMs?: number;
  /** 是否记录调试日志 */
  debug?: boolean;
  /** 错误时是否抛出 */
  throwOnError?: boolean;
}

export interface HumanizedTypeOptions extends HumanizedActionOptions {
  /** 每个字符输入间隔 (ms)，默认 50-200 */
  charDelayMs?: { min: number; max: number };
  /** 输入前清空已有内容 */
  clearBefore?: boolean;
  /** 输入后按回车 */
  pressEnterAfter?: boolean;
}

export interface HumanizedClickOptions extends HumanizedActionOptions {
  /** 点击前是否悬停 */
  hoverBefore?: boolean;
  /** 悬停持续时间 (ms) */
  hoverDurationMs?: number;
}

export interface HumanizedScrollOptions extends HumanizedActionOptions {
  /** 滚动速度 (px/s)，默认 200-500 */
  speedPxPerSec?: { min: number; max: number };
}

export interface HumanizedSelectOptions extends HumanizedActionOptions {
  /** 选择前悬停持续时间 (ms) */
  hoverDurationMs?: number;
}

export interface HumanizedUploadOptions extends HumanizedActionOptions {
  /** 上传前等待时间 (ms) */
  waitBeforeUploadMs?: number;
}

export interface HumanizedDragOptions extends HumanizedActionOptions {
  /** 拖拽持续时间 (ms) */
  dragDurationMs?: number;
}

export interface HumanizedReadOptions extends HumanizedActionOptions {
  /** 阅读时间随机范围系数 (min * duration, max * duration) */
  readTimeCoeff?: { min: number; max: number };
}

// ---- RiskControl 选项扩展 ----

export interface RiskControlOptions {
  minWriteStepDelayMs?: number;
  maxWriteStepDelayMs?: number;
  minKeyDelayMs?: number;
  maxKeyDelayMs?: number;
  maxTags?: number;
  // 拟人化参数
  typingDelayMs?: { min: number; max: number };
  clickDelayMs?: { min: number; max: number };
  stepIntervalSec?: { min: number; max: number };
  scrollSpeedPxPerSec?: { min: number; max: number };
}

interface SerializedPattern {
  source: string;
  flags: string;
}

const DEFAULT_OPTIONS: Required<RiskControlOptions> = {
  minWriteStepDelayMs: 1000,
  maxWriteStepDelayMs: 3000,
  minKeyDelayMs: 45,
  maxKeyDelayMs: 180,
  maxTags: 3,
  typingDelayMs: { min: 50, max: 200 },
  clickDelayMs: { min: 100, max: 300 },
  stepIntervalSec: { min: 2.0, max: 3.0 },
  scrollSpeedPxPerSec: { min: 200, max: 500 },
};

function escapeRegExpText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToSource(pattern: RiskTextPattern): SerializedPattern {
  return typeof pattern === 'string'
    ? { source: escapeRegExpText(pattern), flags: '' }
    : { source: pattern.source, flags: pattern.flags };
}

function serializeQuery(query: RiskTextFieldQuery) {
  return {
    labels: query.labelPatterns.map(patternToSource),
    placeholders: query.placeholderPatterns.map(patternToSource),
    preferMultiline: query.preferMultiline === true,
    allowFallback: query.allowFallback === true,
  };
}

function riskTagToText(tag: unknown): string {
  if (typeof tag === 'string') return tag;
  if (tag === null || tag === undefined) return '';
  if (typeof tag === 'number' || typeof tag === 'boolean') return String(tag);
  if (typeof tag === 'object') {
    const record = tag as Record<string, unknown>;
    for (const key of ['name', 'label', 'value', 'title', 'text']) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
    }
  }
  return '';
}

export function normalizeRiskTags(tags?: readonly unknown[] | null, maxTags = DEFAULT_OPTIONS.maxTags): string[] {
  return (tags ?? [])
    .map((tag) => {
      let value = riskTagToText(tag).trim();
      value = value.replace(/^#+\s*/, '').trim();
      value = value.replace(/^(?:undefined|null)\b[\s:：,，、-]*/i, '').trim();
      value = value.replace(/^#+\s*/, '').trim();
      return value.replace(/\s+/g, ' ').trim();
    })
    .filter((tag) => tag.length > 0 && !/^(?:undefined|null|nan)$/i.test(tag))
    .slice(0, maxTags);
}

// Fengkong abstraction for platform automation. It centralizes human-like
// typing, randomized write-step delays, and per-tag confirmation behavior.
export abstract class FengkongAbstractClass {
  protected readonly options: Required<RiskControlOptions>;

  constructor(options: RiskControlOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async humanizedFillField(
    query: RiskTextFieldQuery,
    text: string,
    options: { clearBeforeType?: boolean } = {},
  ): Promise<boolean> {
    const value = text.trim();
    const focused = await this.focusTextFieldByLabel(query);
    if (!focused) return false;

    await this.randomWriteStepDelay();
    if (options.clearBeforeType !== false) {
      await this.clearFocusedText();
      await this.randomWriteStepDelay();
    }

    if (value) {
      await this.typeHumanizedText(value);
      await this.randomWriteStepDelay();
    }

    return true;
  }

  async humanizedAppendTags(
    tags: readonly unknown[] | null | undefined,
    options: { newlineBeforeFirst?: boolean; maxTags?: number } = {},
  ): Promise<void> {
    const maxTags = options.maxTags ?? this.options.maxTags;
    const normalizedTags = normalizeRiskTags(tags, maxTags);

    if (normalizedTags.length === 0) return;

    if (options.newlineBeforeFirst) {
      await this.randomWriteStepDelay();
      await this.pressEnter();
    }

    for (const tag of normalizedTags) {
      await this.randomWriteStepDelay();
      await this.typeText('#');
      await this.sleep(this.randomInt(this.options.minKeyDelayMs, this.options.maxKeyDelayMs));
      await this.typeHumanizedText(tag);
      await this.randomWriteStepDelay();
      await this.pressEnter();
    }
  }

  async randomActionDelay(): Promise<void> {
    await this.randomWriteStepDelay();
  }

  protected async typeHumanizedText(text: string): Promise<void> {
    for (const char of Array.from(text)) {
      if (char === '\n') {
        await this.pressEnter();
      } else {
        await this.typeText(char);
      }
      await this.sleep(this.randomInt(this.options.minKeyDelayMs, this.options.maxKeyDelayMs));
    }
  }

  protected async randomWriteStepDelay(): Promise<void> {
    await this.sleep(this.randomInt(this.options.minWriteStepDelayMs, this.options.maxWriteStepDelayMs));
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected randomInt(min: number, max: number): number {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.floor(lower + Math.random() * (upper - lower + 1));
  }

  protected abstract focusTextFieldByLabel(query: RiskTextFieldQuery): Promise<boolean>;
  protected abstract clearFocusedText(): Promise<void>;
  protected abstract typeText(text: string): Promise<void>;
  protected abstract pressEnter(): Promise<void>;
}

export class PageRiskControl extends FengkongAbstractClass {
  constructor(private readonly page: Page, options: RiskControlOptions = {}) {
    super(options);
  }

  protected async focusTextFieldByLabel(query: RiskTextFieldQuery): Promise<boolean> {
    const payload = serializeQuery(query);
    return await this.page.evaluate((payload) => {
      const win = globalThis as any;
      const doc = win.document;
      const HTMLElementCtor = win.HTMLElement;
      const HTMLTextAreaElementCtor = win.HTMLTextAreaElement;
      const labelRegexes = payload.labels.map((p: SerializedPattern) => new RegExp(p.source, p.flags));
      const placeholderRegexes = payload.placeholders.map((p: SerializedPattern) => new RegExp(p.source, p.flags));
      const editableSelector = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"], .ProseMirror';
      const isElement = (el: any) => el && (!HTMLElementCtor || el instanceof HTMLElementCtor);
      const isTextarea = (el: any) => HTMLTextAreaElementCtor && el instanceof HTMLTextAreaElementCtor;
      const isVisible = (el: any) => {
        const rect = el.getBoundingClientRect();
        const style = win.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el: any) => (el.innerText || el.textContent || '').trim();
      const isMultiline = (el: any) => isTextarea(el)
        || el.getAttribute('contenteditable') === 'true'
        || el.getAttribute('role') === 'textbox'
        || el.classList.contains('ProseMirror');
      const editables = (Array.from(doc.querySelectorAll(editableSelector)) as any[])
        .filter((el: any) => isElement(el) && isVisible(el) && !el.matches('[disabled], [readonly], [type="hidden"]'));
      const matchesEditable = (el: any) => {
        if (payload.preferMultiline && !isMultiline(el)) return false;
        const attrs = [
          el.getAttribute('placeholder') || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('data-placeholder') || '',
          el.getAttribute('name') || '',
          el.getAttribute('class') || '',
          el.id || '',
        ].join(' ');
        return placeholderRegexes.some((pattern: RegExp) => pattern.test(attrs));
      };
      const focusTarget = (target: any) => {
        if (!isElement(target)) return false;
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.focus();
        return true;
      };

      const placeholderTarget = editables.find(matchesEditable);
      if (placeholderTarget) return focusTarget(placeholderTarget);

      const labels = (Array.from(doc.querySelectorAll('label, span, div, p')) as any[])
        .filter((el: any) => {
          if (!isElement(el) || !isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && labelRegexes.some((pattern: RegExp) => pattern.test(text));
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      for (const label of labels) {
        let node: any = label;
        for (let depth = 0; node && depth < 7; depth += 1) {
          const candidates = (Array.from(node.querySelectorAll(editableSelector)) as any[])
            .filter((el: any) => isElement(el) && isVisible(el) && (!payload.preferMultiline || isMultiline(el)));
          if (candidates.length > 0) return focusTarget(candidates[0]);
          node = node.parentElement;
        }
      }

      if (payload.allowFallback) {
        const fallback = editables.find((el: any) => !payload.preferMultiline || isMultiline(el));
        if (fallback) return focusTarget(fallback);
      }
      return false;
    }, payload).catch(() => false);
  }

  protected async clearFocusedText(): Promise<void> {
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');
  }

  protected async typeText(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  protected async pressEnter(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  // ============================================================
  // 拟人化操作方法（PageRiskControl 实现）
  // ============================================================

  async humanWait(ms: number, options?: HumanizedActionOptions): Promise<void> {
    const delay = this.randomInt(
      options?.minDelayMs ?? ms * 0.8,
      options?.maxDelayMs ?? ms * 1.2,
    );
    if (options?.debug) {
      console.log(`  🕐 [RiskControl] wait ${delay}ms`);
    }
    await this.sleep(delay);
  }

  async humanType(
    selector: string,
    text: string,
    options?: HumanizedTypeOptions,
  ): Promise<void> {
    const loc = this.page.locator(selector).first();
    const charDelay = options?.charDelayMs ?? this.options.typingDelayMs ?? { min: 50, max: 200 };
    if (options?.debug) {
      console.log(`  ⌨️  [RiskControl] type "${text}" into ${selector}`);
    }
    await loc.waitFor({ state: 'visible', timeout: 10000 });
    await this.sleep(this.randomInt(charDelay.min, charDelay.max));
    if (options?.clearBefore !== false) {
      await loc.clear();
      await this.sleep(this.randomInt(charDelay.min, charDelay.max));
    }
    for (const char of Array.from(text)) {
      await loc.type(char);
      await this.sleep(this.randomInt(charDelay.min, charDelay.max));
    }
    if (options?.pressEnterAfter) {
      await this.sleep(this.randomInt(charDelay.min, charDelay.max));
      await this.pressEnter();
    }
  }

  async humanClick(
    selector: string,
    options?: HumanizedClickOptions,
  ): Promise<void> {
    const loc = this.page.locator(selector).first();
    if (options?.debug) {
      console.log(`  🖱️  [RiskControl] click ${selector}`);
    }
    await loc.waitFor({ state: 'visible', timeout: 10000 });
    if (options?.hoverBefore) {
      await loc.hover();
      await this.sleep(options?.hoverDurationMs ?? this.randomInt(150, 300));
    }
    await this.sleep(this.randomInt(
      options?.minDelayMs ?? this.options.clickDelayMs?.min ?? 100,
      options?.maxDelayMs ?? this.options.clickDelayMs?.max ?? 300,
    ));
    await loc.click();
  }

  async humanHover(
    selector: string,
    options?: HumanizedActionOptions,
  ): Promise<void> {
    const loc = this.page.locator(selector).first();
    if (options?.debug) {
      console.log(`  👆  [RiskControl] hover ${selector}`);
    }
    await loc.waitFor({ state: 'visible', timeout: 10000 });
    await this.sleep(this.randomInt(
      options?.minDelayMs ?? 100,
      options?.maxDelayMs ?? 200,
    ));
    await loc.hover();
  }

  async humanScroll(
    direction: 'up' | 'down' | 'top' | 'bottom',
    distanceOrSelector?: number | string,
    options?: HumanizedScrollOptions,
  ): Promise<void> {
    if (options?.debug) {
      console.log(`  📜  [RiskControl] scroll ${direction}`);
    }
    const speed = options?.speedPxPerSec ?? this.options.scrollSpeedPxPerSec ?? { min: 200, max: 500 };
    if (direction === 'top') {
      await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } else if (direction === 'bottom') {
      await this.page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    } else {
      const distance = typeof distanceOrSelector === 'number' ? distanceOrSelector : 300;
      const duration = (distance / this.randomInt(speed.min, speed.max)) * 1000;
      await this.page.evaluate(
        ({ d, dist, dur }) => {
          const scrollStep = dist / Math.ceil(dur / 50);
          let pos = 0;
          const step = () => {
            pos += scrollStep;
            window.scrollBy(0, d === 'down' ? scrollStep : -scrollStep);
            if (pos < dist) setTimeout(step, 50);
          };
          step();
        },
        { d: direction, dist: distance, dur: duration },
      );
      await this.sleep(Math.ceil(duration));
    }
    await this.sleep(this.randomInt(
      options?.minDelayMs ?? 200,
      options?.maxDelayMs ?? 400,
    ));
  }

  async humanSelect(
    selector: string,
    value: string,
    options?: HumanizedSelectOptions,
  ): Promise<void> {
    const loc = this.page.locator(selector).first();
    if (options?.debug) {
      console.log(`  🔽  [RiskControl] select "${value}" in ${selector}`);
    }
    await loc.waitFor({ state: 'visible', timeout: 10000 });
    await this.sleep(options?.hoverDurationMs ?? this.randomInt(150, 300));
    await loc.selectOption(value);
    await this.sleep(this.randomInt(
      options?.minDelayMs ?? 100,
      options?.maxDelayMs ?? 250,
    ));
  }

  async humanUpload(
    selector: string,
    filePath: string,
    options?: HumanizedUploadOptions,
  ): Promise<void> {
    const loc = this.page.locator(selector).first();
    if (options?.debug) {
      console.log(`  📤  [RiskControl] upload ${filePath} to ${selector}`);
    }
    await loc.waitFor({ state: 'visible', timeout: 10000 });
    await this.sleep(options?.waitBeforeUploadMs ?? this.randomInt(500, 1000));
    await loc.setInputFiles(filePath);
    await this.sleep(this.randomInt(
      options?.minDelayMs ?? 300,
      options?.maxDelayMs ?? 600,
    ));
  }

  async humanDrag(
    sourceSelector: string,
    targetSelector: string,
    options?: HumanizedDragOptions,
  ): Promise<void> {
    const source = this.page.locator(sourceSelector).first();
    const target = this.page.locator(targetSelector).first();
    if (options?.debug) {
      console.log(`  🤚  [RiskControl] drag ${sourceSelector} → ${targetSelector}`);
    }
    await source.waitFor({ state: 'visible', timeout: 10000 });
    await target.waitFor({ state: 'visible', timeout: 10000 });
    const dur = options?.dragDurationMs ?? this.randomInt(400, 800);
    await source.dragTo(target, { targetPosition: { x: 5, y: 5 } });
    await this.sleep(dur);
  }

  async humanRead(
    selectorOrDuration: string | number,
    options?: HumanizedReadOptions,
  ): Promise<void> {
    const duration = typeof selectorOrDuration === 'number'
      ? selectorOrDuration
      : 0;
    const coeff = options?.readTimeCoeff ?? { min: 0.8, max: 1.5 };
    if (options?.debug) {
      console.log(`  👁️  [RiskControl] read${duration ? ` ${duration}ms` : ` ${selectorOrDuration}`}`);
    }
    if (duration > 0) {
      const actualDuration = this.randomInt(
        Math.floor(duration * coeff.min),
        Math.floor(duration * coeff.max),
      );
      await this.sleep(actualDuration);
    } else {
      await this.sleep(this.randomInt(
        options?.minDelayMs ?? 1000,
        options?.maxDelayMs ?? 2000,
      ));
    }
  }
}

export class EmbeddedRiskControl extends FengkongAbstractClass {
  constructor(private readonly wc: WebContents, options: RiskControlOptions = {}) {
    super(options);
  }

  protected async focusTextFieldByLabel(query: RiskTextFieldQuery): Promise<boolean> {
    const payload = serializeQuery(query);
    return await this.wc.executeJavaScript(`
      (() => {
        const payload = ${JSON.stringify(payload)};
        const labelRegexes = payload.labels.map((p) => new RegExp(p.source, p.flags));
        const placeholderRegexes = payload.placeholders.map((p) => new RegExp(p.source, p.flags));
        const editableSelector = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"], .ProseMirror';
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').trim();
        const isMultiline = (el) => el instanceof HTMLTextAreaElement
          || el.getAttribute('contenteditable') === 'true'
          || el.getAttribute('role') === 'textbox'
          || el.classList.contains('ProseMirror');
        const editables = Array.from(document.querySelectorAll(editableSelector))
          .filter((el) => el instanceof HTMLElement && isVisible(el) && !el.matches('[disabled], [readonly], [type="hidden"]'));
        const matchesEditable = (el) => {
          if (payload.preferMultiline && !isMultiline(el)) return false;
          const attrs = [
            el.getAttribute('placeholder') || '',
            el.getAttribute('aria-label') || '',
            el.getAttribute('data-placeholder') || '',
            el.getAttribute('name') || '',
            el.getAttribute('class') || '',
            el.id || '',
          ].join(' ');
          return placeholderRegexes.some((pattern) => pattern.test(attrs));
        };
        const focusTarget = (target) => {
          if (!(target instanceof HTMLElement)) return false;
          target.scrollIntoView({ block: 'center', inline: 'nearest' });
          target.focus();
          return true;
        };

        const placeholderTarget = editables.find(matchesEditable);
        if (placeholderTarget) return focusTarget(placeholderTarget);

        const labels = Array.from(document.querySelectorAll('label, span, div, p'))
          .filter((el) => {
            if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
            const text = textOf(el);
            return text.length > 0 && text.length <= 80 && labelRegexes.some((pattern) => pattern.test(text));
          })
          .sort((a, b) => textOf(a).length - textOf(b).length);

        for (const label of labels) {
          let node = label;
          for (let depth = 0; node && depth < 7; depth += 1) {
            const candidates = Array.from(node.querySelectorAll(editableSelector))
              .filter((el) => el instanceof HTMLElement && isVisible(el) && (!payload.preferMultiline || isMultiline(el)));
            if (candidates.length > 0) return focusTarget(candidates[0]);
            node = node.parentElement;
          }
        }

        if (payload.allowFallback) {
          const fallback = editables.find((el) => !payload.preferMultiline || isMultiline(el));
          if (fallback) return focusTarget(fallback);
        }
        return false;
      })()
    `, true).catch(() => false) as boolean;
  }

  protected async clearFocusedText(): Promise<void> {
    await this.wc.executeJavaScript(`
      (() => {
        const target = document.activeElement;
        if (!(target instanceof HTMLElement)) return;
        const InputEventCtor = window.InputEvent || window.Event;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (setter) setter.call(target, '');
          else target.value = '';
          target.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'deleteContentBackward', data: '' }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('delete');
        target.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'deleteContentBackward', data: '' }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `, true).catch(() => undefined);
  }

  protected async typeText(text: string): Promise<void> {
    if (/^[\x20-\x7E]$/.test(text)) {
      this.wc.sendInputEvent({ type: 'keyDown', keyCode: text });
      this.wc.sendInputEvent({ type: 'char', keyCode: text });
      this.wc.sendInputEvent({ type: 'keyUp', keyCode: text });
      return;
    }
    this.wc.sendInputEvent({ type: 'char', keyCode: text });
  }

  protected async pressEnter(): Promise<void> {
    this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  }
}

export { FengkongAbstractClass as 风控抽象类 };
