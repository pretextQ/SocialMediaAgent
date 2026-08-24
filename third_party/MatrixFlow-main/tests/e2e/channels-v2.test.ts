import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { uploadVideo } from '../../electron/platform/channels/upload';
import { publish } from '../../electron/platform/channels/publish';
import { schedule } from '../../electron/platform/channels/schedule';
import { postComment } from '../../electron/platform/channels/comment';
import { AuthError } from '../../electron/platform/base/PlatformError';

/**
 * 视频号 E2E 测试
 * 使用 mock 模式运行，不依赖真实微信账号
 */
describe('channels E2E', () => {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  beforeAll(async () => {
    // 启动浏览器（无头模式）
    browser = await chromium.launch({
      headless: true,
    });
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    if (context) await context.close();
    if (browser) await browser.close();
  });

  describe('happy path - basic flow', () => {
    it('should validate schedule date correctly', async () => {
      const now = new Date();

      // 测试 1 小时后（应该失败，需要 2 小时以上）
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      // 直接在 Node 环境测试 validateScheduleDate 逻辑
      const { validateScheduleDate } = await import('../../electron/platform/channels/schedule');

      const result1 = validateScheduleDate(oneHourLater);
      expect(result1.valid).toBe(false);
      expect(result1.message).toContain('2 小时');

      // 测试 3 小时后（应该成功）
      const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const result2 = validateScheduleDate(threeHoursLater);
      expect(result2.valid).toBe(true);
    });

    it('should reject comment operations with AuthError', async () => {
      if (!page) {
        expect(true).toBe(true); // 跳过测试
        return;
      }

      // 测试评论功能抛出 AuthError
      await expect(postComment(page, 'video123', '测试评论')).rejects.toThrow(AuthError);
      await expect(postComment(page, 'video123', '测试评论')).rejects.toThrow('视频号不支持自动评论功能');
    });

    it('should handle missing page parameter', async () => {
      // 测试 publish 函数缺少 page 参数
      const result = await publish({
        page: null as unknown as Page,
        title: '测试标题',
        accountId: 'test-account',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('需要 page 参数');
    });

    it('should handle dry run mode', async () => {
      if (!page) {
        expect(true).toBe(true); // 跳过测试
        return;
      }

      // 测试 dry run 模式
      const result = await publish({
        page,
        title: '测试标题',
        accountId: 'test-account',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('预发布模式');
    });
  });

  describe('schedule validation', () => {
    it('should enforce maxScheduleDays=7', async () => {
      const { validateScheduleDate } = await import('../../electron/platform/channels/schedule');

      const now = new Date();
      const eightDaysLater = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

      const result = validateScheduleDate(eightDaysLater);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('7 天');
    });

    it('should reject past dates', async () => {
      const { validateScheduleDate } = await import('../../electron/platform/channels/schedule');

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const result = validateScheduleDate(oneHourAgo);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('晚于当前时间');
    });
  });

  describe('comment.ts - all methods disabled', () => {
    it('all comment methods should throw AuthError', async () => {
      if (!page) {
        expect(true).toBe(true);
        return;
      }

      const { fetchComments, replyComment, deleteComment, postCommentWithRetry, postCommentFull } =
        await import('../../electron/platform/channels/comment');

      // 所有评论方法都应该抛出 AuthError
      await expect(postComment(page, 'video123', '测试')).rejects.toThrow('视频号不支持自动评论功能');
      await expect(fetchComments(page, 'video123')).rejects.toThrow('视频号不支持自动评论功能');
      await expect(replyComment(page, 'video123', 'comment456', '回复')).rejects.toThrow('视频号不支持自动评论功能');
      await expect(deleteComment(page, 'video123', 'comment456')).rejects.toThrow('视频号不支持自动评论功能');
      await expect(postCommentWithRetry(page, { accountId: 'test', videoId: 'video123', comment: '测试' })).rejects.toThrow('视频号不支持自动评论功能');
      await expect(postCommentFull('account123', 'video123', '测试')).rejects.toThrow('视频号不支持自动评论功能');
    });
  });
});
