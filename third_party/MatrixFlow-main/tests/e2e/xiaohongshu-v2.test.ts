import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'patchright';
import type { Browser, BrowserContext, Page } from 'patchright';
import { uploadVideo } from '@electron/platform/xiaohongshu/upload';
import { publish } from '@electron/platform/xiaohongshu/publish';
import { schedule, validateScheduleDate } from '@electron/platform/xiaohongshu/schedule';

describe('xiaohongshu E2E', () => {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  beforeAll(async () => {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
    });
    context = await browser.newContext();
  });

  afterAll(async () => {
    if (context) await context.close();
    if (browser) await browser.close();
  });

  describe('schedule', () => {
    it('should enforce maxScheduleDays=0 and reject scheduled publish', async () => {
      const page = await context!.newPage();

      const result = await schedule({
        page,
        title: '测试标题',
        description: '测试描述',
        tags: ['测试'],
        scheduledTime: new Date(Date.now() + 86400000),
        accountId: 'test_account',
        videoId: 'test_video',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('小红书不支持定时发布');

      await page.close();
    });

    it('should throw ValidationError when validateScheduleDate is called with a date', () => {
      expect(() => {
        validateScheduleDate(new Date(Date.now() + 86400000));
      }).toThrow('小红书不支持定时发布');
    });

    it('should not throw when validateScheduleDate is called without a date', () => {
      expect(() => {
        validateScheduleDate(undefined);
      }).not.toThrow();
    });
  });

  describe('publish', () => {
    it('happy path - should require page parameter', async () => {
      const result = await publish({
        title: '测试标题',
        description: '测试描述',
        tags: ['测试标签'],
        accountId: 'test_account',
        videoId: 'test_video',
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('page 参数');
    });

    it('happy path - dryRun mode should return success without publishing', async () => {
      const page = await context!.newPage();

      const result = await publish({
        page,
        title: '测试标题',
        description: '测试描述',
        tags: ['测试标签'],
        accountId: 'test_account',
        videoId: 'test_video',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('预发布');

      await page.close();
    });
  });

  describe('uploadVideo', () => {
    it('should fail when video file does not exist', async () => {
      const result = await uploadVideo({
        videoPath: '/nonexistent/path/video.mp4',
        title: '测试标题',
        accountId: 'test_account',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('视频文件不存在');
    });
  });
});
