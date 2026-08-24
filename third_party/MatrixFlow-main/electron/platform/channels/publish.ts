import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import type { PublishContext, PublishResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { getDebugRecorder } from '../base/DebugRecorder';
import { toPlatformError, ContentRejectedError, ValidationError } from '../base/PlatformError';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';

const logger = new Logger('ChannelsPublish');

const SHORT_TITLE_MAX_LEN = 16;
const SCHEDULE_POLL_INTERVAL_MS = 1000;
const SCHEDULE_POLL_MAX = 30;

export interface ChannelsScheduleDateTime {
  dateTimeText: string;
  dateText: string;
  timeText: string;
}

export function formatChannelsScheduleDateTime(value: Date): ChannelsScheduleDateTime {
  const pad = (num: number) => String(num).padStart(2, '0');
  const dateText = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const timeText = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  return {
    dateTimeText: `${dateText} ${timeText}`,
    dateText,
    timeText,
  };
}

export function formatChannelsShortTitle(originTitle: string): string {
  const allowedSpecialChars = '\u300a\u300b\u201c\u201d\u2018\u2019:+?%°';
  const filtered: string[] = [];
  for (const ch of originTitle.trim()) {
    if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(ch) || allowedSpecialChars.includes(ch)) {
      filtered.push(ch);
    } else if (ch === ',' || ch === '，') {
      filtered.push(' ');
    }
  }
  return filtered.join('').slice(0, SHORT_TITLE_MAX_LEN);
}

export async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });

  try {
    const editor = page.locator('div.input-editor').first();
    if (!(await editor.count())) {
      logger.warn('未找到视频号描述输入框 (div.input-editor)');
      return false;
    }
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await rc.humanClick('div.input-editor');

    if (description && description.trim().length > 0) {
      await page.keyboard.type(description);
      logger.info(`视频号描述已填写: ${description.slice(0, 30)}${description.length > 30 ? '...' : ''}`);
    }

    if (tags && tags.length > 0) {
      const sanitizedTags = TopicSanitizer.limitTopics(
        TopicSanitizer.cleanTopics(tags, { maxTopics: 10, platform: 'channels' }),
        10,
      );
      for (const tag of sanitizedTags) {
        const tagText = tag.startsWith('#') ? tag.slice(1) : tag;
        if (!tagText) continue;
        await page.keyboard.press('Enter');
        await page.keyboard.type(`#${tagText}`);
        await page.keyboard.press('Space');
        await page.waitForTimeout(800);

        const suggestion = page.locator('div[role="listbox"] [role="option"], ul[role="listbox"] li, .topic-suggestion, [class*="topic-suggest"] li').first();
        if (await suggestion.count() && await suggestion.isVisible().catch(() => false)) {
          await suggestion.click();
          logger.info(`视频号话题已选择（建议）: #${tagText}`);
        } else {
          logger.info(`视频号话题已键入（无建议）: #${tagText}`);
        }
        await page.waitForTimeout(300);
      }
    }
    return true;
  } catch (error) {
    throw toPlatformError(error, 'channels', { step: 'fillVideoMetadata', title });
  }
}

export async function setShortTitle(
  page: Page,
  title: string,
  overrideShortTitle?: string
): Promise<boolean> {
  const value = formatChannelsShortTitle(overrideShortTitle || title);
  if (!value) {
    logger.warn('视频号短标题为空');
    return false;
  }

  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const shortTitleInput = page.locator(UPLOAD_SELECTORS.shortTitleInput).first();
    if (!(await shortTitleInput.count()) || !(await shortTitleInput.isVisible().catch(() => false))) {
      logger.warn('当前页面无短标题输入框');
      return false;
    }

    await rc.humanClick(UPLOAD_SELECTORS.shortTitleInput);
    await rc.humanType(UPLOAD_SELECTORS.shortTitleInput, value);
    logger.info(`视频号短标题已填写: ${value}`);
    return true;
  } catch (error) {
    logger.warn('填写视频号短标题失败:', error);
    return false;
  }
}

