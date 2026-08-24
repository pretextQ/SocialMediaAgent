import type { BrowserContext, Page } from 'patchright';
import type { 
  Platform, 
  BrowserConfig, 
  LoginResult, 
  LoginStartPayload,
  PlatformCookieConfig 
} from './types';
import { PLATFORM_COOKIE_CONFIGS } from './types';
import { createBrowserLauncher } from './browser-launcher';
import { LoginDetector } from './login-detector';
import { SessionManager } from './session-manager';
import { LoginLockManager, handleDuplicateLogin } from './login-lock';
import { BrowserDisconnectHandler } from './browser-disconnect';
import type { IBrowserLauncher } from './types';
import { browserManager } from './embedded-browser/browser-manager';
import { session as electronSession } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectChannelsLoginInWebContents,
  detectChannelsProfileInPage,
  detectChannelsProfileInWebContents,
  normalizeChannelsProfile,
  type ChannelsProfileResult,
} from '../platform/channels/login-detection';
import {
  detectXhsLoginInWebContents,
  detectXhsProfileInWebContents,
  type XhsProfileResult,
} from '../platform/xiaohongshu/login-detection';
import { isChannelsPlatform, normalizePlatformId } from './platform-normalizer';

export interface UserProfile {
  nickname: string;
  avatarUrl: string;
  homepageUrl?: string;
}

const PROFILE_SELECTORS: Record<string, { nickname: string[]; avatar: string[]; homepage: string[] }> = {
  kuaishou: {
    nickname: [
      '.user-name', '.nickname', '.user-nickname',
      '[class*="user"] [class*="name"]', '[class*="nick"]',
      '.header-user-name', '.user-info-name',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '.header-user-avatar img', '[class*="user-img"] img',
    ],
    homepage: [
      'a[href*="kuaishou.com/profile/"]',
      'a[href*="kuaishou.com/user/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
  xiaohongshu: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '[class*="creator-name"]',
      '.sidebar-user-name', '.user-info .name',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '[class*="user-avatar"] img', '.sidebar-avatar img',
    ],
    homepage: [
      'a[href*="xiaohongshu.com/user/profile/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
  douyin: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '.creator-name', '[class*="user-name"]',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '[class*="user-img"] img', '.creator-avatar img',
    ],
    homepage: [
      'a[href*="douyin.com/user/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
  channels: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '.account-name', '[class*="nickname"]',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '.account-avatar img', '[class*="user-img"] img',
    ],
    homepage: [],
  },
  bilibili: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '.header-avatar-name',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '.header-avatar img', '[class*="user-img"] img',
    ],
    homepage: [
      'a[href*="space.bilibili.com/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
};

export interface AccountLoginServiceOptions {
  sendIPC: (channel: string, data: unknown) => void;
  onLog?: (message: string, data?: Record<string, unknown>) => void;
  getExistingAccounts?: (platform: Platform) => Promise<Array<{ id: string; nickname?: string }>>;
  updateAccountStatus?: (accountId: string, status: string, storagePath?: string, profile?: UserProfile, browserMode?: string) => Promise<string | void>;
  createAccount?: (accountId: string, platform: Platform, storagePath: string, profile: UserProfile | undefined, browserMode: string) => Promise<string>;
}

export class AccountLoginService {
  private sessionManager: SessionManager;
  private lockManager: LoginLockManager;
  private currentLauncher: IBrowserLauncher | null = null;
  private currentDetector: LoginDetector | null = null;
  private disconnectHandler: BrowserDisconnectHandler | null = null;
  private options: AccountLoginServiceOptions;

  constructor(options: AccountLoginServiceOptions) {
    this.options = options;
    this.sessionManager = new SessionManager();
    this.lockManager = LoginLockManager.getInstance();
    
    this.lockManager.setCallbacks(
      (data) => this.options.sendIPC('account:login-blocked', data),
      (data) => this.options.sendIPC('account:login-queued', data)
    );
  }

