import path from 'path';
import fs from 'fs';
import type { BrowserContext, Page } from 'patchright';
import { chromium } from 'patchright';
import { Logger } from '../../core/Logger';
import { XHS_URLS, LOGIN_SELECTORS } from './selectors';
import { getCookiePath, saveCookie, cookieExists } from './cookie';
import type { CookieResult, LoginOptions } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { getDebugRecorder } from '../base/DebugRecorder';
import {
  detectXhsLoginInPage,
  detectXhsProfileInPage,
  hasRequiredXhsCookies,
} from './login-detection';

const logger = new Logger('XhsLogin');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

/** 扫码登录超时时间（5 分钟） */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
/** 二维码轮询间隔 */
const QR_POLL_INTERVAL_MS = 3000;
/** 二维码最大轮询次数 */
const QR_MAX_POLLS = Math.floor(LOGIN_TIMEOUT_MS / QR_POLL_INTERVAL_MS);

async function clearPersistentElectronSession(accountId: string): Promise<void> {
  try {
    const { session } = await import('electron');
    const ses = session.fromPartition(`persist:${accountId}`);
    await ses.clearStorageData({ storages: ['cookies'] });
    logger.info(`已清理旧的持久会话: accountId=${accountId}`);
  } catch (error) {
    logger.warn(`清理旧的持久会话失败: accountId=${accountId}`, error);
  }
}

