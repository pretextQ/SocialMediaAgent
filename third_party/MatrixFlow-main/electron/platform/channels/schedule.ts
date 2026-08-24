import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import { fillVideoMetadata, setShortTitle } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { toPlatformError, ValidationError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';
import { PageRiskControl } from '../base/RiskControl';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('ChannelsSchedule');

// 视频号定时发布限制：≥2小时且≤7天
const MIN_SCHEDULE_HOURS = 2;
const MAX_SCHEDULE_DAYS = 7;

/**
 * 校验定时发布时间
 * 视频号要求：≥2小时且≤7天
 */
export function validateScheduleDate(scheduledTime: Date): { valid: boolean; message?: string } {
  const now = new Date();

  if (scheduledTime <= now) {
    return { valid: false, message: '定时发布时间必须晚于当前时间' };
  }

  const diffMs = scheduledTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < MIN_SCHEDULE_HOURS) {
    return {
      valid: false,
      message: `视频号定时发布需提前至少 ${MIN_SCHEDULE_HOURS} 小时`,
    };
  }

  if (diffDays > MAX_SCHEDULE_DAYS) {
    return {
      valid: false,
      message: `视频号定时发布最多提前 ${MAX_SCHEDULE_DAYS} 天`,
    };
  }

  return { valid: true };
}

/**
 * 视频号服务端定时发布
 * 必须提供 page 参数
 * 支持 maxScheduleDays=7，需提前 ≥2 小时
 */
export async function schedule(ctx: ScheduleContext): Promise<ScheduleResult> {
  const { page, title, description, tags, scheduledTime, accountId } = ctx;

  if (!page) {
    return { success: false, message: '定时发布需要 page 参数' };
  }

  if (!scheduledTime) {
    return { success: false, message: '定时发布需要指定发布时间' };
  }

  // 校验时间范围
  const validation = validateScheduleDate(scheduledTime);
  if (!validation.valid) {
    return { success: false, message: validation.message ?? '校验失败' };
  }

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`channels_schedule_${accountId ?? 'unknown'}_${Date.now()}`);
  const pageCtx = { page, accountId };

  try {
    // 填写元数据
    const descriptionApplied = await debugRecorder.recordStep('fill_video_metadata', async () => {
      return await fillVideoMetadata(page, title, description, tags);
    }, pageCtx);
    if (!descriptionApplied) {
      return { success: false, message: '视频号描述填写失败' };
    }

    const shortTitleApplied = await debugRecorder.recordStep('set_short_title', async () => {
      return await setShortTitle(page, title);
    }, pageCtx);
    if (!shortTitleApplied) {
      return { success: false, message: '视频号短标题填写失败' };
    }

    const rc = new PageRiskControl(page, {
      clickDelayMs: { min: 100, max: 300 },
    });

    // 开启定时发布开关
    const scheduleToggle = await debugRecorder.recordStep('toggle_schedule', async () => {
      const toggle = page.locator(UPLOAD_SELECTORS.scheduleToggle).first();
      if (!(await toggle.isVisible().catch(() => false))) {
        throw new ValidationError('未找到定时发布选项', undefined, 'channels');
      }
      await toggle.click();
      await page.waitForTimeout(500);
      return toggle;
    }, pageCtx);

    if (!scheduleToggle) {
      return { success: false, message: '未找到定时发布选项' };
    }

    // 设置日期时间（视频号通常只到小时）
    await debugRecorder.recordStep('set_schedule_time', async () => {
      const datePicker = page.locator(UPLOAD_SELECTORS.scheduleDatePicker).first();
      if (await datePicker.isVisible().catch(() => false)) {
        const year = scheduledTime.getFullYear();
        const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
        const day = String(scheduledTime.getDate()).padStart(2, '0');
        const hours = String(scheduledTime.getHours()).padStart(2, '0');
        // 视频号通常只到小时，分钟设为 00
        const dateStr = `${year}-${month}-${day} ${hours}:00`;

        await datePicker.click();
        await datePicker.fill(dateStr);
        await page.keyboard.press('Enter');
        logger.info(`定时发布时间已设置: ${dateStr}`);
      }
    }, pageCtx);

    // 点击发布按钮
    await debugRecorder.recordStep('click_publish', async () => {
      logger.info(`⏸ 发布前等待 ${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS} 秒...`);
      await page.waitForTimeout(PRE_PUBLISH_CONFIRMATION_DELAY_MS);

      const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
      await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
      await rc.humanClick(UPLOAD_SELECTORS.publishButton);
    }, pageCtx);

    await page.waitForTimeout(2000);

    // 检查发布结果
    const successToast = page.locator(UPLOAD_SELECTORS.publishSuccessToast);
    if (await successToast.isVisible().catch(() => false)) {
      logger.info('定时发布设置成功');
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    const currentUrl = page.url();
    if (currentUrl.includes('/platform/post/manage')) {
      logger.info('定时发布设置成功（已跳转管理页）');
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    return { success: false, message: '定时发布设置可能失败，未检测到成功标志' };
  } catch (error) {
    const platformError = toPlatformError(error, 'channels', {
      step: 'schedule',
      accountId,
      scheduledTime: scheduledTime.toISOString(),
    });
    logger.error(`定时发布设置出错: ${platformError.message}`);
    return {
      success: false,
      message: platformError.userMessage,
    };
  }
}