export async function applyLocation(
  page: Page,
  location?: string
): Promise<boolean> {
  const target = (location || '').trim();

  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    if (!target) {
      let trigger = page.locator(
        '.position-display, [class*="position-display"], [class*="position-select"], ' +
        '[class*="location-select"], [class*="location-picker"]'
      ).first();

      if (!(await trigger.count()) || !(await trigger.isVisible().catch(() => false))) {
        trigger = page.locator(
          'div, section, li, label, button, [role="button"]'
        ).filter({ hasText: /^(选择位置|添加位置|位置)$/ }).first();
        if (!(await trigger.count()) || !(await trigger.isVisible().catch(() => false))) {
          logger.warn('未找到视频号位置下拉框');
          return false;
        }
      }

      const box = await trigger.boundingBox().catch(() => null);
      if (box && box.width > 16 && box.height > 0) {
        await trigger.click({
          position: {
            x: Math.max(1, Math.round(box.width - 8)),
            y: Math.max(1, Math.round(box.height / 2)),
          },
        });
      } else {
        await trigger.click();
      }
      await page.waitForTimeout(500);

      const hideOption = page.getByText('不显示位置', { exact: true }).first();
      if (!(await hideOption.isVisible().catch(() => false))) {
        logger.warn('视频号位置下拉框中未找到“不显示位置”');
        return false;
      }

      await hideOption.click();
      await page.waitForTimeout(300);
      logger.info('视频号位置已设置为“不显示位置”');
      return true;
    }

    const input = page.locator(UPLOAD_SELECTORS.locationInput).first();
    if (!(await input.count()) || !(await input.isVisible().catch(() => false))) {
      logger.warn('未找到位置输入框');
      return false;
    }

    await rc.humanClick(UPLOAD_SELECTORS.locationInput);
    await rc.humanType(UPLOAD_SELECTORS.locationInput, target);
    await page.waitForTimeout(800);

    const optionPattern = UPLOAD_SELECTORS.locationOption.replace('{location}', target);
    const option = page.locator(optionPattern).first();
    if (await option.isVisible().catch(() => false)) {
      await rc.humanClick(optionPattern);
      logger.info(`已选择位置: ${target}`);
      return true;
    } else {
      logger.warn(`位置选项未找到: ${target}，已输入但未确认`);
      return false;
    }
  } catch (error) {
    logger.warn('应用位置失败:', error);
    return false;
  }
}

export async function applyCollection(
  page: Page,
  collectionName?: string
): Promise<void> {
  if (!collectionName) {
    logger.info('未提供合集，跳过');
    return;
  }

  const rc = new PageRiskControl(page, {
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const selectPattern = UPLOAD_SELECTORS.collectionSelect;
    const select = page.locator(selectPattern).first();
    if (!(await select.count()) || !(await select.isVisible().catch(() => false))) {
      logger.warn('未找到添加到合集入口');
      return;
    }
    await rc.humanClick(selectPattern);
    await page.waitForTimeout(500);

    const optionPattern = UPLOAD_SELECTORS.collectionOption;
    const options = page.locator(optionPattern);
    if ((await options.count()) < 1) {
      logger.warn('合集选项列表为空');
      return;
    }
    const firstOption = options.first();
    await rc.humanClick(optionPattern + ' >> nth=0');
    logger.info('已选择第一个合集选项（视频号 API 不按名称筛选）');
  } catch (error) {
    logger.warn('应用合集失败，继续发布:', error);
  }
}

export async function applyProductLink(
  page: Page,
  productLink?: string,
  productTitle?: string
): Promise<void> {
  if (!productLink) {
    logger.info('未提供商品链接，跳过');
    return;
  }

  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const addBtn = page.locator(UPLOAD_SELECTORS.productLinkAddBtn).first();
    if (!(await addBtn.count()) || !(await addBtn.isVisible().catch(() => false))) {
      logger.warn('未找到添加链接按钮');
      return;
    }
    await rc.humanClick(UPLOAD_SELECTORS.productLinkAddBtn);
    await page.waitForTimeout(500);

    const input = page.locator(UPLOAD_SELECTORS.productLinkInput).first();
    if (!(await input.count()) || !(await input.isVisible().catch(() => false))) {
      logger.warn('链接弹窗中未找到输入框');
      return;
    }
    await rc.humanClick(UPLOAD_SELECTORS.productLinkInput);
    await rc.humanType(UPLOAD_SELECTORS.productLinkInput, productLink);
    logger.info(`商品链接已填写: ${productLink}`);
  } catch (error) {
    logger.warn('应用商品链接失败，继续发布:', error);
  }
}

