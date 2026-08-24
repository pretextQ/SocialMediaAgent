import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trySelectors, clickWithFallback, fillWithFallback, uploadWithFallback } from '@electron/platform/base/selectorUtils';

function createMockLocator(overrides: Record<string, unknown> = {}) {
  return {
    waitFor: vi.fn(),
    click: vi.fn(),
    fill: vi.fn(),
    setInputFiles: vi.fn(),
    ...overrides,
  };
}

function createMockPage(locatorOverrides: Record<string, unknown> = {}) {
  const locator = createMockLocator(locatorOverrides);
  return {
    locator: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue(locator),
    }),
  } as unknown as import('patchright').Page;
}

describe('selectorUtils', () => {
  describe('trySelectors', () => {
    it('returns the first matching locator', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockResolvedValue(undefined) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await trySelectors(page, ['.btn', '.button'], { timeout: 3000 });

      expect(result).toBe(locator);
      expect(page.locator).toHaveBeenCalledWith('.btn');
    });

    it('returns null when all selectors fail', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockRejectedValue(new Error('not found')) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await trySelectors(page, ['.missing1', '.missing2']);
      expect(result).toBeNull();
    });

    it('tries second selector when first fails', async () => {
      const failLocator = createMockLocator({ waitFor: vi.fn().mockRejectedValue(new Error('fail')) });
      const successLocator = createMockLocator({ waitFor: vi.fn().mockResolvedValue(undefined) });

      let callCount = 0;
      const page = {
        locator: vi.fn().mockImplementation(() => {
          callCount++;
          const loc = callCount === 1 ? failLocator : successLocator;
          return { first: vi.fn().mockReturnValue(loc) };
        }),
      } as unknown as import('patchright').Page;

      const result = await trySelectors(page, ['.fail', '.success']);
      expect(result).toBe(successLocator);
    });

    it('uses default timeout of 5000ms', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockResolvedValue(undefined) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      await trySelectors(page, ['.btn']);
      expect(locator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 });
    });

    it('uses custom timeout', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockResolvedValue(undefined) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      await trySelectors(page, ['.btn'], { timeout: 2000 });
      expect(locator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 2000 });
    });
  });

  describe('clickWithFallback', () => {
    it('returns true and clicks when selector matches', async () => {
      const locator = createMockLocator({
        waitFor: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await clickWithFallback(page, ['.btn']);
      expect(result).toBe(true);
      expect(locator.click).toHaveBeenCalled();
    });

    it('returns false when no selector matches', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockRejectedValue(new Error('not found')) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await clickWithFallback(page, ['.missing']);
      expect(result).toBe(false);
    });
  });

  describe('fillWithFallback', () => {
    it('returns true and fills value when selector matches', async () => {
      const locator = createMockLocator({
        waitFor: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
      });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await fillWithFallback(page, ['#input'], 'hello');
      expect(result).toBe(true);
      expect(locator.fill).toHaveBeenCalledWith('hello');
    });

    it('returns false when no selector matches', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockRejectedValue(new Error('fail')) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await fillWithFallback(page, ['.missing'], 'val');
      expect(result).toBe(false);
    });
  });

  describe('uploadWithFallback', () => {
    it('returns true and sets input files when selector matches', async () => {
      const locator = createMockLocator({
        waitFor: vi.fn().mockResolvedValue(undefined),
        setInputFiles: vi.fn().mockResolvedValue(undefined),
      });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await uploadWithFallback(page, ['input[type="file"]'], '/path/to/video.mp4');
      expect(result).toBe(true);
      expect(locator.setInputFiles).toHaveBeenCalledWith('/path/to/video.mp4');
    });

    it('returns false when no selector matches', async () => {
      const locator = createMockLocator({ waitFor: vi.fn().mockRejectedValue(new Error('fail')) });
      const page = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(locator),
        }),
      } as unknown as import('patchright').Page;

      const result = await uploadWithFallback(page, ['.missing'], '/path/to/video.mp4');
      expect(result).toBe(false);
    });
  });
});