  async startLogin(payload: LoginStartPayload): Promise<LoginResult> {
    const platform = normalizePlatformId(payload.platform);
    const { browserConfig, existingAccountId } = payload;
    
    this.log('startLogin', { platform, browserType: browserConfig.type, existingAccountId });
    
    if (this.lockManager.hasActiveLogin()) {
      this.log('startLogin blocked', { reason: 'already_logging_in' });
      this.lockManager.notifyBlocked(platform);
      return {
        success: false,
        status: 'failed',
        error: '已有登录进行中',
      };
    }

    const releaseLock = await this.lockManager.acquire(platform);
    
    try {
      const decision = await handleDuplicateLogin(
        platform,
        existingAccountId,
        this.options.getExistingAccounts 
          ? await this.options.getExistingAccounts(platform) 
          : undefined
      );

      this.log('duplicateLoginDecision', { action: decision.action, targetAccountId: decision.targetAccountId });

      if (decision.action === 'cancel') {
        return { success: false, status: 'cancelled' };
      }

      const accountId = decision.targetAccountId || this.generateAccountId(platform);
      this.log('accountIdGenerated', { accountId });

      this.options.sendIPC('account:login-status', { 
        status: 'logging_in', 
        accountId, 
        platform 
      });

      let storagePath: string;
      let profile: UserProfile | undefined;
      let persistedAccountId = accountId;

      if (browserConfig.type === 'embedded') {
        const result = await this.handleEmbeddedLogin(platform, accountId);
        storagePath = result.storagePath;
        profile = result.profile;
      } else {
        const result = await this.handleExternalLogin(platform, accountId, browserConfig);
        storagePath = result.storagePath;
        profile = result.profile;
      }

      this.log('loginFlowCompleted', { accountId, storagePath, profile: profile ? { nickname: profile.nickname, hasAvatar: !!profile.avatarUrl } : null, hasUpdateAccountStatus: !!this.options.updateAccountStatus, hasCreateAccount: !!this.options.createAccount });

      if (decision.action === 'overwrite' && this.options.updateAccountStatus) {
        const updatedAccountId = await this.options.updateAccountStatus(accountId, 'online', storagePath, profile, browserConfig.type);
        persistedAccountId = updatedAccountId || accountId;
        this.log('accountStatusUpdated', { accountId: persistedAccountId });
      } else if (this.options.createAccount) {
        persistedAccountId = await this.options.createAccount(accountId, platform, storagePath, profile, browserConfig.type);
        this.log('accountCreated', { accountId: persistedAccountId, platform });
      } else {
        this.log('WARNING: no account persistence callback', { accountId });
      }

      await this.cleanup();

      this.options.sendIPC('account:login-success', {
        accountId: persistedAccountId,
        platform,
        storagePath,
      });

      this.log('loginSuccess', { accountId: persistedAccountId, platform });

      return {
        success: true,
        status: 'online',
        accountId: persistedAccountId,
        platform,
        storagePath,
      };

    } catch (error) {
      this.log('loginError', { error: String(error), platform });
      await this.cleanup();
      
      this.options.sendIPC('account:login-failed', {
        error: String(error),
        reason: '登录过程出错',
        platform,
      });

      return {
        success: false,
        status: 'failed',
        platform,
        error: String(error),
      };
    } finally {
      releaseLock();
    }
  }

