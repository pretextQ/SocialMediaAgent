import path from 'path';
import fs from 'fs';
import type { BrowserContext, Page } from 'patchright';
import { chromium } from 'patchright';
import { Logger } from '../../core/Logger';
import { DOUYIN_URLS, LOGIN_SELECTORS } from './selectors';
import { getCookiePath, saveCookie, cookieExists } from './cookie';
import type { CookieResult, LoginOptions } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { getDebugRecorder } from '../base/DebugRecorder';
import {
  detectDouyinLoginInPage,
  hasRequiredDouyinCookies,
} from './login-detection';

const logger = new Logger('DouyinLogin');

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
  if (!hasRequiredDouyinCookies(cookies)) {
    throw new Error('登录完成后缺少 sessionid 或 sid_tt');
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
 * 抖音的登录验证逻辑：
 * 与视频号不同，抖音登录成功后页面会有明显变化，
 * 需要检测是否跳转到创作者中心且登录标记消失。
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
    const cookies = await context.cookies('https://creator.douyin.com');
    if (!hasRequiredDouyinCookies(cookies)) {
      logger.info('Cookie 验证失败: 缺少 sessionid 或 sid_tt');
      return false;
    }

    const page = await context.newPage();

    await page.goto(DOUYIN_URLS.upload, { timeout: 15000, waitUntil: 'domcontentloaded' });

    const detection = await detectDouyinLoginInPage(page);
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
 * 从抖音登录页提取二维码
 * 抖音登录页需要先点击"扫码登录" tab，然后才能获取二维码。
 */
async function extractQrCodeSrc(page: Page): Promise<string> {
  // 点击扫码登录 tab（如果还没在扫码登录 tab 上）
  const scanTab = page.getByText('扫码登录', { exact: true }).first();
  if (await scanTab.isVisible().catch(() => false)) {
    const rc = new PageRiskControl(page, {
      typingDelayMs: { min: 50, max: 200 },
      clickDelayMs: { min: 100, max: 300 },
    });
    await rc.humanClick('text="扫码登录"');
    await page.waitForTimeout(1000);
  }

  // 等待二维码图片加载
  const qrCodeImg = page.locator(LOGIN_SELECTORS.qrCodeImage).first();
  await qrCodeImg.waitFor({ state: 'visible', timeout: 30000 });

  const src = await qrCodeImg.getAttribute('src');
  if (!src) {
    throw new Error('未获取到抖音登录二维码地址');
  }

  logger.info('已获取抖音二维码');
  return src;
}

async function saveQrCodeImage(src: string, accountId: string): Promise<string> {
  const { app } = await import('electron');
  const userDataPath = app.getPath('userData');
  const qrDir = path.join(userDataPath, 'qrcodes', 'douyin');

  if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
  }

  const qrPath = path.join(qrDir, `${accountId}-${Date.now()}.png`);

  if (src.startsWith('data:image')) {
    const base64Data = src.split(',')[1];
    fs.writeFileSync(qrPath, Buffer.from(base64Data, 'base64'));
  } else if (src.startsWith('http')) {
    // 抖音二维码可能是网络图片 URL
    const response = await fetch(src);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(qrPath, buffer);
  } else {
    throw new Error(`不支持的二维码 src 格式: ${src.substring(0, 50)}`);
  }

  logger.info(`抖音二维码已保存: ${qrPath}`);
  return qrPath;
}

/**
 * 检测抖音是否登录成功
 * 抖音扫码后页面会自动跳转到创作者中心，
 * 登录相关元素（二维码、扫码登录 tab 等）会消失。
 */
async function isLoginCompleted(page: Page): Promise<boolean> {
  const currentUrl = page.url();

  const pageDetection = await detectDouyinLoginInPage(page);
  if (pageDetection.loggedIn) {
    logger.info(`登录检测：抖音页面探测成功 (${pageDetection.reason})`);
    return true;
  }

  if (currentUrl.includes('/creator-micro/home') || currentUrl.includes('/creator-micro/content')) {
    logger.info(`登录检测：已进入创作者中心但未取得登录态证据 (${currentUrl}, reason=${pageDetection.reason})`);
  }

  // 在创作者首页检测登录标记是否消失
  if (currentUrl.startsWith(DOUYIN_URLS.creatorHome) || currentUrl.startsWith(DOUYIN_URLS.upload)) {
    const loginMarkers = [
      page.getByText('扫码登录', { exact: true }).first(),
      page.getByText('手机号登录', { exact: true }).first(),
      page.locator(LOGIN_SELECTORS.qrCodeImage).first(),
    ];

    for (const marker of loginMarkers) {
      if (!(await marker.count())) {
        continue;
      }
      try {
        if (await marker.isVisible()) {
          return false;
        }
      } catch {
        continue;
      }
    }

    // 所有登录标记都不可见，检查是否有用户信息
    const avatarIndicator = page.locator('[class*="avatar"] img').first();
    if ((await avatarIndicator.count()) && (await avatarIndicator.isVisible().catch(() => false))) {
      return true;
    }
  }

  return false;
}

