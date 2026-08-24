import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { formatScheduleDateTime, isScheduleDateTimeValueApplied } from '../base/utils/schedule';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('KuaishouSchedule');

async function clickScheduleRadio(page: Page): Promise<boolean> {
  const scheduleRadio = page.locator(UPLOAD_SELECTORS.scheduleRadio).first();
  if (await scheduleRadio.isVisible().catch(() => false)) {
    await scheduleRadio.click();
    return true;
  }

  if (typeof page.getByText !== 'function') {
    return false;
  }

  const fallbackRadio = page.getByText(/定时发布|^定时$/).first();
  if (await fallbackRadio.isVisible().catch(() => false)) {
    await fallbackRadio.click();
    return true;
  }

  return false;
}

async function setScheduleDatePicker(page: Page, dateStr: string): Promise<boolean> {
  const datePicker = page.locator(UPLOAD_SELECTORS.scheduleDatePicker).first();
  if (!(await datePicker.isVisible().catch(() => false))) {
    logger.warn('未找到快手定时发布时间输入框');
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await datePicker.click();
    await page.waitForTimeout(attempt === 1 ? 500 : 300);
    await datePicker.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(input, '');
        nativeSetter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, dateStr);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const pickerOk = page.locator(UPLOAD_SELECTORS.scheduleConfirmBtn).first();
    if (await pickerOk.isVisible().catch(() => false)) {
      await pickerOk.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);

    const actual = await datePicker.inputValue().catch(() => '');
    logger.info(`快手定时发布回读: 期望=${dateStr} 实际=${actual} attempt=${attempt}`);
    if (isScheduleDateTimeValueApplied(actual, dateStr)) {
      return true;
    }
  }

  logger.warn(`快手定时发布时间回读不匹配: ${dateStr}`);
  return false;
}

/**
 * 快手服务端定时发布
 *
 * 竞品验证（social-auto-upload/ks_uploader/main.py:311-321）：
 * - 快手使用 Ant Design Radio（非 checkbox），需点击 `.ant-radio-input:nth-child(2)` 选"定时"
 * - 日期格式必须带秒：`YYYY-MM-DD HH:mm:ss`
 * - 使用 `Ctrl+A → keyboard.type → Enter` 方式输入，不用逐字符 humanType
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
    return { success: false, message: '快手定时发布时间必须在当前时间1小时之后' };
  }

  const maxScheduleDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxScheduleDate) {
    return { success: false, message: '快手定时发布最多支持14天' };
  }

  try {
    await fillVideoMetadata(page, title, description, tags);

    // 1. 选择「定时发布」Radio
    if (!(await clickScheduleRadio(page))) {
      return { success: false, message: '未找到定时发布选项' };
    }
    await page.waitForTimeout(800);

    // 2. 点击 DatePicker 输入框，evaluate 直接设置 React 受控值 + dispatch 事件
    const dateStr = formatScheduleDateTime(scheduledTime, { withSeconds: true });
    if (!dateStr) {
      return { success: false, message: '无法格式化定时发布时间' };
    }

    if (!(await setScheduleDatePicker(page, dateStr))) {
      return { success: false, message: '设置定时发布时间失败' };
    }
    logger.info(`定时发布时间已设置: ${dateStr}`);

    // 3. 点击发布按钮
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
    if (currentUrl.includes('/article/manage/video')) {
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
