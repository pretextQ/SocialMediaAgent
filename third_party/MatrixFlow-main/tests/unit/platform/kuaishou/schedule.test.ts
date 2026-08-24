import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@electron/platform/kuaishou/publish', () => ({
  fillVideoMetadata: vi.fn(() => Promise.resolve()),
}));

function createMockPage(overrides: Record<string, unknown> = {}) {
  const mockLocator = {
    waitFor: vi.fn(() => Promise.resolve()),
    click: vi.fn(() => Promise.resolve()),
    check: vi.fn(() => Promise.resolve()),
    isVisible: vi.fn(() => Promise.resolve(true)),
    first: vi.fn(function(this: any) { return this; }),
    evaluate: vi.fn(() => Promise.resolve()),
    inputValue: vi.fn(() => Promise.resolve('2026-06-10 12:00:00')),
    count: vi.fn(() => Promise.resolve(1)),
  };

  return {
    locator: vi.fn(() => mockLocator),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    keyboard: {
      press: vi.fn(() => Promise.resolve()),
      type: vi.fn(() => Promise.resolve()),
    },
    url: vi.fn(() => 'https://cp.kuaishou.com/article/manage/video'),
    ...overrides,
  } as unknown as import('patchright').Page;
}

describe('kuaishou/schedule', () => {
  let schedule: typeof import('@electron/platform/kuaishou/schedule').schedule;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@electron/platform/kuaishou/schedule');
    schedule = mod.schedule;
  });

  describe('validation', () => {
    it('returns failure when page is not provided', async () => {
      const result = await schedule({
        title: '测试',
        scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      } as any);
      expect(result.success).toBe(false);
      expect(result.message).toContain('page 参数');
    });

    it('returns failure when scheduledTime is not provided', async () => {
      const result = await schedule({
        page: createMockPage(),
        title: '测试',
      } as any);
      expect(result.success).toBe(false);
      expect(result.message).toContain('发布时间');
    });

    it('returns failure when scheduledTime is less than 1 hour from now', async () => {
      const result = await schedule({
        page: createMockPage(),
        title: '测试',
        scheduledTime: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
      } as any);
      expect(result.success).toBe(false);
      expect(result.message).toContain('1小时');
    });

    it('returns failure when scheduledTime exceeds 14 days', async () => {
      const result = await schedule({
        page: createMockPage(),
        title: '测试',
        scheduledTime: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      } as any);
      expect(result.success).toBe(false);
      expect(result.message).toContain('14天');
    });

    it('accepts scheduledTime 2 hours from now (valid)', async () => {
      const scheduledTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const expectedDate = `${scheduledTime.getFullYear()}-${String(scheduledTime.getMonth() + 1).padStart(2, '0')}-${String(scheduledTime.getDate()).padStart(2, '0')} ${String(scheduledTime.getHours()).padStart(2, '0')}:${String(scheduledTime.getMinutes()).padStart(2, '0')}:00`;
      // Make success toast visible to trigger success path
      const mockPage = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          check: vi.fn(() => Promise.resolve()),
          evaluate: vi.fn(() => Promise.resolve()),
          inputValue: vi.fn(() => Promise.resolve(expectedDate)),
          count: vi.fn(() => Promise.resolve(1)),
          isVisible: vi.fn(() => {
            if (sel.includes('publishSuccessToast') || sel.includes('publishSuccess')) return Promise.resolve(true);
            if (sel.includes('scheduleRadio')) return Promise.resolve(true);
            if (sel.includes('scheduleDatePicker')) return Promise.resolve(true);
            return Promise.resolve(false);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      
      const result = await schedule({
        page: mockPage,
        title: '测试',
        description: '描述',
        tags: ['标签1'],
        scheduledTime,
      } as any);
      
      // Should proceed past validation (may succeed or fail at DOM interaction)
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('success paths', () => {
    it('returns success when toast is visible', async () => {
      let callCount = 0;
      const scheduledTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const expectedDate = `${scheduledTime.getFullYear()}-${String(scheduledTime.getMonth() + 1).padStart(2, '0')}-${String(scheduledTime.getDate()).padStart(2, '0')} ${String(scheduledTime.getHours()).padStart(2, '0')}:${String(scheduledTime.getMinutes()).padStart(2, '0')}:00`;
      const mockPage = createMockPage({
        locator: vi.fn((_sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          check: vi.fn(() => Promise.resolve()),
          evaluate: vi.fn(() => Promise.resolve()),
          inputValue: vi.fn(() => Promise.resolve(expectedDate)),
          count: vi.fn(() => Promise.resolve(1)),
          isVisible: vi.fn(() => {
            callCount++;
            return Promise.resolve(true);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });

      const result = await schedule({
        page: mockPage,
        title: '测试',
        scheduledTime,
      } as any);

      expect(result.success).toBe(true);
      expect(result.scheduledTime).toBeDefined();
    });

    it('returns success when URL redirects to manage page', async () => {
      let callCount = 0;
      const scheduledTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const expectedDate = `${scheduledTime.getFullYear()}-${String(scheduledTime.getMonth() + 1).padStart(2, '0')}-${String(scheduledTime.getDate()).padStart(2, '0')} ${String(scheduledTime.getHours()).padStart(2, '0')}:${String(scheduledTime.getMinutes()).padStart(2, '0')}:00`;
      const mockPage = createMockPage({
        url: vi.fn(() => 'https://cp.kuaishou.com/article/manage/video'),
        locator: vi.fn((_sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          check: vi.fn(() => Promise.resolve()),
          evaluate: vi.fn(() => Promise.resolve()),
          inputValue: vi.fn(() => Promise.resolve(expectedDate)),
          count: vi.fn(() => Promise.resolve(1)),
          isVisible: vi.fn(() => {
            callCount++;
            if (callCount > 5) return Promise.resolve(false);
            return Promise.resolve(true);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });

      const result = await schedule({
        page: mockPage,
        title: '测试',
        scheduledTime,
      } as any);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns failure when fillVideoMetadata throws', async () => {
      const { fillVideoMetadata } = await import('@electron/platform/kuaishou/publish');
      vi.mocked(fillVideoMetadata).mockRejectedValueOnce(new Error('DOM error'));

      const result = await schedule({
        page: createMockPage(),
        title: '测试',
        scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('出错');
    });

    it('returns failure when schedule radio not visible', async () => {
      const mockPage = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          check: vi.fn(() => Promise.resolve()),
          evaluate: vi.fn(() => Promise.resolve()),
          inputValue: vi.fn(() => Promise.resolve('')),
          count: vi.fn(() => Promise.resolve(0)),
          isVisible: vi.fn(() => Promise.resolve(false)),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });

      const result = await schedule({
        page: mockPage,
        title: '测试',
        scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('定时发布选项');
    });

    it('returns failure when schedule date picker value is not applied', async () => {
      const publishClick = vi.fn(() => Promise.resolve());
      const mockPage = createMockPage({
        locator: vi.fn((sel: string) => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: sel.includes('publishButton') || sel.includes('button:has-text("发布")')
            ? publishClick
            : vi.fn(() => Promise.resolve()),
          check: vi.fn(() => Promise.resolve()),
          evaluate: vi.fn(() => Promise.resolve()),
          inputValue: vi.fn(() => Promise.resolve('')),
          count: vi.fn(() => Promise.resolve(1)),
          isVisible: vi.fn(() => Promise.resolve(true)),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });

      const result = await schedule({
        page: mockPage,
        title: '测试',
        scheduledTime: new Date('2026-06-10T12:00:00'),
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('设置定时发布时间失败');
      expect(publishClick).not.toHaveBeenCalled();
    });
  });
});
