import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('BilibiliSchedule');

/**
 * 哔哩哔哩服务端定时发布
 * 必须提供 page 参数
 */
export async function schedule(ctx: ScheduleContext): Promise<ScheduleResult> {
  const { page, title, description, tags, scheduledTime } = ctx;

  if (!page) {
    return { success: false, message: '定时发布需要 page 参数' };
  }

  if (!scheduledTime) {
    return { success: false, message: '定时发布需要指定发布时间' };
  }

  const now = new Date();
  const minScheduleDate = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  if (scheduledTime < minScheduleDate) {
    return { success: false, message: '哔哩哔哩定时发布时间必须在当前时间1小时之后' };
  }

  const maxScheduleDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxScheduleDate) {
    return { success: false, message: '哔哩哔哩定时发布最多支持10天' };
  }

  try {
    await fillVideoMetadata(page, title, description, tags);

    const scheduleCheckbox = page.locator(UPLOAD_SELECTORS.scheduleCheckbox).first();
    if (!(await scheduleCheckbox.isVisible().catch(() => false))) {
      return { success: false, message: '未找到定时发布选项' };
    }

    await scheduleCheckbox.check();
    await page.waitForTimeout(500);

    const datePicker = page.locator(UPLOAD_SELECTORS.scheduleDatePicker).first();
    if (await datePicker.isVisible().catch(() => false)) {
      const year = scheduledTime.getFullYear();
      const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
      const day = String(scheduledTime.getDate()).padStart(2, '0');
      const hours = String(scheduledTime.getHours()).padStart(2, '0');
      const minutes = String(scheduledTime.getMinutes()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day} ${hours}:${minutes}`;

      await datePicker.click();
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.type(dateStr);
      await page.waitForTimeout(800);

      const pickerOk = page.locator('.ant-picker-ok button, .ant-picker-footer button').first();
      if (await pickerOk.isVisible().catch(() => false)) {
        await pickerOk.click();
        logger.info('已点击日期选择器确定按钮');
      } else {
        const confirmBtn = page.locator(UPLOAD_SELECTORS.scheduleConfirmBtn).first();
        if (await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
          logger.info('已点击定时发布确定按钮');
        } else {
          await page.keyboard.press('Enter');
        }
      }
      logger.info(`定时发布时间已设置: ${dateStr}`);
    }

    logger.info(`⏸ 发布前等待 ${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS} 秒...`);
    await page.waitForTimeout(PRE_PUBLISH_CONFIRMATION_DELAY_MS);

    const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
    await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
    await publishBtn.click();

    await page.waitForTimeout(2000);

    const successToast = page.locator(UPLOAD_SELECTORS.publishSuccessToast);
    if (await successToast.isVisible().catch(() => false)) {
      logger.info('定时发布设置成功');
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    const currentUrl = page.url();
    if (currentUrl.includes('/platform/upload-manager')) {
      logger.info('定时发布设置成功（已跳转管理页）');
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    return { success: false, message: '定时发布设置可能失败，未检测到成功标志' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`定时发布设置出错: ${errorMessage}`);
    return { success: false, message: `定时发布设置出错: ${errorMessage}` };
  }
}
