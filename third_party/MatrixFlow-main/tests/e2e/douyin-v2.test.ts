import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'patchright';
import { DOUYIN_URLS } from '@electron/platform/douyin/selectors';
import { uploadVideo } from '@electron/platform/douyin/upload';
import { qrCodeLogin } from '@electron/platform/douyin/login';
import { getCookiePath } from '@electron/platform/douyin/cookie';

const TEST_TIMEOUT = 300000;
const HEADLESS = process.env.E2E_HEADLESS === 'true';

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

describe('抖音 E2E 测试', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const testAccountId = 'test_account_e2e';

  beforeAll(async () => {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: HEADLESS,
      args: CHROME_ARGS,
    });
    context = await browser.newContext();
    page = await context.newPage();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await context.close();
    await browser.close();
  });

  describe('Happy Path', () => {
    it.skip('should complete full publish flow (requires real credentials)', async () => {
      const result = await uploadVideo({
        videoPath: '/tmp/test_video.mp4',
        title: 'E2E 测试视频',
        description: '这是一个 E2E 测试',
        tags: ['测试', 'E2E'],
        accountId: testAccountId,
        headless: HEADLESS,
      });

      expect(result.success).toBe(true);
      expect(result.videoId).toBeDefined();
    }, TEST_TIMEOUT);
  });

  describe('Mock Flow', () => {
    it('should navigate to upload page', async () => {
      await page.goto(DOUYIN_URLS.upload);
      const url = page.url();
      expect(url).toContain('douyin.com');
    });

    it('should detect login requirement when no cookie', async () => {
      const cookiePath = getCookiePath('nonexistent_account');
      const cookieExists = require('fs').existsSync(cookiePath);
      expect(cookieExists).toBe(false);
    });

    it('should handle missing video file gracefully', async () => {
      const result = await uploadVideo({
        videoPath: '/nonexistent/video.mp4',
        title: '测试',
        accountId: testAccountId,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('视频文件不存在');
    });

    it('should handle missing cookie gracefully', async () => {
      const result = await uploadVideo({
        videoPath: '/tmp/test.mp4',
        title: '测试',
        accountId: 'nonexistent_account_12345',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cookie 文件不存在');
    });
  });

  describe('Schedule Function', () => {
    it('should validate schedule date correctly', async () => {
      const { validateScheduleDate } = await import('@electron/platform/douyin/schedule');

      const pastDate = new Date(Date.now() - 1000);
      const pastResult = validateScheduleDate(pastDate);
      expect(pastResult.valid).toBe(false);
      expect(pastResult.message).toContain('必须晚于当前时间');

      const nearFuture = new Date(Date.now() + 30 * 60 * 1000);
      const nearResult = validateScheduleDate(nearFuture);
      expect(nearResult.valid).toBe(false);
      expect(nearResult.message).toContain('至少提前');

      const farFuture = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const farResult = validateScheduleDate(farFuture);
      expect(farResult.valid).toBe(false);
      expect(farResult.message).toContain('最多支持');

      const validDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const validResult = validateScheduleDate(validDate);
      expect(validResult.valid).toBe(true);
    });
  });
});
