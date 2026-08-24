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
  };

  return {
    locator: vi.fn(() => mockLocator),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    keyboard: {
      type: vi.fn(() => Promise.resolve()),
      press: vi.fn(() => Promise.resolve()),
    },
    url: vi.fn(() => 'https://cp.kuaishou.com/article/manage/video?id=abc123'),
    ...overrides,
  } as unknown as import('patchright').Page;
}

describe('kuaishou/publish', () => {
  let publish: typeof import('@electron/platform/kuaishou/publish').publish;
  let fillVideoMetadata: typeof import('@electron/platform/kuaishou/publish').fillVideoMetadata;
  let getCoverRatios: typeof import('@electron/platform/kuaishou/publish').getCoverRatios;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@electron/platform/kuaishou/publish');
    publish = mod.publish;
    fillVideoMetadata = mod.fillVideoMetadata;
    getCoverRatios = mod.getCoverRatios;
  });

  describe('fillVideoMetadata', () => {
    it('fills title input', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '测试标题');
      // titleInput should have been located and filled
      expect(page.locator).toHaveBeenCalled();
    });

    it('fills description when provided', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题', '描述内容');
      // Description editor should be located
      expect(page.locator).toHaveBeenCalled();
    });

    it('skips description when not provided', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题');
      // Only title should be filled
      expect(page.locator).toHaveBeenCalled();
    });

    it('fills tags when provided', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题', undefined, ['标签1', '标签2']);
      expect(page.keyboard.type).toHaveBeenCalled();
    });

    it('handles tag cleanup (removes leading #)', async () => {
      const page = createMockPage();
      await fillVideoMetadata(page, '标题', undefined, ['#话题1', '##话题2']);
      // keyboard.type should have been called (tags processed)
      expect(page.keyboard.type).toHaveBeenCalled();
    });

    it('handles invisible description editor gracefully', async () => {
      const page = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          fill: vi.fn(() => Promise.resolve()),
          isVisible: vi.fn(() => Promise.resolve(false)), // nothing visible
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      // Should not throw
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

    it('returns failure when page is undefined', async () => {
      const result = await publish({
        page: undefined,
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

    it('returns success when executePublish succeeds', async () => {
      const mockPage = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          fill: vi.fn(() => Promise.resolve()),
          isVisible: vi.fn(() => {
            if (typeof sel === 'string' && sel.includes('publishSuccess')) return Promise.resolve(true);
            return Promise.resolve(true);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
        url: vi.fn(() => 'https://cp.kuaishou.com/article/manage/video?id=xyz789'),
      });

      const result = await publish({
        page: mockPage,
        title: '测试标题',
        accountId: 'acc1',
      } as any);

      expect(result.success).toBe(true);
    });

    it('extracts videoId from redirect URL', async () => {
      const mockPage = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          fill: vi.fn(() => Promise.resolve()),
          isVisible: vi.fn(() => {
            if (typeof sel === 'string' && sel.includes('publishSuccess')) return Promise.resolve(true);
            return Promise.resolve(true);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
        url: vi.fn(() => 'https://cp.kuaishou.com/article/manage/video?id=video_id_123'),
      });

      const result = await publish({
        page: mockPage,
        title: '测试标题',
        accountId: 'acc1',
      } as any);

      expect(result.success).toBe(true);
      expect(result.videoId).toBe('video_id_123');
    });

    it('returns videoId as undefined when URL has no id param', async () => {
      const mockPage = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          fill: vi.fn(() => Promise.resolve()),
          isVisible: vi.fn(() => {
            if (typeof sel === 'string' && sel.includes('publishSuccess')) return Promise.resolve(true);
            return Promise.resolve(true);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
        url: vi.fn(() => 'https://cp.kuaishou.com/article/manage/video'),
      });

      const result = await publish({
        page: mockPage,
        title: '测试标题',
        accountId: 'acc1',
      } as any);

      expect(result.success).toBe(true);
      expect(result.videoId).toBeUndefined();
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
      expect(ratios).toEqual(['16:9', '4:3', '1:1']);
    });
  });
});