export async function applySchedule(
  page: Page,
  scheduledTime?: Date
): Promise<boolean> {
  if (!scheduledTime) {
    return false;
  }
  const now = new Date();
  if (scheduledTime.getTime() <= now.getTime() + 15 * 60 * 1000) {
    throw new ValidationError(
      '视频号定时发布时间需晚于当前时间 15 分钟',
      { scheduledTime, now },
      'channels'
    );
  }
  if (scheduledTime.getTime() > now.getTime() + 7 * 24 * 60 * 60 * 1000) {
    throw new ValidationError(
      '视频号定时发布不能超过 7 天',
      { maxDays: 7 },
      'channels'
    );
  }

  const rc = new PageRiskControl(page, {
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const formatted = formatChannelsScheduleDateTime(scheduledTime);
    const labels = page.locator(UPLOAD_SELECTORS.scheduleLabel);
    if (!(await labels.count())) {
      logger.warn('未找到定时 label');
      return false;
    }
    const labelCount = await labels.count();
    let scheduleLabel = labels.first();
    for (let i = 0; i < labelCount; i++) {
      const candidate = labels.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        scheduleLabel = candidate;
        break;
      }
    }
    await scheduleLabel.click();
    await page.waitForTimeout(300);

    const dateInput = page.locator(UPLOAD_SELECTORS.scheduleDateInput).first();
    if (!(await dateInput.count())) {
      logger.warn('未找到日期输入框');
      return false;
    }
    await dateInput.click();
    await page.waitForTimeout(300);

    const targetMonth = scheduledTime.getMonth() + 1;
    const targetYear = scheduledTime.getFullYear();
    let targetMonthReached = false;
    for (let i = 0; i < SCHEDULE_POLL_MAX; i++) {
      const monthLabel = page.locator(UPLOAD_SELECTORS.scheduleMonthLabel).first();
      const currentMonthText = await monthLabel.innerText().catch(() => '');
      const currentPanelText = await monthLabel.locator('xpath=..').innerText().catch(() => currentMonthText);
      const monthMatches = currentMonthText.includes(`${targetMonth}月`);
      const yearMatches = !/\d{4}/.test(currentPanelText) || currentPanelText.includes(String(targetYear));
      if (monthMatches && yearMatches) {
        targetMonthReached = true;
        break;
      }
      const nextBtn = page.locator(UPLOAD_SELECTORS.scheduleMonthNext).first();
      if (!(await nextBtn.count())) {
        logger.warn('未找到月份切换按钮');
        return false;
      }
      await rc.humanClick(UPLOAD_SELECTORS.scheduleMonthNext);
      await page.waitForTimeout(SCHEDULE_POLL_INTERVAL_MS);
    }
    if (!targetMonthReached) {
      logger.warn(`未能切换到目标月份: ${targetYear}-${targetMonth}`);
      return false;
    }

    const dayTable = page.locator(UPLOAD_SELECTORS.scheduleDayTable);
    const dayCount = await dayTable.count();
    let daySelected = false;
    for (let i = 0; i < dayCount; i++) {
      const el = dayTable.nth(i);
      const cls = (await el.getAttribute('class')) ?? '';
      if (cls.includes(UPLOAD_SELECTORS.scheduleDisabledClass)) continue;
      const text = (await el.innerText()).trim();
      if (text === String(scheduledTime.getDate())) {
        await el.click();
        daySelected = true;
        break;
      }
    }
    if (!daySelected) {
      logger.warn(`未找到目标日期: ${formatted.dateText}`);
      return false;
    }

    const timeInput = page.locator(UPLOAD_SELECTORS.scheduleTimeInput).first();
    if (!(await timeInput.count())) {
      logger.warn('未找到时间输入框');
      return false;
    }
    await timeInput.click();
    try {
      await timeInput.fill(formatted.timeText);
    } catch {
      await page.keyboard.press('Control+A');
      await page.keyboard.type(formatted.timeText);
    }
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const dateValue = await dateInput.inputValue().catch(() => '');
    const timeValue = await timeInput.inputValue().catch(() => '');
    const normalize = (value: string) => value.replace(/[^\d]/g, '');
    const dateVerified = normalize(dateValue).includes(normalize(formatted.dateText));
    const timeVerified = normalize(timeValue).includes(normalize(formatted.timeText));
    if (!dateVerified || !timeVerified) {
      logger.warn(
        `视频号定时发表回读不一致: expected=${formatted.dateTimeText} actualDate=${dateValue} actualTime=${timeValue}`
      );
      return false;
    }

    logger.info(`定时发表已设置并校验: ${formatted.dateTimeText}`);
    return true;
  } catch (error) {
    logger.warn('应用定时发表失败，继续发布:', error);
    return false;
  }
}

