import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAdapter } from '@electron/platform/base/BaseAdapter';

// Create a concrete subclass to test abstract BaseAdapter
class TestAdapter extends BaseAdapter {
  // Expose protected methods for testing
  callWaitForElement(page: Parameters<BaseAdapter['waitForElement']>[0], selector: string, timeout?: number) {
    return this.waitForElement(page, selector, timeout);
  }

  callSafeClick(page: Parameters<BaseAdapter['safeClick']>[0], selector: string) {
    return this.safeClick(page, selector);
  }

  callSafeFill(page: Parameters<BaseAdapter['safeFill']>[0], selector: string, value: string) {
    return this.safeFill(page, selector, value);
  }

  callWaitForNavigation(page: Parameters<BaseAdapter['waitForNavigation']>[0], urlPattern: string | RegExp, timeout?: number) {
    return this.waitForNavigation(page, urlPattern, timeout);
  }

  callTakeScreenshot(page: Parameters<BaseAdapter['takeScreenshot']>[0], name: string) {
    return this.takeScreenshot(page, name);
  }

  callRetryWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number, baseDelayMs?: number) {
    return this.retryWithBackoff(fn, maxRetries, baseDelayMs);
  }
}

function createMockPage(overrides: Record<string, unknown> = {}) {
  return {
    waitForSelector: vi.fn(),
    click: vi.fn(),
    fill: vi.fn(),
    waitForURL: vi.fn(),
    screenshot: vi.fn(),
    ...overrides,
  } as unknown as Parameters<BaseAdapter['waitForElement']>[0];
}

describe('BaseAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  describe('waitForElement', () => {
    it('returns true when element becomes visible', async () => {
      const page = createMockPage({
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      });

      const result = await adapter.callWaitForElement(page, '.my-element');
      expect(result).toBe(true);
      expect(page.waitForSelector).toHaveBeenCalledWith('.my-element', {
        timeout: 30000,
        state: 'visible',
      });
    });

    it('uses custom timeout when provided', async () => {
      const page = createMockPage({
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      });

      await adapter.callWaitForElement(page, '.btn', 5000);
      expect(page.waitForSelector).toHaveBeenCalledWith('.btn', {
        timeout: 5000,
        state: 'visible',
      });
    });

    it('returns false when element not found within timeout', async () => {
      const page = createMockPage({
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
      });

      const result = await adapter.callWaitForElement(page, '.missing');
      expect(result).toBe(false);
    });
  });

  describe('safeClick', () => {
    it('returns true on successful click', async () => {
      const page = createMockPage({
        click: vi.fn().mockResolvedValue(undefined),
      });

      const result = await adapter.callSafeClick(page, '.btn');
      expect(result).toBe(true);
      expect(page.click).toHaveBeenCalledWith('.btn', { timeout: 5000 });
    });

    it('returns false on click failure', async () => {
      const page = createMockPage({
        click: vi.fn().mockRejectedValue(new Error('not found')),
      });

      const result = await adapter.callSafeClick(page, '.missing');
      expect(result).toBe(false);
    });
  });

  describe('safeFill', () => {
    it('returns true on successful fill', async () => {
      const page = createMockPage({
        fill: vi.fn().mockResolvedValue(undefined),
      });

      const result = await adapter.callSafeFill(page, '#input', 'hello');
      expect(result).toBe(true);
      expect(page.fill).toHaveBeenCalledWith('#input', 'hello', { timeout: 5000 });
    });

    it('returns false on fill failure', async () => {
      const page = createMockPage({
        fill: vi.fn().mockRejectedValue(new Error('not found')),
      });

      const result = await adapter.callSafeFill(page, '#missing', 'value');
      expect(result).toBe(false);
    });
  });

  describe('waitForNavigation', () => {
    it('returns true when URL matches string pattern', async () => {
      const page = createMockPage({
        waitForURL: vi.fn().mockResolvedValue(undefined),
      });

      const result = await adapter.callWaitForNavigation(page, '/success');
      expect(result).toBe(true);
      expect(page.waitForURL).toHaveBeenCalledWith('/success', { timeout: 30000 });
    });

    it('returns true when URL matches regex pattern', async () => {
      const page = createMockPage({
        waitForURL: vi.fn().mockResolvedValue(undefined),
      });

      const result = await adapter.callWaitForNavigation(page, /\/manage/);
      expect(result).toBe(true);
    });

    it('uses custom timeout when provided', async () => {
      const page = createMockPage({
        waitForURL: vi.fn().mockResolvedValue(undefined),
      });

      await adapter.callWaitForNavigation(page, '/done', 10000);
      expect(page.waitForURL).toHaveBeenCalledWith('/done', { timeout: 10000 });
    });

    it('returns false on navigation timeout', async () => {
      const page = createMockPage({
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout')),
      });

      const result = await adapter.callWaitForNavigation(page, '/never');
      expect(result).toBe(false);
    });
  });

  describe('takeScreenshot', () => {
    it('takes screenshot and returns path', async () => {
      const page = createMockPage({
        screenshot: vi.fn().mockResolvedValue(undefined),
      });

      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const result = await adapter.callTakeScreenshot(page, 'test');
      expect(result).toBe('data/screenshots/test-1000.png');
      expect(page.screenshot).toHaveBeenCalledWith({
        path: 'data/screenshots/test-1000.png',
        fullPage: false,
      });
      vi.spyOn(Date, 'now').mockRestore();
    });
  });

  describe('retryWithBackoff', () => {
    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('ok');

      const result = await adapter.callRetryWithBackoff(fn, 3, 10);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds on later attempt', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('ok');

      const result = await adapter.callRetryWithBackoff(fn, 3, 10);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws last error after all retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));

      await expect(adapter.callRetryWithBackoff(fn, 2, 10)).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('uses default maxRetries=3', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(adapter.callRetryWithBackoff(fn)).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
