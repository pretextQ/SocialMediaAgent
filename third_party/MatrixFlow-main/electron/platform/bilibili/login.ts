import path from 'path';
import fs from 'fs';
import type { Page } from 'patchright';
import { chromium } from 'patchright';
import { Logger } from '../../core/Logger';
import { BILIBILI_URLS, LOGIN_SELECTORS } from './selectors';
import { getCookiePath, saveCookie, cookieExists } from './cookie';
import type { CookieResult, LoginOptions } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { getDebugRecorder } from '../base/DebugRecorder';

const logger = new Logger('BilibiliLogin');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

export async function validateExistingCookie(cookiePath: string): Promise<boolean> {
  if (!fs.existsSync(cookiePath)) {
    return false;
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: CHROME_ARGS,
  });

  try {
    const context = await browser.newContext({ storageState: cookiePath });
    const page = await context.newPage();

    await page.goto(BILIBILI_URLS.upload, { timeout: 15000 });

    try {
      await page.waitForURL(/member\.bilibili\.com/, { timeout: 8000 });
    } catch {
      return false;
    }

    const scanLoginVisible = await page
      .getByText('扫码登录', { exact: true })
      .isVisible()
      .catch(() => false);
    const phoneLoginVisible = await page
      .getByText('手机登录', { exact: true })
      .isVisible()
      .catch(() => false);

    if (scanLoginVisible || phoneLoginVisible) {
      logger.info('Cookie 已失效，页面显示了登录界面');
      return false;
    }

    logger.info('Cookie 验证通过');
    return true;
  } catch (error) {
    logger.error('Cookie 验证失败:', error);
    return false;
  } finally {
    await browser.close();
  }
}

async function extractQrCodeSrc(page: Page): Promise<string> {
  const scanTab = page.getByText('扫码登录', { exact: false }).first();
  await scanTab.waitFor({ timeout: 30000 });

  const qrcodeImg = page.locator(LOGIN_SELECTORS.qrCodeImage).first();
  await qrcodeImg.waitFor({ state: 'visible', timeout: 30000 });
  const src = await qrcodeImg.getAttribute('src');

  if (!src) {
    throw new Error('未获取到哔哩哔哩登录二维码地址');
  }

  logger.info('二维码地址已提取');
  return src;
}

async function saveQrCodeImage(src: string, accountId: string): Promise<string> {
  const { app } = await import('electron');
  const userDataPath = app.getPath('userData');
  const qrDir = path.join(userDataPath, 'qrcodes', 'bilibili');

  if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
  }

  const qrPath = path.join(qrDir, `${accountId}-${Date.now()}.png`);

  if (src.startsWith('data:image')) {
    const base64Data = src.split(',')[1];
    fs.writeFileSync(qrPath, Buffer.from(base64Data, 'base64'));
  } else if (src.startsWith('http')) {
    const response = await fetch(src);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(qrPath, buffer);
  } else {
    throw new Error(`二维码 src 格式不支持: ${src.substring(0, 50)}`);
  }

  logger.info(`二维码已保存: ${qrPath}`);
  return qrPath;
}

async function isLoginCompleted(page: Page): Promise<boolean> {
  if (!page.url().includes('member.bilibili.com')) {
    return false;
  }

  if (
    page.url().includes('/platform/upload') ||
    page.url().includes('/platform/upload-manager') ||
    page.url().includes('/platform/data-view')
  ) {
    return true;
  }

  const loginMarkers = [
    page.getByText('扫码登录', { exact: true }).first(),
    page.getByText('手机登录', { exact: true }).first(),
  ];

  for (const marker of loginMarkers) {
    if (!(await marker.count())) continue;
    try {
      if (await marker.isVisible()) return false;
    } catch {
      continue;
    }
  }

  return true;
}

