import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import type { PublishContext, PublishResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { getDebugRecorder } from '../base/DebugRecorder';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('BilibiliPublish');

/**
 * 填写哔哩哔哩视频元数据
 * 竞品模式：标题 + 描述 + 话题标签
 */
export async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });
  const recorder = getDebugRecorder();

  await recorder.recordStep('bilibili_fill_title', async () => {
    const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await rc.humanClick(UPLOAD_SELECTORS.titleInput);
    await titleInput.fill(title);
    logger.info(`标题已填写: ${title}`);
  });

  if (description) {
    await recorder.recordStep('bilibili_fill_description', async () => {
      const descEditor = page.locator(UPLOAD_SELECTORS.descEditor).first();
      if (await descEditor.isVisible().catch(() => false)) {
        await rc.humanClick(UPLOAD_SELECTORS.descEditor);
        await descEditor.fill(description);
        logger.info('描述已填写');
      }
    });
  }

  if (tags && tags.length > 0) {
    const sanitizedTags = TopicSanitizer.limitTopics(
      TopicSanitizer.cleanTopics(tags, { maxTopics: 4, platform: 'bilibili' }),
      4,
    );
    const topicInput = page.locator(UPLOAD_SELECTORS.topicInput).first();
    if (await topicInput.isVisible().catch(() => false)) {
      for (const tag of sanitizedTags) {
        await recorder.recordStep(`bilibili_add_tag_${tag}`, async () => {
          const tagNoHash = tag.startsWith('#') ? tag.slice(1) : tag;
          await rc.humanClick(UPLOAD_SELECTORS.topicInput);
          await page.keyboard.type('#');
          await page.waitForTimeout(800);
          await page.keyboard.type(tagNoHash);
          await page.waitForTimeout(1500);

          const suggestion = page.locator(UPLOAD_SELECTORS.topicSuggestion).first();
          if (await suggestion.isVisible().catch(() => false)) {
            await rc.humanClick(UPLOAD_SELECTORS.topicSuggestion);
            logger.info(`话题已选择(建议): ${tagNoHash}`);
          } else {
            logger.info(`话题已添加(文本): ${tagNoHash}`);
          }
        });
        await page.waitForTimeout(500);
      }
    }
  }
}

/**
 * 处理哔哩哔哩封面设置
 * 竞品模式：检测封面提示 → 选择推荐封面或上传封面 → 确认
 */
async function handleCoverPrompt(page: Page): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
  });
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
}

/**
 * 执行哔哩哔哩发布操作
 * 竞品模式：点击发布 → 检测成功提示 → 处理可能的封面提示
 */
async function executePublish(page: Page, maxRetries: number = 3): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });
  for (let retry = 0; retry < maxRetries; retry++) {
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
    if (currentUrl.includes('/platform/upload-manager')) {
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
  }

  return false;
}

/**
 * 哔哩哔哩发布操作
 * 适用场景：视频已上传，需要填写元数据并发布
 */
export async function publish(ctx: PublishContext): Promise<PublishResult> {
  const { page: existingPage, title, description, tags } = ctx;
  const recorder = getDebugRecorder();

  if (!existingPage) {
    return { success: false, message: '发布需要 page 参数' };
  }

  try {
    const page = existingPage;
    await recorder.recordStep('bilibili_fill_metadata', async () => {
      await fillVideoMetadata(page, title, description, tags);
    });

    if (ctx.dryRun) {
      logger.info(`[DRY RUN] Skipping final publish for ${ctx.accountId}`);
      return {
        success: true,
        message: '[DEBUG] 预发布模式：已跳过最终发布按钮',
        videoId: ctx.videoId,
      };
    }

    const success = await recorder.recordStep('bilibili_execute_publish', async () => {
      return await executePublish(page);
    });

    if (success) {
      const currentUrl = page.url();
      const videoId = extractVideoId(currentUrl);

      return {
        success: true,
        message: '视频发布成功',
        videoId,
      };
    } else {
      return {
        success: false,
        message: '视频发布失败，请检查是否有未填写的必填项',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`发布过程出错: ${errorMessage}`);
    return {
      success: false,
      message: `发布过程出错: ${errorMessage}`,
    };
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/platform\/upload-manager\/article\?.*id=([^&]+)/)
    || url.match(/video\/(BV[1-9A-HJ-NP-Za-km-z]+)/i)
    || url.match(/[?&]bvid=([^&]+)/i);
  return match ? match[1] : undefined;
}

export function getCoverRatios(): string[] {
  return ['16:9', '4:3', '1:1'];
}