  private log(message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}] [AccountLogin] ${message}`, data ? JSON.stringify(data) : '');
    this.options.onLog?.(message, data);
  }

  private async handleEmbeddedLogin(platform: Platform, accountId: string): Promise<{ storagePath: string; profile?: UserProfile }> {
    this.log('handleEmbeddedLogin start (WebContentsView)', { platform, accountId });

    const config = PLATFORM_COOKIE_CONFIGS[platform];

    const contentView = await browserManager.createTab(accountId, platform, config.loginUrl);

    this.options.sendIPC('account:login-status', {
      status: 'detecting',
      accountId,
      platform,
    });

    this.log('waitForEmbeddedLogin start', { platform, accountId });

    const loginSuccess = await this.waitForCookies(accountId, platform, config, contentView.webContents);

    this.log('waitForEmbeddedLogin result', { loginSuccess });

    if (!loginSuccess) {
      await browserManager.closeTab(accountId);
      throw new Error('登录超时');
    }

    this.log('reading cookies after login success');

    const partition = `persist:${accountId}`;
    const ses = electronSession.fromPartition(partition);
    const allCookies: Electron.Cookie[] = [];
    if (isChannelsPlatform(platform)) {
      allCookies.push(...await ses.cookies.get({ url: 'https://channels.weixin.qq.com' }));
    } else {
      for (const domain of config.domains) {
        const domainCookies = await ses.cookies.get({ domain });
        allCookies.push(...domainCookies);
      }
    }

    this.log('cookies read', { count: allCookies.length, cookieNames: allCookies.map(c => c.name) });

    const origins = await this.extractStorageOrigins(contentView.webContents);
    const storagePath = await this.sessionManager.saveFromElectronCookies(
      allCookies,
      accountId,
      platform,
      origins
    );
    this.log('sessionSaved', { storagePath });

    const profile = await this.extractProfileFromWebContents(platform, contentView.webContents, accountId);
    this.log('profileExtracted', { profile: profile ? { nickname: profile.nickname, hasAvatar: !!profile.avatarUrl } : null });

    await browserManager.closeTab(accountId);

    return { storagePath, profile };
  }

  private async waitForCookies(
    accountId: string,
    platform: Platform,
    config: PlatformCookieConfig,
    webContents: Electron.WebContents | null,
    timeout = 300000
  ): Promise<boolean> {
    const partition = `persist:${accountId}`;
    const startTime = Date.now();
    const checkInterval = 3000;
    const loginUrl = config.loginUrl.replace(/\/$/, '');

    while (Date.now() - startTime < timeout) {
      try {
        const ses = electronSession.fromPartition(partition);
        let hasAllRequiredCookies = false;
        const cookieGroups = isChannelsPlatform(platform)
          ? [await ses.cookies.get({ url: 'https://channels.weixin.qq.com' })]
          : await Promise.all(config.domains.map(domain => ses.cookies.get({ domain })));
        for (const cookies of cookieGroups) {
          const cookieNames = cookies.map(c => c.name);
          if (config.requiredCookies.every(name => cookieNames.includes(name))) {
            hasAllRequiredCookies = true;
            break;
          }
        }

        if (hasAllRequiredCookies) {
          if (!isChannelsPlatform(platform)) {
            // For XHS, also verify the page shows logged-in state before returning
            if (platform === 'xiaohongshu' && webContents && !webContents.isDestroyed()) {
              const currentUrl = webContents.getURL();
              const detection = await detectXhsLoginInWebContents(webContents, currentUrl);
              if (detection.loggedIn) {
                this.log('waitForCookies: xhs page detected login', {
                  currentUrl,
                  reason: detection.reason,
                });
                return true;
              }
              // Cookies present but page doesn't show logged-in state yet - keep waiting
              this.log('waitForCookies: xhs cookies present but page not logged in', { currentUrl, reason: detection.reason });
            } else {
              return true;
            }
          }

          if (webContents && !webContents.isDestroyed()) {
            const currentUrl = webContents.getURL();
            const detection = await detectChannelsLoginInWebContents(webContents, currentUrl);
            if (detection.loggedIn) {
              this.log('waitForCookies: channels page detected login', {
                currentUrl,
                reason: detection.reason,
                errCode: detection.errCode,
              });
              return true;
            }
          }
        }

        if (webContents && !webContents.isDestroyed() && !isChannelsPlatform(platform)) {
          const currentUrl = webContents.getURL();

          // XHS-specific: use page-based login detection as fallback
          if (platform === 'xiaohongshu') {
            const detection = await detectXhsLoginInWebContents(webContents, currentUrl);
            if (detection.loggedIn) {
              this.log('waitForCookies: xhs page fallback detected login', {
                currentUrl,
                reason: detection.reason,
              });
              return true;
            }
          }

          // URL-based fallback for non-XHS platforms
          if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.includes(loginUrl) && !currentUrl.includes('login')) {
            this.log('waitForCookies: URL fallback detected login', { currentUrl, loginUrl });
            return true;
          }
        }
      } catch (err) {
        this.log('waitForCookies error', { error: String(err) });
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  private async extractProfileFromWebContents(platform: Platform, webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    if (platform === 'bilibili') {
      return this.extractBilibiliProfile(webContents, accountId);
    }

    let channelsProfile: UserProfile | undefined;
    if (isChannelsPlatform(platform)) {
      channelsProfile = await this.extractChannelsProfileFromWebContents(webContents, accountId);
      if (this.hasLocalAvatar(channelsProfile)) {
        return channelsProfile;
      }
    }

    let xhsProfile: UserProfile | undefined;
    if (platform === 'xiaohongshu') {
      xhsProfile = await this.extractXhsProfileFromWebContents(webContents, accountId);
      if (xhsProfile && (xhsProfile.nickname || xhsProfile.avatarUrl)) {
        if (this.hasLocalAvatar(xhsProfile)) {
          return { ...xhsProfile, homepageUrl: xhsProfile.homepageUrl || channelsProfile?.homepageUrl || undefined };
        }
        return xhsProfile;
      }
    }

    const selectors = PROFILE_SELECTORS[platform];
    if (!selectors) return undefined;

    try {
      const nicknameSelectors = selectors.nickname.map(s => `'${s}'`).join(', ');
      const avatarSelectors = selectors.avatar.map(s => `'${s}'`).join(', ');
      const homepageSelectors = (selectors.homepage || []).map(s => `'${s}'`).join(', ');

      const result = await webContents.executeJavaScript(`
        (function() {
          var nicknameSelectors = [${nicknameSelectors}];
          var avatarSelectors = [${avatarSelectors}];
          var homepageSelectors = [${homepageSelectors}];
          var nickname = '';
          var avatarUrl = '';
          var homepageUrl = '';

          for (var i = 0; i < nicknameSelectors.length; i++) {
            var el = document.querySelector(nicknameSelectors[i]);
            if (el && el.textContent && el.textContent.trim()) {
              nickname = el.textContent.trim();
              break;
            }
          }

          for (var i = 0; i < avatarSelectors.length; i++) {
            var el = document.querySelector(avatarSelectors[i]);
            if (el && (el.src || el.getAttribute('src'))) {
              avatarUrl = el.src || el.getAttribute('src');
              if (avatarUrl && !avatarUrl.startsWith('data:') && avatarUrl.length > 10) break;
              if (avatarUrl && avatarUrl.startsWith('data:') && avatarUrl.length > 200) break;
              avatarUrl = '';
            }
          }

          for (var i = 0; i < homepageSelectors.length; i++) {
            var el = document.querySelector(homepageSelectors[i]);
            if (el && el.href && el.href.startsWith('http')) {
              homepageUrl = el.href;
              break;
            }
          }

          return { nickname: nickname, avatarUrl: avatarUrl, homepageUrl: homepageUrl };
        })()
      `);

      if (result && (result.nickname || result.avatarUrl)) {
        let avatarPath = '';
        if (result.avatarUrl && result.avatarUrl.startsWith('http')) {
          try {
            avatarPath = await this.downloadAvatar(result.avatarUrl, platform, accountId);
          } catch (err) {
            this.log('downloadAvatar error', { error: String(err), platform });
          }
        }

        let nickname = result.nickname || channelsProfile?.nickname || '';
        if (!nickname && platform === 'douyin') {
          try {
            nickname = await this.fetchDouyinNicknameViaApi(webContents);
            if (nickname) {
              this.log('douyin nickname from api', { nickname });
            }
          } catch (err) {
            this.log('douyin api nickname error', { error: String(err) });
          }
        }

        return {
          nickname,
          avatarUrl: avatarPath || channelsProfile?.avatarUrl || result.avatarUrl || '',
          homepageUrl: result.homepageUrl || channelsProfile?.homepageUrl || undefined,
        };
      }
    } catch (err) {
      this.log('extractProfile error', { error: String(err) });
    }

    if (platform === 'douyin') {
      try {
        const apiProfile = await this.fetchDouyinProfileViaApi(webContents, accountId);
        if (apiProfile) {
          this.log('douyin profile from api fallback', { nickname: apiProfile.nickname, hasAvatar: !!apiProfile.avatarUrl });
          return apiProfile;
        }
      } catch (err) {
        this.log('douyin api profile error', { error: String(err) });
      }
    }

    if (platform === 'xiaohongshu') {
      try {
        const apiProfile = await this.fetchXhsProfileViaApi(webContents, accountId);
        if (apiProfile) {
          this.log('xhs profile from api fallback', { nickname: apiProfile.nickname, hasAvatar: !!apiProfile.avatarUrl });
          return apiProfile;
        }
      } catch (err) {
        this.log('xhs api profile error', { error: String(err) });
      }
    }

    return channelsProfile;
  }

  private async fetchDouyinProfileViaApi(webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    const result = await webContents.executeJavaScript(`
      (async function() {
        try {
          var resp = await fetch('https://creator.douyin.com/web/api/media/user/info/');
          if (!resp.ok) return null;
          var body = await resp.json();
          if (body.status_code === 0 && body.user) {
            return {
              nickname: body.user.nickname || '',
              avatarUrl: (body.user.avatar_thumb && body.user.avatar_thumb.url_list && body.user.avatar_thumb.url_list[0]) || ''
            };
          }
          return null;
        } catch(e) {
          return null;
        }
      })()
    `);
    if (!result || typeof result !== 'object') return undefined;
    const nickname = result.nickname || '';
    const rawAvatarUrl = result.avatarUrl || '';
    let avatarPath = '';
    if (rawAvatarUrl && rawAvatarUrl.startsWith('http')) {
      try {
        avatarPath = await this.downloadAvatar(rawAvatarUrl, 'douyin', accountId);
      } catch (err) {
        this.log('douyin api downloadAvatar error', { error: String(err) });
      }
    }
    const profile = {
      nickname,
      avatarUrl: avatarPath || rawAvatarUrl || '',
      homepageUrl: 'https://creator.douyin.com/creator-micro/home',
    };
    return profile.nickname || profile.avatarUrl ? profile : undefined;
  }

  private async fetchDouyinNicknameViaApi(webContents: Electron.WebContents): Promise<string> {
    const apiUrl = 'https://creator.douyin.com/web/api/media/user/info/';
    const result = await webContents.executeJavaScript(`
      (async function() {
        try {
          var resp = await fetch('${apiUrl}');
          if (!resp.ok) return '';
          var body = await resp.json();
          if (body.status_code === 0 && body.user && body.user.nickname) {
            return body.user.nickname;
          }
          return '';
        } catch(e) {
          return '';
        }
      })()
    `);
    return typeof result === 'string' ? result : '';
  }

  private async fetchXhsProfileViaApi(webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    const result = await webContents.executeJavaScript(`
      (async function() {
        try {
          var resp = await fetch('https://creator.xiaohongshu.com/api/galaxy/user/info', {
            headers: { 'Referer': 'https://creator.xiaohongshu.com/' }
          });
          if (!resp.ok) return null;
          var body = await resp.json();
          if (body && body.result === 0 && body.data) {
            return {
              nickname: body.data.userName || body.data.redId || '',
              avatarUrl: body.data.userAvatar || ''
            };
          }
          return null;
        } catch(e) {
          return null;
        }
      })()
    `);
    if (!result || typeof result !== 'object') return undefined;
    const nickname = result.nickname || '';
    const rawAvatarUrl = result.avatarUrl || '';
    let avatarPath = '';
    if (rawAvatarUrl && (rawAvatarUrl.startsWith('http://') || rawAvatarUrl.startsWith('https://'))) {
      try {
        avatarPath = await this.downloadAvatar(rawAvatarUrl, 'xiaohongshu', accountId);
      } catch (err) {
        this.log('xhs api downloadAvatar error', { error: String(err) });
      }
    }
    const profile = {
      nickname,
      avatarUrl: avatarPath || rawAvatarUrl || '',
      homepageUrl: 'https://creator.xiaohongshu.com',
    };
    return profile.nickname || profile.avatarUrl ? profile : undefined;
  }

  private async handleExternalLogin(platform: Platform, accountId: string, browserConfig: BrowserConfig): Promise<{ storagePath: string; profile?: UserProfile }> {
    this.currentLauncher = createBrowserLauncher(browserConfig);

    const context = await this.currentLauncher.launch(browserConfig, accountId);
    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    this.disconnectHandler = new BrowserDisconnectHandler({
      accountId,
      onDisconnect: () => {
        this.options.sendIPC('account:login-cancelled', {
          accountId,
          reason: 'browser_disconnected',
        });
      },
      onLog: this.options.onLog,
    });

    const browser = this.currentLauncher.getBrowser();
    if (browser) {
      this.disconnectHandler.attach(browser);
    }

    const config = PLATFORM_COOKIE_CONFIGS[platform];
    await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

    this.options.sendIPC('account:login-status', { 
      status: 'detecting', 
      accountId, 
      platform 
    });

    this.currentDetector = new LoginDetector(
      2000,
      300000,
      (data) => this.options.sendIPC('account:network-slow', data)
    );

    const loginSuccess = await this.currentDetector.waitForLogin(context, platform, 300000);

    if (!loginSuccess) {
      throw new Error('登录超时');
    }

    const storagePath = await this.sessionManager.save(context, accountId, platform);
    const profile = await this.extractProfileFromBrowserContext(platform, context, page, accountId);
    return { storagePath, profile };
  }

  private async waitForEmbeddedLogin(page: Page, context: BrowserContext, platform: Platform, accountId: string): Promise<boolean> {
    this.currentDetector = new LoginDetector(
      2000,
      300000,
      (data) => this.options.sendIPC('account:network-slow', data)
    );

    const loginSuccess = await this.currentDetector.waitForLogin(context, platform, 300000);
    return loginSuccess;
  }

  cancelLogin(): void {
    if (this.currentDetector) {
      this.currentDetector.cancel();
    }
  }

  private async extractProfileFromBrowser(platform: Platform, page: Page, accountId?: string): Promise<UserProfile | undefined> {
    if (!page) {
      this.log('extractProfile skipped', { reason: 'no page' });
      return undefined;
    }

    let channelsProfile: UserProfile | undefined;
    if (isChannelsPlatform(platform) && accountId) {
      channelsProfile = await this.extractChannelsProfileFromPage(page, accountId);
      if (this.hasLocalAvatar(channelsProfile)) {
        return channelsProfile;
      }
    }

    const selectors = PROFILE_SELECTORS[platform];
    if (!selectors) {
      this.log('extractProfile skipped', { reason: 'no selectors for platform', platform });
      return undefined;
    }

    try {
      const nicknameSelectors = selectors.nickname.map(s => `'${s}'`).join(', ');
      const avatarSelectors = selectors.avatar.map(s => `'${s}'`).join(', ');
      const homepageSelectors = (selectors.homepage || []).map(s => `'${s}'`).join(', ');

      const result = await page.evaluate<{ nickname: string; avatarUrl: string; homepageUrl: string }>(`
        (function() {
          var nicknameSelectors = [${nicknameSelectors}];
          var avatarSelectors = [${avatarSelectors}];
          var homepageSelectors = [${homepageSelectors}];
          var nickname = '';
          var avatarUrl = '';
          var homepageUrl = '';

          for (var i = 0; i < nicknameSelectors.length; i++) {
            var el = document.querySelector(nicknameSelectors[i]);
            if (el && el.textContent && el.textContent.trim()) {
              nickname = el.textContent.trim();
              break;
            }
          }

          for (var i = 0; i < avatarSelectors.length; i++) {
            var el = document.querySelector(avatarSelectors[i]);
            if (el && (el.src || el.getAttribute('src'))) {
              avatarUrl = el.src || el.getAttribute('src');
              if (avatarUrl && !avatarUrl.startsWith('data:') && avatarUrl.length > 10) break;
              if (avatarUrl && avatarUrl.startsWith('data:') && avatarUrl.length > 200) break;
              avatarUrl = '';
            }
          }

          for (var i = 0; i < homepageSelectors.length; i++) {
            var el = document.querySelector(homepageSelectors[i]);
            if (el && el.href && el.href.startsWith('http')) {
              homepageUrl = el.href;
              break;
            }
          }

          return { nickname: nickname, avatarUrl: avatarUrl, homepageUrl: homepageUrl };
        })()
      `);

      this.log('extractProfile raw result', result);

      if (result && (result.nickname || result.avatarUrl)) {
        let avatarPath = '';
        if (accountId && result.avatarUrl && result.avatarUrl.startsWith('http')) {
          try {
            avatarPath = await this.downloadAvatar(result.avatarUrl, platform, accountId);
          } catch (err) {
            this.log('downloadAvatar browser error', { error: String(err), platform });
          }
        }
        return {
          nickname: result.nickname || channelsProfile?.nickname || '',
          avatarUrl: avatarPath || channelsProfile?.avatarUrl || result.avatarUrl || '',
          homepageUrl: result.homepageUrl || channelsProfile?.homepageUrl || undefined,
        };
      }
    } catch (err) {
      this.log('extractProfile error', { error: String(err) });
    }

    return channelsProfile;
  }

  private async extractProfileFromBrowserContext(
    platform: Platform,
    context: BrowserContext,
    fallbackPage: Page,
    accountId: string
  ): Promise<UserProfile | undefined> {
    let bestChannelsProfile: UserProfile | undefined;
    if (isChannelsPlatform(platform)) {
      for (const candidate of context.pages()) {
        const profile = await this.extractChannelsProfileFromPage(candidate, accountId);
        if (this.hasLocalAvatar(profile)) {
          return profile;
        }
        bestChannelsProfile = bestChannelsProfile || profile;
      }
    }

    const fallbackProfile = await this.extractProfileFromBrowser(platform, fallbackPage, accountId);
    if (this.hasLocalAvatar(fallbackProfile)) {
      return fallbackProfile;
    }
    return fallbackProfile || bestChannelsProfile;
  }

  private async cleanup(): Promise<void> {
    if (this.disconnectHandler) {
      await this.disconnectHandler.gracefulClose();
      this.disconnectHandler = null;
    }

    if (this.currentLauncher) {
      await this.currentLauncher.close();
      this.currentLauncher = null;
    }

    this.currentDetector = null;
  }

  private async extractChannelsProfileFromWebContents(webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    let bestProfile: UserProfile | undefined;
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const profile = await detectChannelsProfileInWebContents(webContents, webContents.getURL())
          || await this.fetchChannelsProfileFromElectronSession(webContents);
        const built = await this.buildChannelsProfile(profile, accountId);
        if (this.hasLocalAvatar(built)) {
          return built;
        }
        bestProfile = built || bestProfile;
      } catch (err) {
        this.log('extractChannelsProfile error', { error: String(err), attempt });
      }
      await this.sleep(1000);
    }
    return bestProfile;
  }

  private async extractChannelsProfileFromPage(page: Page, accountId: string): Promise<UserProfile | undefined> {
    let bestProfile: UserProfile | undefined;
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const profile = await detectChannelsProfileInPage(page)
          || await this.fetchChannelsProfileFromBrowserPage(page);
        const built = await this.buildChannelsProfile(profile, accountId);
        if (this.hasLocalAvatar(built)) {
          return built;
        }
        bestProfile = built || bestProfile;
      } catch (err) {
        this.log('extractChannelsProfile page error', { error: String(err), attempt });
      }
      await this.sleep(1000);
    }
    return bestProfile;
  }

  private async extractXhsProfileFromWebContents(webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    let bestProfile: UserProfile | undefined;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const profile = await detectXhsProfileInWebContents(webContents, webContents.getURL());
        if (profile && (profile.nickname || profile.avatarUrl)) {
          this.log('extractXhsProfile found', { attempt, nickname: profile.nickname, hasAvatar: !!profile.avatarUrl });
          let avatarPath = '';
          if (profile.avatarUrl && (profile.avatarUrl.startsWith('http://') || profile.avatarUrl.startsWith('https://'))) {
            try {
              avatarPath = await this.downloadAvatar(profile.avatarUrl, 'xiaohongshu', accountId);
            } catch (err) {
              this.log('extractXhsProfile downloadAvatar error', { error: String(err) });
            }
          }
          const builtProfile = {
            nickname: profile.nickname || '',
            avatarUrl: avatarPath || profile.avatarUrl || '',
            homepageUrl: profile.homepageUrl || 'https://creator.xiaohongshu.com',
          };
          if (builtProfile.nickname) {
            return builtProfile;
          }
          bestProfile = builtProfile;
        }
      } catch (err) {
        this.log('extractXhsProfile error', { error: String(err), attempt });
      }
      await this.sleep(1500);
    }
    // API fallback if DOM detection returned incomplete results (missing avatar or nickname)
    try {
      const apiProfile = await this.fetchXhsProfileViaApi(webContents, accountId);
      if (apiProfile) {
        this.log('extractXhsProfile api fallback', { nickname: apiProfile.nickname, hasAvatar: !!apiProfile.avatarUrl });
        if (bestProfile) {
          return {
            nickname: bestProfile.nickname || apiProfile.nickname || '',
            avatarUrl: bestProfile.avatarUrl || apiProfile.avatarUrl || '',
            homepageUrl: bestProfile.homepageUrl || apiProfile.homepageUrl || 'https://creator.xiaohongshu.com',
          };
        }
        return apiProfile;
      }
    } catch (err) {
      this.log('extractXhsProfile api fallback error', { error: String(err) });
    }
    return bestProfile;
  }

  private async extractStorageOrigins(
    webContents: Electron.WebContents
  ): Promise<Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>> {
    try {
      const result = await webContents.executeJavaScript(`
        (function () {
          if (!window.location.origin || window.location.origin === 'null') return [];
          var entries = [];
          for (var i = 0; i < localStorage.length; i++) {
            var name = localStorage.key(i);
            if (name) entries.push({ name: name, value: localStorage.getItem(name) || '' });
          }
          return [{ origin: window.location.origin, localStorage: entries }];
        })()
      `);
      return Array.isArray(result) ? result : [];
    } catch (err) {
      this.log('extractStorageOrigins error', { error: String(err) });
      return [];
    }
  }

  private async fetchChannelsProfileFromElectronSession(webContents: Electron.WebContents): Promise<ChannelsProfileResult | null> {
    try {
      const cookies = await webContents.session.cookies.get({ url: 'https://channels.weixin.qq.com' });
      const wxCookies = await webContents.session.cookies.get({ url: 'https://weixin.qq.com' }).catch(() => []);
      const mpCookies = await webContents.session.cookies.get({ url: 'https://mp.weixin.qq.com' }).catch(() => []);
      const cookieHeader = [...cookies, ...wxCookies]
        .concat(mpCookies)
        .filter((cookie, index, arr) => arr.findIndex(item => item.name === cookie.name && item.domain === cookie.domain) === index)
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
      return await this.fetchChannelsProfileWithCookie(cookieHeader);
    } catch (err) {
      this.log('fetchChannelsProfileFromElectronSession error', { error: String(err) });
      return null;
    }
  }

  private async fetchChannelsProfileFromBrowserPage(page: Page): Promise<ChannelsProfileResult | null> {
    try {
      const cookies = await page.context().cookies([
        'https://channels.weixin.qq.com',
        'https://weixin.qq.com',
        'https://mp.weixin.qq.com',
      ]);
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      return await this.fetchChannelsProfileWithCookie(cookieHeader);
    } catch (err) {
      this.log('fetchChannelsProfileFromBrowserPage error', { error: String(err) });
      return null;
    }
  }

  private async fetchChannelsProfileWithCookie(cookieHeader: string): Promise<ChannelsProfileResult | null> {
    if (!cookieHeader) {
      return null;
    }

    const nowHex = Math.floor(Date.now() / 1000).toString(16);
    const randomHex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const body = JSON.stringify({
      timestamp: Date.now(),
      _log_finder_uin: '',
      _log_finder_id: '',
      rawKeyBuff: null,
      pluginSessionId: null,
      scene: 7,
      reqScene: 7,
    });

    const responseBody = await new Promise<string>((resolve, reject) => {
      const https = require('https');
      const req = https.request(
        `https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/get_auth_info?_aid=&_rid=${nowHex}-${randomHex}&_pageUrl=https:%2F%2Fchannels.weixin.qq.com%2Fplatform`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Cookie': cookieHeader,
            'Origin': 'https://channels.weixin.qq.com',
            'Referer': 'https://channels.weixin.qq.com/platform',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-Wechat-Uin': '0000000000',
          },
          timeout: 8000,
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('channels auth_info timeout')));
      req.write(body);
      req.end();
    });

    try {
      const parsed = JSON.parse(responseBody);
      const errCode = parsed?.errCode ?? parsed?.errcode ?? parsed?.err_code;
      if (errCode !== 0) {
        this.log('fetchChannelsProfileWithCookie not ready', { errCode });
        return null;
      }
      const profile = normalizeChannelsProfile(parsed);
      if (profile) {
        profile.cookieHeader = cookieHeader;
      }
      return profile;
    } catch (err) {
      this.log('fetchChannelsProfileWithCookie parse error', { error: String(err) });
      return null;
    }
  }

  private async buildChannelsProfile(profile: ChannelsProfileResult | null, accountId: string): Promise<UserProfile | undefined> {
    if (!profile) {
      return undefined;
    }

    const avatarUrl = this.normalizeChannelsAvatarUrl(profile.avatarUrl);
    let avatarPath = '';

    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      try {
        const cookieHeader = profile.cookieHeader || '';
        avatarPath = await this.downloadAvatar(avatarUrl, 'channels', accountId, 0, cookieHeader ? { Cookie: cookieHeader } : {});
      } catch (err) {
        this.log('downloadChannelsAvatar error', { error: String(err) });
      }
    }

    return {
      nickname: profile.nickname || '',
      avatarUrl: avatarPath || avatarUrl,
      homepageUrl: profile.homepageUrl || 'https://channels.weixin.qq.com/platform',
    };
  }

  private normalizeChannelsAvatarUrl(url: string): string {
    if (!url) {
      return '';
    }
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    return url;
  }

  private hasLocalAvatar(profile: UserProfile | undefined): boolean {
    return !!profile?.avatarUrl && profile.avatarUrl.startsWith('local-file://');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async extractBilibiliProfile(webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    try {
      const cookies = await webContents.session.cookies.get({ domain: '.bilibili.com' });
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      const body = await new Promise<string>((resolve, reject) => {
        const https = require('https');
        const req = https.get(
          'https://api.bilibili.com/x/web-interface/nav',
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.bilibili.com',
              ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
            },
          },
          (res: any) => {
            let data = '';
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => resolve(data));
          }
        );
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
      });

      const json = JSON.parse(body);
      if (json.code === 0 && json.data && json.data.isLogin) {
        const { uname, face, mid } = json.data;
        if (uname || face) {
          let avatarUrl = '';

          if (face && face.startsWith('http')) {
            try {
              avatarUrl = await this.downloadAvatar(face, 'bilibili', accountId);
            } catch (err) {
              this.log('extractBilibiliProfile downloadAvatar error', { error: String(err) });
              avatarUrl = face;
            }
          }

          return {
            nickname: uname || '',
            avatarUrl: avatarUrl || face || '',
            homepageUrl: 'https://member.bilibili.com/platform/home',
          };
        }
      }
      this.log('extractBilibiliProfile API returned', { code: json.code, isLogin: json.data?.isLogin, uname: json.data?.uname });
    } catch (err) {
      this.log('extractBilibiliProfile API error', { error: String(err) });
    }

    const selectors = PROFILE_SELECTORS['bilibili'];
    if (!selectors) return undefined;

    try {
      const nicknameSelectors = selectors.nickname.map(s => `'${s}'`).join(', ');
      const avatarSelectors = selectors.avatar.map(s => `'${s}'`).join(', ');
      const homepageSelectors = (selectors.homepage || []).map(s => `'${s}'`).join(', ');

      const result = await webContents.executeJavaScript(`
        (function() {
          var nicknameSelectors = [${nicknameSelectors}];
          var avatarSelectors = [${avatarSelectors}];
          var homepageSelectors = [${homepageSelectors}];
          var nickname = '';
          var avatarUrl = '';
          var homepageUrl = '';

          for (var i = 0; i < nicknameSelectors.length; i++) {
            var el = document.querySelector(nicknameSelectors[i]);
            if (el && el.textContent && el.textContent.trim()) {
              nickname = el.textContent.trim();
              break;
            }
          }

          for (var i = 0; i < avatarSelectors.length; i++) {
            var el = document.querySelector(avatarSelectors[i]);
            if (el && (el.src || el.getAttribute('src'))) {
              avatarUrl = el.src || el.getAttribute('src');
              if (avatarUrl && !avatarUrl.startsWith('data:') && avatarUrl.length > 10) break;
              if (avatarUrl && avatarUrl.startsWith('data:') && avatarUrl.length > 200) break;
              avatarUrl = '';
            }
          }

          for (var i = 0; i < homepageSelectors.length; i++) {
            var el = document.querySelector(homepageSelectors[i]);
            if (el && el.href && el.href.startsWith('http')) {
              homepageUrl = el.href;
              break;
            }
          }

          return { nickname: nickname, avatarUrl: avatarUrl, homepageUrl: homepageUrl };
        })()
      `);

      if (result && (result.nickname || result.avatarUrl)) {
        return {
          nickname: result.nickname || '',
          avatarUrl: result.avatarUrl || '',
          homepageUrl: result.homepageUrl || undefined,
        };
      }
    } catch (err) {
      this.log('extractBilibiliProfile fallback error', { error: String(err) });
    }

    return undefined;
  }

  private getAvatarPath(platform: string, accountId: string): string {
    const dir = path.join(process.cwd(), 'storage', 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${platform}_${accountId}.jpg`);
  }

  private downloadAvatar(
    url: string,
    platform: string,
    accountId: string,
    redirectCount = 0,
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    const filePath = this.getAvatarPath(platform, accountId);
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        reject(new Error(`Invalid avatar URL: ${url}`));
        return;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reject(new Error(`Unsupported avatar protocol: ${parsed.protocol}`));
        return;
      }

      const client = require(parsed.protocol === 'http:' ? 'http' : 'https');
      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://channels.weixin.qq.com/',
          ...extraHeaders,
        },
        timeout: 15000,
      }, (res: any) => {
        const statusCode = res.statusCode || 0;
        const location = res.headers?.location;

        if (statusCode >= 300 && statusCode < 400 && location) {
          if (redirectCount >= 5) {
            reject(new Error('Avatar redirect limit exceeded'));
            return;
          }
          const nextUrl = new URL(location, url).toString();
          this.downloadAvatar(nextUrl, platform, accountId, redirectCount + 1, extraHeaders).then(resolve, reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(filePath);
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          if (bytes <= 0) {
            fs.unlink(filePath, () => {});
            reject(new Error('Avatar response is empty'));
            return;
          }
          resolve(`local-file://${filePath}`);
        });
        file.on('error', (err: Error) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Avatar download timeout'));
      });

      req.on('error', (err: Error) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  }

  private generateAccountId(platform: Platform): string {
    return `${platform}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