export async function applyOriginalStatement(
  page: Page,
  isOriginal: boolean = true,
  originalCategory?: string
): Promise<boolean> {
  if (!isOriginal) {
    logger.info('未声明原创，跳过');
    return true;
  }

  try {
    let originalCheckbox = page.getByLabel('声明原创', { exact: true }).first();
    if (!(await originalCheckbox.count())) {
      originalCheckbox = page.getByLabel('视频为原创', { exact: true }).first();
    }
    if (!(await originalCheckbox.count())) {
      originalCheckbox = page.locator(
        'div.declare-original-checkbox input[type="checkbox"], ' +
        '[class*="declare-original"] input[type="checkbox"], ' +
        '[class*="original-checkbox"] input[type="checkbox"]'
      ).first();
    }
    if (!(await originalCheckbox.count()) || !(await originalCheckbox.isVisible().catch(() => false))) {
      logger.warn('视频号原创步骤1失败：未找到"声明原创"复选框');
      return false;
    }

    if (!(await originalCheckbox.isChecked().catch(() => false))) {
      await originalCheckbox.check({ force: true });
      if (!(await originalCheckbox.isChecked().catch(() => false))) {
        logger.warn('视频号原创步骤1失败："声明原创"复选框未勾选');
        return false;
      }
    }
    logger.info('视频号已完成原创步骤1：勾选"声明原创"');

    const dialog = page.locator(
      'div.declare-original-dialog, div[role="dialog"], ' +
      'div[class*="dialog"], div[class*="modal"], div[class*="popup"]'
    )
      .filter({ hasText: '原创声明须知' })
      .filter({ hasText: '使用条款' })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (!(await dialog.isVisible().catch(() => false))) {
      logger.warn('视频号原创步骤2失败：原创声明弹窗未出现');
      return false;
    }

    const agreementContainer = dialog.locator('label, div, span')
      .filter({ hasText: '我已阅读并同意' })
      .filter({ hasText: '原创声明须知' })
      .filter({ hasText: '使用条款' })
      .first();
    if (!(await agreementContainer.count()) || !(await agreementContainer.isVisible().catch(() => false))) {
      logger.warn('视频号原创步骤2失败：未找到原创声明须知和使用条款');
      return false;
    }

    const agreementCheckbox = agreementContainer.locator('input[type="checkbox"]').first();
    if (await agreementCheckbox.count()) {
      if (!(await agreementCheckbox.isChecked().catch(() => false))) {
        await agreementCheckbox.check({ force: true });
      }
      if (!(await agreementCheckbox.isChecked().catch(() => false))) {
        logger.warn('视频号原创步骤2失败：条款复选框未勾选');
        return false;
      }
    } else {
      const customCheckbox = agreementContainer.locator(
        '[role="checkbox"], [class*="checkbox"], [class*="check"]'
      ).first();
      if (!(await customCheckbox.count()) || !(await customCheckbox.isVisible().catch(() => false))) {
        logger.warn('视频号原创步骤2失败：未找到条款复选框控件');
        return false;
      }
      await customCheckbox.click();
    }
    logger.info('视频号已完成原创步骤2：勾选原创声明须知和使用条款');

    if (originalCategory) {
      const categoryForm = dialog.locator(UPLOAD_SELECTORS.originalCategoryForm).first();
      if (await categoryForm.count()) {
        await categoryForm.click();
        await page.waitForTimeout(300);
        const optionPattern = UPLOAD_SELECTORS.originalCategoryOption.replace('{category}', originalCategory);
        const option = page.locator(optionPattern).first();
        if (await option.isVisible().catch(() => false)) {
          await option.click();
          logger.info(`原创类型已选择: ${originalCategory}`);
        }
      }
    }

    const declareButton = dialog.getByRole('button', { name: '声明原创', exact: true }).first();
    if (!(await declareButton.count()) || !(await declareButton.isVisible().catch(() => false))) {
      logger.warn('视频号原创步骤3失败：未找到"声明原创"按钮');
      return false;
    }
    await declareButton.click();
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    if (await dialog.isVisible().catch(() => false)) {
      logger.warn('视频号原创步骤3失败：点击后弹窗未关闭');
      return false;
    }
    logger.info('视频号已完成原创步骤3：点击"声明原创"');
    return true;
  } catch (error) {
    logger.warn('应用原创声明失败:', error);
    return false;
  }
}

