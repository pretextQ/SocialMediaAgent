import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import type { PublishContext, PublishResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { toPlatformError, ValidationError, SelectorError, NetworkError } from '../base/PlatformError';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { getDebugRecorder } from '../base/DebugRecorder';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('XiaohongshuPublish');

export async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
    stepIntervalSec: { min: 1.5, max: 2.5 },
  });

  try {
    const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await rc.humanClick(UPLOAD_SELECTORS.titleInput);
    await rc.humanType(UPLOAD_SELECTORS.titleInput, title);
    logger.info(`标题已填写: ${title}`);
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'fill_title' });
  }

  if (description) {
    try {
      const descEditor = page.locator(UPLOAD_SELECTORS.descEditor).first();
      if (await descEditor.isVisible().catch(() => false)) {
        await rc.humanClick(UPLOAD_SELECTORS.descEditor);
        await rc.humanType(UPLOAD_SELECTORS.descEditor, description);
        logger.info('正文已填写');
      }
    } catch (error) {
      throw toPlatformError(error, 'xiaohongshu', { step: 'fill_description' });
    }
  }

  if (tags && tags.length > 0) {
    try {
      const topicInput = page.locator(UPLOAD_SELECTORS.topicInput).first();
      if (await topicInput.isVisible().catch(() => false)) {
        for (const tag of tags) {
          await rc.humanClick(UPLOAD_SELECTORS.topicInput);
          await rc.humanType(UPLOAD_SELECTORS.topicInput, `#${tag}`);
          await page.waitForTimeout(500);
          await rc.humanClick(UPLOAD_SELECTORS.topicSuggestion);
          await page.waitForTimeout(300);
          logger.info(`话题已添加: ${tag}`);
        }
      }
    } catch (error) {
      throw toPlatformError(error, 'xiaohongshu', { step: 'add_topics' });
    }
  }
}

async function handleCoverPrompt(page: Page): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
  });

  try {
    const coverBtn = page.locator(UPLOAD_SELECTORS.coverSelectBtn).first();
    if (!(await coverBtn.isVisible().catch(() => false))) {
      return false;
    }

    logger.info('检测到封面设置选项');
    await rc.humanClick(UPLOAD_SELECTORS.coverSelectBtn);
    await page.waitForTimeout(1000);

    const autoCover = page.locator(UPLOAD_SELECTORS.coverAutoSelect).first();
    if (await autoCover.isVisible().catch(() => false)) {
      await rc.humanClick(UPLOAD_SELECTORS.coverAutoSelect);
      await page.waitForTimeout(500);

      const confirmBtn = page.locator(UPLOAD_SELECTORS.coverConfirmBtn).first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await rc.humanClick(UPLOAD_SELECTORS.coverConfirmBtn);
        logger.info('封面已设置');
        return true;
      }
    }

    return false;
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'handle_cover' });
  }
}

async function executePublish(page: Page, maxRetries: number = 3): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
    stepIntervalSec: { min: 1.5, max: 2.5 },
  });

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      logger.info(`⏸ 发布前等待 ${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS} 秒...`);
      await page.waitForTimeout(PRE_PUBLISH_CONFIRMATION_DELAY_MS);

      const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
      await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
      await rc.humanClick(UPLOAD_SELECTORS.publishButton);
      logger.info(`发布按钮已点击（第 ${retry + 1} 次）`);

      await page.waitForTimeout(2000);

      const successToast = page.locator(UPLOAD_SELECTORS.publishSuccessToast);
      if (await successToast.isVisible().catch(() => false)) {
        logger.info('发布成功：检测到成功提示');
        return true;
      }

      const currentUrl = page.url();
      if (currentUrl.includes('/content/manage')) {
        logger.info('发布成功：已跳转到管理页');
        return true;
      }

      if (await handleCoverPrompt(page)) {
        continue;
      }

      const failedToast = page.locator(UPLOAD_SELECTORS.publishFailedToast);
      if (await failedToast.isVisible().catch(() => false)) {
        logger.warn('发布失败，正在重试...');
        await page.waitForTimeout(1000);
        continue;
      }
    } catch (error) {
      throw toPlatformError(error, 'xiaohongshu', { step: 'execute_publish', retry });
    }
  }

  return false;
}

export async function publish(ctx: PublishContext): Promise<PublishResult> {
  const { page: existingPage, title, description, tags, accountId } = ctx;

  if (!existingPage) {
    return { success: false, message: '发布需要 page 参数' };
  }

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`xiaohongshu_${accountId ?? 'unknown'}_${Date.now()}`);
  const pageCtx = { page: existingPage, accountId };

  try {
    const page = existingPage;
    const sanitizedTags = TopicSanitizer.cleanTopics(tags ?? [], {
      maxTopics: 10,
      platform: 'xiaohongshu',
    });
    const limitedTags = TopicSanitizer.limitTopics(sanitizedTags, 10);

    await debugRecorder.recordStep('fill_video_metadata', async () => {
      await fillVideoMetadata(page, title, description, limitedTags);
    }, pageCtx);

    if (ctx.dryRun) {
      logger.info(`[DRY RUN] Skipping final publish for ${ctx.accountId}`);
      return {
        success: true,
        message: '[DEBUG] 预发布模式：已跳过最终发布按钮',
        videoId: ctx.videoId,
      };
    }

    await debugRecorder.recordStep('wait_upload_complete', async () => {}, pageCtx);

    const success = await debugRecorder.recordStep('execute_publish', async () => {
      return await executePublish(page);
    }, pageCtx);

    if (success) {
      const currentUrl = page.url();
      const videoId = extractVideoId(currentUrl);

      await debugRecorder.recordStep('publish_success', async () => {
        return { videoId, url: currentUrl };
      }, pageCtx);

      return {
        success: true,
        message: '视频发布成功',
        videoId,
      };
    } else {
      throw new ValidationError('视频发布失败，请检查是否有未填写的必填项', { platform: 'xiaohongshu' });
    }
  } catch (error) {
    const pErr = toPlatformError(error, 'xiaohongshu');

    await debugRecorder.recordStep('publish_failed', async () => {
      throw pErr;
    }, pageCtx).catch(() => {});

    return { success: false, message: `发布过程出错: ${pErr.message}` };
  }
}

function extractVideoId(url: string): string | undefined {
  try {
    const match = url.match(/\/content\/manage\/detail\/([a-zA-Z0-9]+)/);
    return match ? match[1] : undefined;
  } catch (error) {
    logger.warn('提取视频ID失败', error);
    return undefined;
  }
}

export function getCoverRatios(): string[] {
  return ['3:4'];
}