async function syncCookiesToElectronSession(context: BrowserContext, accountId: string): Promise<void> {
  const cookies = await context.cookies();
  if (!hasRequiredXhsCookies(cookies)) {
    throw new Error('登录完成后缺少必要的 Cookie');
  }

  const { session } = await import('electron');
  const ses = session.fromPartition(`persist:${accountId}`);
  await ses.clearStorageData({ storages: ['cookies'] });

  for (const cookie of cookies) {
    const host = cookie.domain.replace(/^\./, '');
    const cookiePath = cookie.path || '/';
    await ses.cookies.set({
      url: `${cookie.secure ? 'https' : 'http'}://${host}${cookiePath}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookiePath,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expires > 0 ? cookie.expires : undefined,
    });
  }

  logger.info(`已同步 Cookie 到持久会话: accountId=${accountId}, count=${cookies.length}`);
}

/**
 * 小红书的登录验证逻辑：
 * 与视频号不同，小红书登录成功后会停留在创作者中心，
 * 页面不再出现扫码登录/手机登录 tab。
 */
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
    const cookies = await context.cookies('https://creator.xiaohongshu.com');
    if (!hasRequiredXhsCookies(cookies)) {
      logger.info('Cookie 验证失败: 缺少必要的 Cookie');
      return false;
    }

    const page = await context.newPage();

    await page.goto(XHS_URLS.publish, { timeout: 15000, waitUntil: 'domcontentloaded' });

    const detection = await detectXhsLoginInPage(page);
    if (detection.loggedIn) {
      logger.info(`Cookie 验证通过: ${detection.reason}`);
      return true;
    }

    logger.info(`Cookie 验证未取得登录态: reason=${detection.reason}, url=${detection.currentUrl ?? page.url()}`);
    return false;
  } catch (error) {
    logger.error('Cookie 验证失败:', error);
    return false;
  } finally {
    await browser.close();
  }
}

/**
 * 从小红书登录页提取二维码图片（参考 social-auto-upload）
 *
 * 流程：
 * 1. 等待 div[class*='login-box'] 出现
 * 2. 检查是否已有"扫一扫"文字 → 二维码已显示
 * 3. 没有 → 点击 img.css-wemwzq 切换到扫码面板
 * 4. 通过 .login-box-container 定位二维码图片
 */
async function extractQrCodeSrc(page: Page): Promise<string> {
  const loginBox = page.locator(LOGIN_SELECTORS.loginBox).first();
  await loginBox.waitFor({ state: 'visible', timeout: 30000 });

  const loadingOverlay = page.locator('[data-testid="loading"]').first();
  await loadingOverlay.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {
    logger.info('加载遮罩未出现或已消失，继续');
  });

  const scanText = loginBox.locator('div:has-text("扫一扫")').first();
  if (!(await scanText.count()) || !(await scanText.isVisible().catch(() => false))) {
    const switchImg = loginBox.locator(LOGIN_SELECTORS.loginSwitchImg).first();
    await switchImg.waitFor({ state: 'visible', timeout: 10000 });
    await switchImg.click({ force: true });
    await loginBox.locator('div:has-text("扫一扫")').first().waitFor({ state: 'visible', timeout: 10000 });
  }

  const qrCodeImg = page.locator(LOGIN_SELECTORS.qrCodeImage).first();
  await qrCodeImg.waitFor({ state: 'visible', timeout: 30000 });

  const src = await qrCodeImg.getAttribute('src');
  if (!src) {
    throw new Error('未获取到小红书登录二维码地址');
  }

  logger.info('已获取小红书二维码');
  return src;
}

async function saveQrCodeImage(src: string, accountId: string): Promise<string> {
  const { app } = await import('electron');
  const userDataPath = app.getPath('userData');
  const qrDir = path.join(userDataPath, 'qrcodes', 'xiaohongshu');

  if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
  }

  const qrPath = path.join(qrDir, `${accountId}-${Date.now()}.png`);

  if (src.startsWith('data:image')) {
    const base64Data = src.split(',')[1];
    fs.writeFileSync(qrPath, Buffer.from(base64Data, 'base64'));
  } else if (src.startsWith('http')) {
    // 小红书二维码可能是网络图片 URL
    const response = await fetch(src);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(qrPath, buffer);
  } else {
    throw new Error(`不支持的二维码 src 格式: ${src.substring(0, 50)}`);
  }

  logger.info(`小红书二维码已保存: ${qrPath}`);
  return qrPath;
}

/**
 * 检测小红书是否登录成功（参考 social-auto-upload 实现）
 *
 * 逻辑：
 * 1. URL 仍在 /login → 未登录
 * 2. div[class*='login-box'] 不存在 → 已登录
 * 3. div[class*='login-box'] 存在但不可见 → 已登录
 */
async function isLoginCompleted(page: Page): Promise<boolean> {
  const currentUrl = page.url();

  if (currentUrl.startsWith(XHS_URLS.loginPage)) {
    return false;
  }

  const loginBox = page.locator(LOGIN_SELECTORS.loginBox).first();
  try {
    const boxCount = await loginBox.count();
    if (!boxCount) {
      return true;
    }
    return !(await loginBox.isVisible());
  } catch {
    return true;
  }
}

/**
 * 处理二维码过期并自动刷新
 * 小红书二维码有效期约 5 分钟，过期后需要刷新。
 */
async function handleExpiredQrCode(page: Page, accountId: string, onQRRefresh?: (path: string) => void): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });
  const expiredText = page.getByText('二维码已失效', { exact: true }).first();
  const refreshBtn = page.locator(LOGIN_SELECTORS.qrRefreshBtn).first();

  const isExpired = (await expiredText.count()) && (await expiredText.isVisible().catch(() => false));
  const hasRefreshBtn = (await refreshBtn.count()) && (await refreshBtn.isVisible().catch(() => false));

  if (isExpired || hasRefreshBtn) {
    logger.info('小红书二维码已过期，正在刷新...');

    if (hasRefreshBtn) {
      await rc.humanClick(LOGIN_SELECTORS.qrRefreshBtn);
    } else {
      await rc.humanClick('text="二维码已失效"');
    }

    await page.waitForTimeout(1500);

    try {
      const src = await extractQrCodeSrc(page);
      const qrPath = await saveQrCodeImage(src, accountId);
      onQRRefresh?.(qrPath);
      logger.info('二维码已刷新');
    } catch (error) {
      logger.warn('刷新二维码失败:', error);
    }
  }
}

/**
 * 轮询等待用户完成小红书扫码
 * 小红书扫码流程：打开二维码 → 用户小红书 APP 扫码 → 手机确认 → 页面跳转
 */
async function waitForLogin(
  page: Page,
  accountId: string,
  onQRRefresh?: (path: string) => void
): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });
  for (let i = 0; i < QR_MAX_POLLS; i++) {
    if (await isLoginCompleted(page)) {
      logger.info(`小红书扫码成功，已跳转到: ${page.url()}`);
      return true;
    }

    await handleExpiredQrCode(page, accountId, onQRRefresh);

    if (i > 0 && i % 10 === 0) {
      const elapsed = Math.floor((i * QR_POLL_INTERVAL_MS) / 1000);
      logger.info(`等待小红书扫码中... 已等待 ${elapsed} 秒`);
    }

    await page.waitForTimeout(QR_POLL_INTERVAL_MS);
  }

  logger.error(`扫码等待超时（${LOGIN_TIMEOUT_MS / 1000} 秒）`);
  return false;
}

/**
 * 小红书扫码登录主入口
 *
 * 流程与视频号类似：
 * 1. 打开 creator.xiaohongshu.com → 需要点击"扫码登录" tab
 * 2. 用户用小红书 APP 扫描二维码
 * 3. 在手机小红书上确认登录
 * 4. 页面跳转到创作者中心
 */
export async function qrCodeLogin(
  accountId: string,
  headless: boolean = false,
  onQRReady?: (path: string) => void,
  onQRRefresh?: (path: string) => void,
  options: LoginOptions = {}
): Promise<CookieResult> {
  const cookiePath = getCookiePath(accountId);
  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`xiaohongshu_login_${accountId}_${Date.now()}`);
  const pageCtx = { accountId };

  if (options.force) {
    logger.info('用户发起重新登录，跳过现有 Cookie 检查');
    await clearPersistentElectronSession(accountId);
  } else if (cookieExists(cookiePath)) {
    logger.info('检查现有 Cookie...');
    const valid = await debugRecorder.recordStep('validate_existing_cookie', async () => {
      return await validateExistingCookie(cookiePath);
    }, pageCtx);
    if (valid) {
      logger.info('Cookie 有效，无需重新登录');
      return {
        success: true,
        cookiePath,
        message: 'Cookie 有效',
      };
    }
    logger.info('Cookie 已失效，准备小红书扫码登录');
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    args: CHROME_ARGS,
  });
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    const pageCtxWithPage = { page, ...pageCtx };

    logger.info('打开小红书创作者中心...');
    await debugRecorder.recordStep('goto_login_page', async () => {
      await page.goto(XHS_URLS.loginPage, { timeout: 30000 });
    }, pageCtxWithPage);

    await debugRecorder.recordStep('extract_qr_code', async () => {
      const qrSrc = await extractQrCodeSrc(page);
      const qrPath = await saveQrCodeImage(qrSrc, accountId);
      logger.info('请使用小红书 APP 扫描二维码登录');
      logger.info(`二维码文件: ${qrPath}`);
      onQRReady?.(qrPath);
    }, pageCtxWithPage);

    await debugRecorder.recordStep('wait_scan_login', async () => {
      const loginSuccess = await waitForLogin(page, accountId, onQRRefresh);
      if (!loginSuccess) {
        throw new Error(`等待小红书扫码超时（${LOGIN_TIMEOUT_MS / 1000} 秒）`);
      }
    }, pageCtxWithPage);

    await page.waitForTimeout(3000);

    await saveCookie(context, cookiePath);
    logger.info(`Cookie 已保存: ${cookiePath}`);

    await syncCookiesToElectronSession(context, accountId);

    // Navigate to publish page for better profile extraction context
    try {
      await page.goto(XHS_URLS.publish, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      logger.info('已导航到发布页面以提取用户信息');
    } catch {
      logger.warn('导航到发布页面失败，尝试从当前页面提取');
    }

    let nickname: string | undefined;
    let avatarUrl: string | undefined;

    // Try to extract via DOM selectors first (faster, more reliable for nickname)
    const usernameEl = page.locator(LOGIN_SELECTORS.usernameText).first();
    if ((await usernameEl.count().catch(() => 0)) && (await usernameEl.isVisible().catch(() => false))) {
      const username = await usernameEl.textContent().catch(() => '');
      if (username && username.trim().length < 40) {
        nickname = username.trim();
        logger.info(`从 DOM 提取到昵称: ${nickname}`);
      }
    }

    // If no nickname from DOM, try avatar indicator element for nickname
    if (!nickname) {
      const avatarEl = page.locator(LOGIN_SELECTORS.avatarIndicator).first();
      if ((await avatarEl.count().catch(() => 0)) && (await avatarEl.isVisible().catch(() => false))) {
        const altText = await avatarEl.getAttribute('alt').catch(() => '') || '';
        if (altText && altText.trim().length < 40) {
          nickname = altText.trim();
          logger.info(`从头像 alt 提取到昵称: ${nickname}`);
        }
      }
    }

    // Retry profile detection with JS probe
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const profile = await detectXhsProfileInPage(page);
        if (profile) {
          nickname = nickname || profile.nickname || undefined;
          avatarUrl = avatarUrl || profile.avatarUrl || undefined;
          logger.info(`已提取用户信息 (attempt ${attempt + 1}): nickname=${nickname}, avatarUrl=${avatarUrl ? avatarUrl.substring(0, 60) : 'N/A'}`);
        }
        if (nickname || avatarUrl) {
          break;
        }
      } catch (error) {
        logger.warn(`提取用户 profile 失败 (attempt ${attempt + 1}):`, error);
      }
      if (attempt < 2) {
        await page.waitForTimeout(2000);
      }
    }

    if (!nickname && !avatarUrl) {
      logger.info('未能从页面提取用户 profile，使用默认值');
    }

    options.onLoginConfirmed?.();

    const verifySuccess = await debugRecorder.recordStep('verify_cookie', async () => {
      return await validateExistingCookie(cookiePath);
    }, pageCtx);
    if (!verifySuccess) {
      return {
        success: false,
        cookiePath,
        message: 'Cookie 保存后验证失败',
      };
    }

    return {
      success: true,
      cookiePath,
      message: '小红书扫码登录成功',
      nickname,
      avatarUrl,
    };
  } catch (error) {
    logger.error('登录过程出错:', error);
    return {
      success: false,
      cookiePath,
      message: `登录过程出错: ${error}`,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

/** 获取二维码图片路径（不等待扫码完成） */
export async function getQRCode(accountId: string): Promise<string> {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: CHROME_ARGS,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(XHS_URLS.loginPage, { timeout: 30000 });
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

/** 检查指定账号的 Cookie 是否有效 */
export async function checkCookie(accountId: string, cookiePath?: string): Promise<boolean> {
  return validateExistingCookie(cookiePath || getCookiePath(accountId));
}