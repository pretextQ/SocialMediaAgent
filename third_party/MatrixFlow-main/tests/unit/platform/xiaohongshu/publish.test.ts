import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockPage(overrides: Record<string, unknown> = {}) {
  const mockLocator = {
    waitFor: vi.fn(() => Promise.resolve()),
    click: vi.fn(() => Promise.resolve()),
    hover: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    type: vi.fn(() => Promise.resolve()),
    fill: vi.fn(() => Promise.resolve()),
    isVisible: vi.fn(() => Promise.resolve(true)),
    first: vi.fn(function(this: any) { return this; }),
    count: vi.fn(() => 1),
    setInputFiles: vi.fn(() => Promise.resolve()),
  };

  return {
    locator: vi.fn(() => mockLocator),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    keyboard: {
      type: vi.fn(() => Promise.resolve()),
      press: vi.fn(() => Promise.resolve()),
    },
    url: vi.fn(() => 'https://creator.xiaohongshu.com/content/manage/detail/abc123'),
    ...overrides,
  } as unknown as import('patchright').Page;
}

describe('xiaohongshu/publish', () => {
  let publish: typeof import('@electron/platform/xiaohongshu/publish').publish;
  let fillVideoMetadata: typeof import('@electron/platform/xiaohongshu/publish').fillVideoMetadata;
  let getCoverRatios: typeof import('@electron/platform/xiaohongshu/publish').getCoverRatios;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('@electron/platform/xiaohongshu/publish');
    publish = mod.publish;
    fillVideoMetadata = mod.fillVideoMetadata;
    getCoverRatios = mod.getCoverRatios;
  });

  describe('fillVideoMetadata', () => {
    it('fills title input', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '测试标题');
      expect(page.locator).toHaveBeenCalled();
    });

    it('fills description when provided', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题', '描述内容');
      expect(page.locator).toHaveBeenCalled();
    });

    it('skips description when not provided', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题');
      expect(page.locator).toHaveBeenCalled();
    });

    it('fills tags when provided', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题', undefined, ['标签1', '标签2']);
      expect(page.locator).toHaveBeenCalled();
    });

    it('handles invisible description editor gracefully', async () => {
      const mockLocator = {
        waitFor: vi.fn(() => Promise.resolve()),
        click: vi.fn(() => Promise.resolve()),
        fill: vi.fn(() => Promise.resolve()),
        isVisible: vi.fn(() => Promise.resolve(false)),
        first: vi.fn(function(this: any) { return this; }),
        count: vi.fn(() => 1),
        clear: vi.fn(() => Promise.resolve()),
        type: vi.fn(() => Promise.resolve()),
      };
      const page = createMockPage({
        locator: vi.fn(() => mockLocator),
      });
      await expect(fillVideoMetadata(page, '标题', '描述')).resolves.toBeUndefined();
    });
  });

  describe('publish', () => {
    it('returns failure when page is null', async () => {
      const result = await publish({
        title: '测试',
        accountId: 'acc1',
      } as any);
      expect(result.success).toBe(false);
      expect(result.message).toContain('page 参数');
    });

    it('returns success in dryRun mode without clicking publish', async () => {
      const page = createMockPage();
      const result = await publish({
        page,
        title: '测试标题',
        description: '描述',
        tags: ['标签'],
        accountId: 'acc1',
        videoId: 'vid1',
        dryRun: true,
      } as any);

      expect(result.success).toBe(true);
      expect(result.message).toContain('预发布');
      expect(result.videoId).toBe('vid1');
    });

    it('handles errors gracefully', async () => {
      const mockPage = createMockPage({
        locator: vi.fn(() => {
          throw new Error('DOM broken');
        }),
      });

      const result = await publish({
        page: mockPage,
        title: '测试标题',
        accountId: 'acc1',
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('出错');
    });
  });

  describe('getCoverRatios', () => {
    it('returns expected cover ratios', () => {
      const ratios = getCoverRatios();
      expect(ratios).toEqual(['3:4']);
    });
  });
});