/**
 * 处理二维码过期并自动刷新
 * 抖音二维码有效期约 5 分钟，过期后需要刷新。
 */
async function handleExpiredQrCode(page: Page, accountId: string, onQRRefresh?: (path: string) => void): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });
  const expiredText = page.getByText('二维码已失效', { exact: false });
  const refreshBtn = page.getByText('重新获取', { exact: true }).first();

  const isExpired = (await expiredText.count()) && (await expiredText.isVisible().catch(() => false));
  const hasRefreshBtn = (await refreshBtn.count()) && (await refreshBtn.isVisible().catch(() => false));

  if (isExpired || hasRefreshBtn) {
    logger.info('抖音二维码已过期，正在刷新...');

    if (hasRefreshBtn) {
      await rc.humanClick('text="重新获取"');
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
 * 轮询等待用户完成抖音扫码
 * 抖音扫码流程：打开二维码 → 用户抖音 APP 扫码 → 手机确认 → 页面跳转
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
      logger.info(`抖音扫码成功，已跳转到: ${page.url()}`);
      return true;
    }

    await handleExpiredQrCode(page, accountId, onQRRefresh);

    if (i > 0 && i % 10 === 0) {
      const elapsed = Math.floor((i * QR_POLL_INTERVAL_MS) / 1000);
      logger.info(`等待抖音扫码中... 已等待 ${elapsed} 秒`);
    }

    await page.waitForTimeout(QR_POLL_INTERVAL_MS);
  }

  logger.error(`扫码等待超时（${LOGIN_TIMEOUT_MS / 1000} 秒）`);
  return false;
}

/**
 * 抖音扫码登录主入口
 *
 * 流程与视频号类似但有区别：
 * 1. 打开 creator.douyin.com → 需要点击"扫码登录" tab 显示二维码
 * 2. 用户用抖音 APP 扫描二维码
 * 3. 在手机抖音 APP 上确认登录
 * 4. 页面自动跳转到创作者中心
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
  debugRecorder.setSessionId(`douyin_login_${accountId}_${Date.now()}`);
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
    logger.info('Cookie 已失效，准备抖音扫码登录');
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

    logger.info('打开抖音创作者中心...');
    await debugRecorder.recordStep('goto_login_page', async () => {
      await page.goto(DOUYIN_URLS.loginPage, { timeout: 30000 });
    }, pageCtxWithPage);

    await debugRecorder.recordStep('extract_qr_code', async () => {
      const qrSrc = await extractQrCodeSrc(page);
      const qrPath = await saveQrCodeImage(qrSrc, accountId);
      logger.info('请使用抖音 APP 扫描二维码登录');
      logger.info(`二维码文件: ${qrPath}`);
      onQRReady?.(qrPath);
    }, pageCtxWithPage);

    await debugRecorder.recordStep('wait_scan_login', async () => {
      const loginSuccess = await waitForLogin(page, accountId, onQRRefresh);
      if (!loginSuccess) {
        throw new Error(`等待抖音扫码超时（${LOGIN_TIMEOUT_MS / 1000} 秒）`);
      }
    }, pageCtxWithPage);

    await page.waitForTimeout(3000);

    let extractedNickname = '';
    let extractedAvatarUrl = '';
    try {
      const apiResult = await page.evaluate(async () => {
        try {
          const resp = await fetch('https://creator.douyin.com/web/api/media/user/info/');
          if (!resp.ok) return null;
          const body = await resp.json();
          if (body.status_code === 0 && body.user) {
            const avatarUrl = body.user.avatar_thumb?.url_list?.[0] || '';
            return { nickname: body.user.nickname || '', avatarUrl };
          }
          return null;
        } catch { return null; }
      });
      if (apiResult) {
        extractedNickname = apiResult.nickname || '';
        extractedAvatarUrl = apiResult.avatarUrl || '';
        if (extractedNickname) {
          logger.info(`登录账号: ${extractedNickname}`);
        }
      }
    } catch (err) {
      logger.warn('提取登录用户信息失败:', err);
    }

    await saveCookie(context, cookiePath);
    logger.info(`Cookie 已保存: ${cookiePath}`);

    await syncCookiesToElectronSession(context, accountId);

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
      message: '抖音扫码登录成功',
      nickname: extractedNickname || undefined,
      avatarUrl: extractedAvatarUrl || undefined,
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

    await page.goto(DOUYIN_URLS.loginPage, { timeout: 30000 });
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