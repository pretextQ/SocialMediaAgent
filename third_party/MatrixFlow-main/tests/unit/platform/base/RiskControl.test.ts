import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PageRiskControl, normalizeRiskTags } from '@electron/platform/base/RiskControl';

function createMockPage() {
  const mockLocator = {
    waitFor: vi.fn(() => Promise.resolve()),
    click: vi.fn(() => Promise.resolve()),
    hover: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    type: vi.fn(() => Promise.resolve()),
    fill: vi.fn(() => Promise.resolve()),
    isVisible: vi.fn(() => Promise.resolve(true)),
    first: vi.fn(function (this: any) { return this; }),
    selectOption: vi.fn(() => Promise.resolve()),
    setInputFiles: vi.fn(() => Promise.resolve()),
    dragTo: vi.fn(() => Promise.resolve()),
    count: vi.fn(() => 1),
  };

  const page = {
    locator: vi.fn(() => mockLocator),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    keyboard: {
      type: vi.fn(() => Promise.resolve()),
      press: vi.fn(() => Promise.resolve()),
    },
    url: vi.fn(() => 'https://example.com'),
    evaluate: vi.fn(() => Promise.resolve()),
  } as unknown as import('patchright').Page;

  return { page, mockLocator };
}

describe('PageRiskControl', () => {
  describe('normalizeRiskTags', () => {
    it('removes undefined pollution before kuaishou topic input', () => {
      expect(normalizeRiskTags([
        'undefined 看见孩子',
        '#undefined 好书推荐',
        '#undefined 好书',
        'undefined 大育儿准则',
      ], 4)).toEqual([
        '看见孩子',
        '好书推荐',
        '好书',
        '大育儿准则',
      ]);
    });

    it('normalizes hashes, empty values, and object tags', () => {
      expect(normalizeRiskTags([
        ' #亲子教育 ',
        undefined,
        null,
        'undefined',
        { name: '#好书' },
        { label: ' null 育儿' },
      ], 10)).toEqual(['亲子教育', '好书', '育儿']);
    });

    it('limits tags to maxTags', () => {
      const result = normalizeRiskTags(['标签1', '标签2', '标签3', '标签4', '标签5'], 3);
      expect(result).toHaveLength(3);
    });

    it('filters out invalid tags', () => {
      expect(normalizeRiskTags(['valid', 'undefined', 'null', 'nan', '   '], 5))
        .toEqual(['valid']);
    });
  });

  describe('humanWait', () => {
    it('waits within expected range based on multiplier', async () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const start = Date.now();
      await rc.humanWait(1000);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(800);
      expect(elapsed).toBeLessThan(1200);
    });

    it('respects minDelayMs/maxDelayMs options', async () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const start = Date.now();
      await rc.humanWait(100, { minDelayMs: 50, maxDelayMs: 80 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(100);
    });

    it('does not wait if minDelayMs is 0', async () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const start = Date.now();
      await rc.humanWait(100, { minDelayMs: 0, maxDelayMs: 0 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('humanClick', () => {
    it('clicks the element', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanClick('.my-button');

      expect(page.locator).toHaveBeenCalledWith('.my-button');
      expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 10000 });
      expect(mockLocator.click).toHaveBeenCalled();
    });

    it('applies hover before click when hoverBefore is true', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanClick('.my-button', { hoverBefore: true, hoverDurationMs: 200 });

      expect(mockLocator.hover).toHaveBeenCalled();
      expect(mockLocator.click).toHaveBeenCalled();
    });
  });

  describe('humanType', () => {
    it('types text character by character', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanType('.my-input', 'hello');

      expect(page.locator).toHaveBeenCalledWith('.my-input');
      expect(mockLocator.waitFor).toHaveBeenCalled();
      expect(mockLocator.type).toHaveBeenCalledWith('h');
      expect(mockLocator.type).toHaveBeenCalledWith('e');
      expect(mockLocator.type).toHaveBeenCalledWith('l');
      expect(mockLocator.type).toHaveBeenCalledWith('l');
      expect(mockLocator.type).toHaveBeenCalledWith('o');
    });

    it('clears before typing by default', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanType('.my-input', 'test');

      expect(mockLocator.clear).toHaveBeenCalled();
    });

    it('does not clear when clearBefore is false', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanType('.my-input', 'test', { clearBefore: false });

      expect(mockLocator.clear).not.toHaveBeenCalled();
    });
  });

  describe('humanHover', () => {
    it('hovers the element', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanHover('.my-element');

      expect(page.locator).toHaveBeenCalledWith('.my-element');
      expect(mockLocator.waitFor).toHaveBeenCalled();
      expect(mockLocator.hover).toHaveBeenCalled();
    });
  });

  describe('humanSelect', () => {
    it('selects option by value', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanSelect('.my-select', 'option1');

      expect(page.locator).toHaveBeenCalledWith('.my-select');
      expect(mockLocator.selectOption).toHaveBeenCalledWith('option1');
    });
  });

  describe('humanUpload', () => {
    it('sets input files', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanUpload('.my-upload', '/path/to/file.mp4');

      expect(page.locator).toHaveBeenCalledWith('.my-upload');
      expect(mockLocator.setInputFiles).toHaveBeenCalledWith('/path/to/file.mp4');
    });
  });

  describe('humanScroll', () => {
    it('calls page.evaluate for scroll', async () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanScroll('top');

      expect(page.evaluate).toHaveBeenCalled();
    });

    it('calls page.evaluate for scroll to bottom', async () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanScroll('bottom');

      expect(page.evaluate).toHaveBeenCalled();
    });
  });

  describe('humanDrag', () => {
    it('drags from source to target', async () => {
      const { page, mockLocator } = createMockPage();
      const rc = new PageRiskControl(page);

      await rc.humanDrag('.source', '.target');

      expect(mockLocator.dragTo).toHaveBeenCalled();
    });
  });

  describe('humanRead', () => {
    it('waits based on duration and coefficient', async () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const start = Date.now();
      await rc.humanRead(1000, { readTimeCoeff: { min: 1.0, max: 1.0 } });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(1200);
    });
  });

  describe('delay ranges are respected', () => {
    it('randomInt returns values within range', () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const results = Array.from({ length: 20 }, () => rc.randomInt(100, 200));
      const allInRange = results.every(v => v >= 100 && v <= 200);
      expect(allInRange).toBe(true);
    });

    it('randomInt handles equal min/max', () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const results = Array.from({ length: 10 }, () => rc.randomInt(50, 50));
      const allEqual = results.every(v => v === 50);
      expect(allEqual).toBe(true);
    });

    it('randomInt handles reversed min/max', () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page);

      const result = rc.randomInt(300, 100);
      expect(result).toBeGreaterThanOrEqual(100);
      expect(result).toBeLessThanOrEqual(300);
    });
  });

  describe('configuration options', () => {
    it('accepts custom typingDelayMs', () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page, {
        typingDelayMs: { min: 500, max: 800 },
      });

      expect(rc).toBeInstanceOf(PageRiskControl);
    });

    it('accepts custom clickDelayMs', () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page, {
        clickDelayMs: { min: 300, max: 600 },
      });

      expect(rc).toBeInstanceOf(PageRiskControl);
    });

    it('accepts stepIntervalSec configuration', () => {
      const { page } = createMockPage();
      const rc = new PageRiskControl(page, {
        stepIntervalSec: { min: 1.0, max: 5.0 },
      });

      expect(rc).toBeInstanceOf(PageRiskControl);
    });
  });
});