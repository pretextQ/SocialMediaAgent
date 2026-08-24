import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@electron/platform/kuaishou/cookie', () => ({
  getCookiePath: vi.fn(() => '/tmp/cookies/kuaishou/test.json'),
  cookieExists: vi.fn(),
}));

function createMockPageWithStats(statTexts: string[]) {
  const mockStatCards = statTexts.map(text => ({
    textContent: vi.fn(() => Promise.resolve(text)),
  }));

  return {
    goto: vi.fn(() => Promise.resolve()),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    locator: vi.fn((sel: string) => {
      if (typeof sel === 'string' && (sel.includes('stat-card') || sel.includes('statCard') || sel.includes('data-card'))) {
        return { all: vi.fn(() => Promise.resolve(mockStatCards)) };
      }
      return {
        isVisible: vi.fn(() => Promise.resolve(false)),
        first: vi.fn(function(this: any) { return this; }),
      };
    }),
    getByText: vi.fn((_text: string) => ({
      isVisible: vi.fn(() => Promise.resolve(false)),
    })),
  };
}

describe('kuaishou/stats', () => {
  let fetchStats: typeof import('@electron/platform/kuaishou/stats').fetchStats;
  let fetchVideoStats: typeof import('@electron/platform/kuaishou/stats').fetchVideoStats;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@electron/platform/kuaishou/stats');
    fetchStats = mod.fetchStats;
    fetchVideoStats = mod.fetchVideoStats;
  });

  describe('fetchStats', () => {
    it('returns zero stats with error when cookie does not exist', async () => {
      const { cookieExists } = await import('@electron/platform/kuaishou/cookie');
      vi.mocked(cookieExists).mockReturnValue(false);

      const result = await fetchStats('acc1', '7d' as any);
      expect(result.playCount).toBe(0);
      expect(result.likeCount).toBe(0);
      expect(result.commentCount).toBe(0);
      expect(result.shareCount).toBe(0);
      expect(result.collectCount).toBe(0);
      expect(result.error).toContain('Cookie 文件不存在');
      expect(result.fetchTime).toBeInstanceOf(Date);
    });

    it('returns stats with error when cookie is expired (login page shown)', async () => {
      const { cookieExists } = await import('@electron/platform/kuaishou/cookie');
      vi.mocked(cookieExists).mockReturnValue(true);

      const { chromium } = await import('patchright');
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        getByText: vi.fn((_text: string) => ({
          isVisible: vi.fn(() => Promise.resolve(true)), // login text visible
        })),
        locator: vi.fn(() => ({
          all: vi.fn(() => Promise.resolve([])),
        })),
      };

      vi.mocked(chromium.launch).mockResolvedValueOnce({
        newContext: vi.fn(() => Promise.resolve({
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          close: vi.fn(() => Promise.resolve()),
        })),
        close: vi.fn(() => Promise.resolve()),
      } as any);

      const result = await fetchStats('acc1', '7d' as any);
      expect(result.error).toContain('Cookie 已失效');
    });

    it('parses stat cards with Chinese number formats', async () => {
      const { cookieExists } = await import('@electron/platform/kuaishou/cookie');
      vi.mocked(cookieExists).mockReturnValue(true);

      const { chromium } = await import('patchright');
      const mockPage = createMockPageWithStats([
        '播放 1.5万',
        '点赞 234',
        '评论 1.2k',
        '分享 0',
        '收藏 5.6万',
      ]);

      vi.mocked(chromium.launch).mockResolvedValueOnce({
        newContext: vi.fn(() => Promise.resolve({
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          close: vi.fn(() => Promise.resolve()),
        })),
        close: vi.fn(() => Promise.resolve()),
      } as any);

      const result = await fetchStats('acc1', '7d' as any);
      expect(result.playCount).toBe(15000);
      expect(result.likeCount).toBe(234);
      expect(result.commentCount).toBe(1200);
      expect(result.shareCount).toBe(0);
      expect(result.collectCount).toBe(56000);
      expect(result.fetchTime).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('handles browser launch error', async () => {
      const { cookieExists } = await import('@electron/platform/kuaishou/cookie');
      vi.mocked(cookieExists).mockReturnValue(true);

      const { chromium } = await import('patchright');
      vi.mocked(chromium.launch).mockRejectedValueOnce(new Error('No Chrome'));

      await expect(fetchStats('acc1', '7d' as any)).rejects.toThrow('No Chrome');
    });

    it('handles empty stat cards', async () => {
      const { cookieExists } = await import('@electron/platform/kuaishou/cookie');
      vi.mocked(cookieExists).mockReturnValue(true);

      const { chromium } = await import('patchright');
      const mockPage = createMockPageWithStats([]);

      vi.mocked(chromium.launch).mockResolvedValueOnce({
        newContext: vi.fn(() => Promise.resolve({
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          close: vi.fn(() => Promise.resolve()),
        })),
        close: vi.fn(() => Promise.resolve()),
      } as any);

      const result = await fetchStats('acc1', '7d' as any);
      expect(result.playCount).toBe(0);
      expect(result.likeCount).toBe(0);
    });
  });

  describe('fetchVideoStats', () => {
    it('returns placeholder result with not implemented message', async () => {
      const result = await fetchVideoStats('vid1');
      expect(result.videoId).toBe('vid1');
      expect(result.playCount).toBe(0);
      expect(result.likeCount).toBe(0);
      expect(result.fetchTime).toBeInstanceOf(Date);
      expect(result.error).toContain('暂未完整实现');
    });
  });
});