async function handleCoverPrompt(page: Page): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const coverBtn = page.locator(UPLOAD_SELECTORS.coverSelectBtn).first();
    if (!(await coverBtn.isVisible().catch(() => false))) {
      return false;
    }

    logger.info('检测到封面设置选项');
    await rc.humanClick(UPLOAD_SELECTORS.coverSelectBtn);
    await page.waitForTimeout(1000);

    const confirmBtn = page.locator(UPLOAD_SELECTORS.coverConfirmBtn).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await rc.humanClick(UPLOAD_SELECTORS.coverConfirmBtn);
      logger.info('封面已设置');
      return true;
    }

    return false;
  } catch (error) {
    logger.warn('处理封面提示失败:', error);
    return false;
  }
}

async function executePublish(page: Page, maxRetries: number = 3): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
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
      if (currentUrl.includes('/platform/post/manage')) {
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
        logger.warn(`发布尝试 ${retry + 1} 失败:`, error);
        if (retry === maxRetries - 1) {
          throw toPlatformError(error, 'channels', { step: 'executePublish', retry });
        }
      }
  }

  return false;
}

export async function publish(ctx: PublishContext): Promise<PublishResult> {
  const {
    page: existingPage,
    title,
    description,
    tags,
    accountId,
    shortTitle,
    location,
    collection,
    productLink,
    isOriginal,
    scheduledTime,
  } = ctx;

  if (!existingPage) {
    return { success: false, message: '发布需要 page 参数' };
  }

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`channels_${accountId ?? 'unknown'}_${Date.now()}`);
  const pageCtx = { page: existingPage, accountId };

  try {
    const page = existingPage;
    const sanitizedTags = TopicSanitizer.limitTopics(
      TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 0, platform: 'channels' }),
      0,
    );

    const descriptionApplied = await debugRecorder.recordStep('fill_video_metadata', async () => {
      return await fillVideoMetadata(page, title, description, sanitizedTags);
    }, pageCtx);
    if (!descriptionApplied) {
      throw new ValidationError('视频号描述填写失败', undefined, 'channels');
    }

    const shortTitleApplied = await debugRecorder.recordStep('set_short_title', async () => {
      return await setShortTitle(page, title, shortTitle);
    }, pageCtx);
    if (!shortTitleApplied) {
      throw new ValidationError('视频号短标题填写失败', undefined, 'channels');
    }

    const locationApplied = await debugRecorder.recordStep('apply_location', async () => {
      return await applyLocation(page, location);
    }, pageCtx);
    if (!locationApplied) {
      throw new ValidationError('视频号位置设置失败', { location: location ?? '' }, 'channels');
    }

    await debugRecorder.recordStep('apply_collection', async () => {
      await applyCollection(page, collection);
    }, pageCtx);

    await debugRecorder.recordStep('apply_product_link', async () => {
      await applyProductLink(page, productLink, ctx.productTitle);
    }, pageCtx);

    if (scheduledTime) {
      const scheduleApplied = await debugRecorder.recordStep('apply_schedule', async () => {
        return await applySchedule(page, scheduledTime);
      }, pageCtx);
      if (!scheduleApplied) {
        throw new ValidationError('视频号定时发表设置失败', undefined, 'channels');
      }
    }

    const originalApplied = await debugRecorder.recordStep('apply_original_statement', async () => {
      return await applyOriginalStatement(page, isOriginal === true, (ctx as { category?: string }).category);
    }, pageCtx);
    if (!originalApplied) {
      throw new ValidationError('视频号原创声明未完成', undefined, 'channels');
    }

    if (ctx.dryRun) {
      logger.info(`[DRY RUN] Skipping final publish for ${ctx.accountId}`);
      return {
        success: true,
        message: '[DEBUG] 预发布模式：已跳过最终发布按钮',
        videoId: ctx.videoId,
      };
    }

    const success = await debugRecorder.recordStep('execute_publish', async () => {
      return await executePublish(page);
    }, pageCtx);

    if (success) {
      const currentUrl = page.url();
      const videoId = extractVideoId(currentUrl);

      return {
        success: true,
        message: '视频发布成功',
        videoId,
      };
    } else {
      throw new ContentRejectedError('视频发布失败，请检查是否有未填写的必填项', undefined, 'channels');
    }
  } catch (error) {
    const platformError = toPlatformError(error, 'channels', {
      step: 'publish',
      accountId,
      title,
    });
    logger.error(`发布过程出错: ${platformError.message}`);
    return {
      success: false,
      message: platformError.userMessage,
    };
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/post\/manage\?.*id=([^&]+)/);
  return match ? match[1] : undefined;
}

export function getCoverRatios(): string[] {
  return ['3:4', '4:3'];
}
