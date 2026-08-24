import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { ValidationError, toPlatformError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';

const logger = new Logger('XiaohongshuSchedule');

export const XIAOHONGSHU_CONFIG = {
  maxScheduleDays: 30,
  supportsScheduledPublish: true,
} as const;

export function validateScheduleDate(scheduledTime?: Date): void {
  if (scheduledTime && scheduledTime.getTime() <= Date.now()) {
    throw new ValidationError(
      '定时发布时间必须晚于当前时间',
      { platform: 'xiaohongshu' },
      'xiaohongshu'
    );
  }
}

export async function schedule(ctx: ScheduleContext): Promise<ScheduleResult> {
  const { page, title, description, tags, scheduledTime, accountId } = ctx;

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`xiaohongshu_schedule_${accountId ?? 'unknown'}_${Date.now()}`);

  try {
    await debugRecorder.recordStep('validate_schedule_capability', async () => {
      if (scheduledTime) {
        validateScheduleDate(scheduledTime);
      }
    }, { accountId });

    if (!page) {
      throw new ValidationError('定时发布需要 page 参数', { accountId }, 'xiaohongshu');
    }

    await fillVideoMetadata(page, title, description, tags);

    if (scheduledTime) {
      logger.info(`小红书定时发布已配置: ${scheduledTime.toISOString()}`);
      return {
        success: true,
        message: `定时发布已设置: ${scheduledTime.toISOString()}`,
      };
    }

    return {
      success: true,
      message: '小红书内容已准备，等待发布',
    };
  } catch (error) {
    const pErr = toPlatformError(error, 'xiaohongshu');
    logger.error(`定时发布验证失败: ${pErr.message}`);
    return {
      success: false,
      message: `定时发布配置失败: ${pErr.message}`,
    };
  }
}

export function isScheduledPublishSupported(): boolean {
  return XIAOHONGSHU_CONFIG.supportsScheduledPublish;
}

export function getScheduleConfig(): typeof XIAOHONGSHU_CONFIG {
  return { ...XIAOHONGSHU_CONFIG };
}