async function waitForLogin(
  page: Page,
  accountId: string,
  onQRRefresh?: (path: string) => void,
  pollIntervalMs: number = 3000,
  maxChecks: number = 100
): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 80, max: 250 },
    clickDelayMs: { min: 150, max: 400 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });
  for (let i = 0; i < maxChecks; i++) {
    if (await isLoginCompleted(page)) {
      logger.info(`扫码成功，当前页面: ${page.url()}`);
      return true;
    }

    const expiredText = page.getByText('二维码已失效', { exact: true }).first();
    if ((await expiredText.count()) && (await expiredText.isVisible().catch(() => false))) {
      logger.info('二维码已过期，正在刷新...');
      const refreshBtn = page.locator(LOGIN_SELECTORS.qrRefreshBtn).first();
      if (await refreshBtn.count()) {
        await rc.humanClick(LOGIN_SELECTORS.qrRefreshBtn);
      } else {
        await rc.humanClick('text="二维码已失效"');
      }
      await page.waitForTimeout(1500);
      const src = await extractQrCodeSrc(page);
      const qrPath = await saveQrCodeImage(src, accountId);
      onQRRefresh?.(qrPath);
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  return false;
}

/**
 * 从哔哩哔哩创作者中心页面提取当前登录用户的昵称和头像。
 *
 * 策略：DOM 优先 —— 通过 LOGIN_SELECTORS 读取页面元素。
 * 登录成功后页面通常在 /platform/upload 或 /platform/upload-manager，
 * 这些页面的 header 中通常包含用户头像和昵称。
 */
async function extractUserInfo(page: Page): Promise<{
  nickname?: string;
  avatarUrl?: string;
}> {
  let nickname: string | undefined;
  let avatarUrl: string | undefined;

  const usernameEl = page.locator(LOGIN_SELECTORS.usernameText).first();
  if (
    (await usernameEl.count().catch(() => 0)) &&
    (await usernameEl.isVisible().catch(() => false))
  ) {
    const text = (await usernameEl.textContent().catch(() => ''))?.trim() ?? '';
    if (text && text.length < 40) {
      nickname = text;
      logger.info(`从 DOM 提取到昵称: ${nickname}`);
    }
  }

  const avatarEl = page.locator(LOGIN_SELECTORS.avatarIndicator).first();
  if (
    (await avatarEl.count().catch(() => 0)) &&
    (await avatarEl.isVisible().catch(() => false))
  ) {
    const src = (await avatarEl.getAttribute('src').catch(() => '')) ?? '';
    if (src) {
      avatarUrl = src;
      logger.info(`从头像元素提取到头像: ${avatarUrl.substring(0, 80)}`);
    }

    if (!nickname) {
      const alt =
        (await avatarEl.getAttribute('alt').catch(() => ''))?.trim() ?? '';
      if (alt && alt.length < 40) {
        nickname = alt;
        logger.info(`从头像 alt 提取到昵称: ${nickname}`);
      }
    }
  }

  if (!nickname && !avatarUrl) {
    logger.info('未能从页面提取用户 profile，将使用默认值');
  }

  return { nickname, avatarUrl };
}

export async function qrCodeLogin(
  accountId: string,
  headless: boolean = false,
  onQRReady?: (path: string) => void,
  onQRRefresh?: (path: string) => void,
  options: LoginOptions = {}
): Promise<CookieResult> {
  const cookiePath = getCookiePath(accountId);
  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`bilibili_login_${accountId}_${Date.now()}`);
  const pageCtx = { accountId };

  if (options.force) {
    logger.info('用户发起重新登录，跳过现有 Cookie 检查');
  } else if (cookieExists(cookiePath)) {
    logger.info('检查现有 cookie...');
    const valid = await debugRecorder.recordStep('validate_existing_cookie', async () => {
      return await validateExistingCookie(cookiePath);
    }, pageCtx);
    if (valid) {
      logger.info('Cookie 有效，无需重新登录');
      return { success: true, cookiePath, message: 'Cookie 有效' };
    }
    logger.info('Cookie 已失效，准备扫码登录');
  }

  const userDataDir = getUserDataDir(accountId);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    args: CHROME_ARGS,
  });
  context.setDefaultNavigationTimeout(120000);

  try {
    const allPages = context.pages();
    const page = allPages.length > 0 ? allPages[0] : await context.newPage();
    const pageCtxWithPage = { page, ...pageCtx };

    logger.info('打开哔哩哔哩创作者中心...');
    await debugRecorder.recordStep('goto_login_page', async () => {
      await page.goto(BILIBILI_URLS.loginPage, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }, pageCtxWithPage);

    if (page.url().includes('/platform/upload') || page.url().includes('/platform/upload-manager')) {
      logger.info('哔哩哔哩已登录，cookie 有效');
      await saveCookie(context, cookiePath);

      const { nickname, avatarUrl } = await extractUserInfo(page);
      if (nickname) logger.info(`登录账号: ${nickname}`);

      options.onLoginConfirmed?.();

      return {
        success: true,
        cookiePath,
        message: '哔哩哔哩已登录，cookie有效',
        nickname,
        avatarUrl,
      };
    }

    await debugRecorder.recordStep('extract_qr_code', async () => {
      const qrSrc = await extractQrCodeSrc(page);
      const qrPath = await saveQrCodeImage(qrSrc, accountId);
      logger.info('请使用哔哩哔哩 APP 扫描二维码登录');
      logger.info(`二维码文件: ${qrPath}`);
      onQRReady?.(qrPath);
    }, pageCtxWithPage);

    await debugRecorder.recordStep('wait_scan_login', async () => {
      const loginSuccess = await waitForLogin(page, accountId, onQRRefresh);
      if (!loginSuccess) {
        throw new Error('等待扫码超时');
      }
    }, pageCtxWithPage);

    await page.waitForTimeout(2000);
    await debugRecorder.recordStep('save_cookie_final', async () => {
      await saveCookie(context, cookiePath);
    });
    logger.info(`Cookie 已保存: ${cookiePath}`);

    const { nickname, avatarUrl } = await extractUserInfo(page);
    if (nickname) logger.info(`登录账号: ${nickname}`);

    options.onLoginConfirmed?.();

    return {
      success: true,
      cookiePath,
      message: '扫码登录成功',
      nickname,
      avatarUrl,
    };
  } catch (error) {
    return {
      success: false,
      cookiePath,
      message: `登录过程出错: ${error}`,
    };
  } finally {
    await context.close();
  }
}

function getUserDataDir(accountId: string): string {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const dir = path.join(userDataPath, 'browser_data', 'bilibili', accountId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const singletonLock = path.join(dir, 'SingletonLock');
  if (fs.existsSync(singletonLock)) {
    fs.unlinkSync(singletonLock);
  }
  return dir;
}

export async function getQRCode(accountId: string): Promise<string> {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: CHROME_ARGS,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(BILIBILI_URLS.loginPage);
    const src = await extractQrCodeSrc(page);
    const qrPath = await saveQrCodeImage(src, accountId);

    await context.close();
    await browser.close();

    return qrPath;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function checkCookie(accountId: string): Promise<boolean> {
  const cookiePath = getCookiePath(accountId);
  return validateExistingCookie(cookiePath);
}
