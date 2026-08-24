import type { Page } from 'patchright';
import { chromium } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS, DOUYIN_URLS } from './selectors';
import { getCookiePath, cookieExists } from './cookie';
import type { PublishContext, PublishResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { toPlatformError } from '../base/PlatformError';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { getDebugRecorder } from '../base/DebugRecorder';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('DouyinPublish');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

export async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });

  const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
  await titleInput.waitFor({ state: 'visible', timeout: 10000 });
  await rc.humanClick(UPLOAD_SELECTORS.titleInput);
  await rc.humanType(UPLOAD_SELECTORS.titleInput, title);
  logger.info(`标题已填写: ${title}`);

  if (description) {
    const descInput = page.locator(UPLOAD_SELECTORS.descriptionEditor);
    const hasDesc = await descInput.count();
    if (hasDesc) {
      await rc.humanClick(UPLOAD_SELECTORS.descriptionEditor);
      await rc.humanType(UPLOAD_SELECTORS.descriptionEditor, description);
      logger.info('描述已填写');
    }
  }

  if (tags && tags.length > 0) {
    const tagInput = page.locator(UPLOAD_SELECTORS.addTagDropdown);
    const hasTagInput = await tagInput.count();
    if (hasTagInput) {
      for (const tag of tags) {
        await rc.humanClick(UPLOAD_SELECTORS.addTagDropdown);
        await rc.humanType(UPLOAD_SELECTORS.addTagDropdown, tag);
        await page.waitForTimeout(500);
        await rc.humanClick(UPLOAD_SELECTORS.tagOption);
        await page.waitForTimeout(300);
        logger.info(`标签已添加: ${tag}`);
      }
    }
  }
}

async function handleCoverPrompt(page: Page): Promise<boolean> {
  const coverPrompt = page.getByText('请设置封面后再发布', { exact: false });
  const isVisible = await coverPrompt.isVisible().catch(() => false);

  if (!isVisible) {
    return false;
  }

  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
  });
  logger.info('检测到封面提示，自动选择推荐封面');

  const recommendCover = page.locator("[class^='recommendCover-']").first();
  if (await recommendCover.isVisible().catch(() => false)) {
    await rc.humanClick("[class^='recommendCover-']");
    await page.waitForTimeout(500);

    const confirmBtn = page.getByRole('button', { name: '确定' });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await rc.humanClick('button:has-text("确定")');
      logger.info('封面已设置');
      return true;
    }
  }

  return false;
}

async function executePublish(page: Page, maxRetries: number = 3): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });
  for (let retry = 0; retry < maxRetries; retry++) {
    // 发布前暂停，等待页面渲染稳定
    logger.info(`⏸ 发布前等待 ${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS} 秒...`);
    await page.waitForTimeout(PRE_PUBLISH_CONFIRMATION_DELAY_MS);

    const publishBtn = page.getByRole('button', { name: '发布', exact: true });
    await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
    await rc.humanClick('button:has-text("发布")');
    logger.info(`发布按钮已点击（第 ${retry + 1} 次）`);

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('content/manage')) {
      logger.info('发布成功：已跳转到管理页');
      return true;
    }

    const successText = page.locator('text=/发布成功|提交成功/');
    if (await successText.isVisible().catch(() => false)) {
      logger.info('发布成功：检测到成功文本');
      return true;
    }

    if (await handleCoverPrompt(page)) {
      continue;
    }

    const failedText = page.getByText('发布失败', { exact: false });
    if (await failedText.isVisible().catch(() => false)) {
      logger.warn('发布失败，正在重试...');
      await page.waitForTimeout(1000);
      continue;
    }
  }

  return false;
}

/**
 * 抖音发布操作
 * 支持：传入 page 直接操作，或不传 page 自动创建浏览器
 */
export async function publish(ctx: PublishContext): Promise<PublishResult> {
  const { page: existingPage, accountId, title, description, tags, scheduledTime } = ctx;

  if (existingPage) {
    return executePublishOnPage(existingPage, title, description, tags, scheduledTime, ctx.dryRun, ctx.accountId, ctx.videoId);
  }

  if (!accountId) {
    return { success: false, message: '缺少 accountId，无法自动创建浏览器' };
  }

  const cookiePath = getCookiePath(accountId);
  if (!cookieExists(cookiePath)) {
    return { success: false, message: `Cookie 文件不存在: ${cookiePath}` };
  }

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`douyin_${accountId}_${Date.now()}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: CHROME_ARGS });
  const context = await browser.newContext({ storageState: cookiePath });

  try {
    const page = await context.newPage();
    const pageCtx = { page, accountId };
    await debugRecorder.recordStep('goto_upload_page', async () => {
      await page.goto(DOUYIN_URLS.upload, { waitUntil: 'domcontentloaded' });
    }, pageCtx);
    return await executePublishOnPage(page, title, description, tags, scheduledTime, ctx.dryRun, ctx.accountId, ctx.videoId);
  } catch (error) {
    const pErr = toPlatformError(error, 'douyin');
    return { success: false, message: pErr.message };
  }
}

async function executePublishOnPage(
  page: Page,
  title: string,
  description?: string,
  tags?: string[],
  scheduledTime?: Date,
  dryRun?: boolean,
  accountId?: string,
  videoId?: string
): Promise<PublishResult> {
  const debugRecorder = getDebugRecorder();
  const pageCtx = { page, accountId };

  try {
    const sanitizedTags = TopicSanitizer.cleanTopics(tags ?? [], {
      maxTopics: 5,
      platform: 'douyin',
    });
    const limitedTags = TopicSanitizer.limitTopics(sanitizedTags, 5);
    await debugRecorder.recordStep('fill_video_metadata', async () => {
      await fillVideoMetadata(page, title, description, limitedTags);
    }, pageCtx);

    if (scheduledTime) {
      logger.warn('抖音定时发布请使用 schedule 方法');
    }

    if (dryRun) {
      logger.info(`[DRY RUN] Skipping final publish for ${accountId ?? 'unknown'}`);
      return {
        success: true,
        message: '[DEBUG] 预发布模式：已跳过最终发布按钮',
        videoId,
      };
    }

    await debugRecorder.recordStep('wait_upload_complete', async () => {}, pageCtx);
    const success = await debugRecorder.recordStep('execute_publish', async () => {
      return await executePublish(page);
    }, pageCtx);

    if (success) {
      await debugRecorder.recordStep('extract_video_id', async () => {}, pageCtx);
      const currentUrl = page.url();
      const videoId = extractVideoId(currentUrl);
      return { success: true, message: '视频发布成功', videoId };
    } else {
      return { success: false, message: '视频发布失败，请检查是否有未填写的必填项' };
    }
  } catch (error) {
    const pErr = toPlatformError(error, 'douyin');
    return { success: false, message: pErr.message };
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/content\/manage\?.*item_ids=([^&]+)/);
  return match ? match[1] : undefined;
}

export function getCoverRatios(): string[] {
  return ['16:9', '4:3', '3:4'];
}
