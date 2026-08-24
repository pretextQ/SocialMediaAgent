import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('xiaohongshu/schedule', () => {
  let schedule: typeof import('@electron/platform/xiaohongshu/schedule').schedule;
  let validateScheduleDate: typeof import('@electron/platform/xiaohongshu/schedule').validateScheduleDate;
  let isScheduledPublishSupported: typeof import('@electron/platform/xiaohongshu/schedule').isScheduledPublishSupported;
  let getScheduleConfig: typeof import('@electron/platform/xiaohongshu/schedule').getScheduleConfig;
  let XIAOHONGSHU_CONFIG: typeof import('@electron/platform/xiaohongshu/schedule').XIAOHONGSHU_CONFIG;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@electron/platform/xiaohongshu/schedule');
    schedule = mod.schedule;
    validateScheduleDate = mod.validateScheduleDate;
    isScheduledPublishSupported = mod.isScheduledPublishSupported;
    getScheduleConfig = mod.getScheduleConfig;
    XIAOHONGSHU_CONFIG = mod.XIAOHONGSHU_CONFIG;
  });

  describe('XIAOHONGSHU_CONFIG', () => {
    it('should have maxScheduleDays equal to 0', () => {
      expect(XIAOHONGSHU_CONFIG.maxScheduleDays).toBe(0);
    });

    it('should have supportsScheduledPublish equal to false', () => {
      expect(XIAOHONGSHU_CONFIG.supportsScheduledPublish).toBe(false);
    });
  });

  describe('validateScheduleDate', () => {
    it('should throw ValidationError when scheduledTime is provided', () => {
      const futureDate = new Date(Date.now() + 86400000);
      expect(() => validateScheduleDate(futureDate)).toThrow('小红书不支持定时发布');
    });

    it('should not throw when scheduledTime is undefined', () => {
      expect(() => validateScheduleDate(undefined)).not.toThrow();
    });

    it('should not throw when scheduledTime is null', () => {
      expect(() => validateScheduleDate(null as any)).not.toThrow();
    });
  });

  describe('isScheduledPublishSupported', () => {
    it('should always return false', () => {
      expect(isScheduledPublishSupported()).toBe(false);
    });
  });

  describe('getScheduleConfig', () => {
    it('should return config with maxScheduleDays equal to 0', () => {
      const config = getScheduleConfig();
      expect(config.maxScheduleDays).toBe(0);
      expect(config.supportsScheduledPublish).toBe(false);
    });

    it('should return a copy of the config', () => {
      const config1 = getScheduleConfig();
      const config2 = getScheduleConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('schedule', () => {
    it('should return failure when scheduledTime is provided', async () => {
      const mockPage = {
        locator: vi.fn(() => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          fill: vi.fn(() => Promise.resolve()),
          isVisible: vi.fn(() => Promise.resolve(true)),
          first: vi.fn(function(this: any) { return this; }),
        })),
      } as any;

      const result = await schedule({
        page: mockPage,
        title: '测试标题',
        description: '测试描述',
        tags: ['标签1'],
        scheduledTime: new Date(Date.now() + 86400000),
        accountId: 'acc1',
        videoId: 'vid1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('小红书不支持定时发布');
    });

    it('should return failure when scheduledTime is undefined but page is provided', async () => {
      const mockPage = {
        locator: vi.fn(() => ({
          waitFor: vi.fn(() => Promise.resolve()),
          click: vi.fn(() => Promise.resolve()),
          fill: vi.fn(() => Promise.resolve()),
          isVisible: vi.fn(() => Promise.resolve(true)),
          first: vi.fn(function(this: any) { return this; }),
        })),
      } as any;

      const result = await schedule({
        page: mockPage,
        title: '测试标题',
        scheduledTime: undefined,
        accountId: 'acc1',
        videoId: 'vid1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('小红书不支持定时发布');
    });
  });
});
