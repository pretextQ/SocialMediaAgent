import { BrowserWindow, ipcMain, shell, session as electronSession } from 'electron';
import { Logger } from '../core/Logger';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import { browserManager } from './embedded-browser/browser-manager';
import type { Platform } from './types';
import { PLATFORM_COOKIE_CONFIGS } from './types';

const logger = new Logger('MultiPanelService');

type BrowserMode = 'embedded' | 'external_chrome' | 'external_fingerprint';

interface PanelSession {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode: BrowserMode;
  createdAt: Date;
}

interface ExternalBrowserSession {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode: BrowserMode;
  createdAt: Date;
}

class MultiPanelService {
  private static instance: MultiPanelService;
  private sessions: Map<string, PanelSession> = new Map();
  private externalSessions: Map<string, ExternalBrowserSession> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private activePanelId: string | null = null;
  private maxPanels = 10;
  private ipcHandlersRegistered = false;

  private constructor() {}

  static getInstance(): MultiPanelService {
    if (!MultiPanelService.instance) {
      MultiPanelService.instance = new MultiPanelService();
    }
    return MultiPanelService.instance;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    browserManager.setMainWindow(window);
    this.registerIPCHandlers();

    window.on('resize', () => {
      this.layoutActivePanel();
    });
  }

  private registerIPCHandlers(): void {
    if (this.ipcHandlersRegistered) return;

    ipcMain.on('panel-address:navigate', (_, data: { panelId: string; url?: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session || !data.url) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.loadURL(data.url);
    });

    ipcMain.on('panel-address:back', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.goBack();
    });

    ipcMain.on('panel-address:forward', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.goForward();
    });

    ipcMain.on('panel-address:refresh', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.reload();
    });

    ipcMain.on('panel-address:open-devtools', (_, data: { panelId: string }) => {
      logger.info(`openDevTools: panelId=${data.panelId}`);
      const session = this.sessions.get(data.panelId);
      if (!session) { logger.warn(`openDevTools: session not found for ${data.panelId}`); return; }
      const view = browserManager.getView(session.accountId);
      if (!view) { logger.warn(`openDevTools: view not found for ${session.accountId}`); return; }
      view.webContents.openDevTools({ mode: 'detach' });
      logger.info(`openDevTools: opened for ${session.accountId}`);
    });

    this.ipcHandlersRegistered = true;
  }

  async openPanel(accountId: string): Promise<PanelSession | null> {
    if (!this.mainWindow) {
      logger.error('主窗口未设置');
      return null;
    }

    const totalPanels = this.sessions.size + this.externalSessions.size;
    if (totalPanels >= this.maxPanels) {
      logger.warn('已达到最大面板数量限制');
      return null;
    }

    const existingEmbedded = Array.from(this.sessions.values()).find(s => s.accountId === accountId);
    if (existingEmbedded) {
      this.focusPanel(existingEmbedded.id);
      return existingEmbedded;
    }

    const existingExternal = Array.from(this.externalSessions.values()).find(s => s.accountId === accountId);
    if (existingExternal) {
      return this.createVirtualPanelSession(existingExternal);
    }

    const account = this.getAccount(accountId);
    if (!account) {
      logger.error(`账号不存在: ${accountId}`);
      return null;
    }

    const browserMode = account.browser_mode || 'embedded';

    if (browserMode !== 'embedded') {
      return this.openExternalBrowser(accountId, browserMode, account);
    }

    const id = `panel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const cookieConfig = PLATFORM_COOKIE_CONFIGS[account.platform as Platform];
      if (cookieConfig) {
        const partition = `persist:${accountId}`;
        const ses = electronSession.fromPartition(partition);
        const nowSec = Date.now() / 1000;

        let hasValidCookies = false;
        for (const domain of cookieConfig.domains) {
          const cookies = await ses.cookies.get({ domain });
          const unexpired = cookies.filter(c => !c.expirationDate || c.expirationDate > nowSec);
          if (cookieConfig.requiredCookies.every((name: string) => unexpired.some(c => c.name === name))) {
            hasValidCookies = true;
            break;
          }
        }

        if (!hasValidCookies) {
          logger.warn(`打开面板失败: 账号 ${accountId} 的登录态已过期`);
          return null;
        }
      }

      const creatorUrl = this.getCreatorCenterUrl(account.platform);
      await browserManager.createEmbeddedTab(accountId, account.platform as Platform, creatorUrl);

      const session: PanelSession = {
        id,
        accountId,
        platform: account.platform,
        nickname: account.nickname || account.platform,
        browser_mode: browserMode,
        createdAt: new Date(),
      };

      this.sessions.set(id, session);

      browserManager.attachToMainWindow(accountId);

      this.activePanelId = id;
      this.layoutActivePanel();

      this.mainWindow.webContents.send('panel-browser:url-change', session.accountId, creatorUrl);
      this.mainWindow.webContents.send('panel-browser:navigation-state', session.accountId, false, false);
      this.mainWindow.webContents.send('panel-browser:loading-state', session.accountId, true);

      logger.info(`打开面板: ${account.nickname} (${account.platform})`);
      return session;
    } catch (error) {
      logger.error(`打开面板失败: ${accountId}`, error);
      return null;
    }
  }

  private async openExternalBrowser(
    accountId: string,
    browserMode: BrowserMode,
    account: { platform: string; nickname: string }
  ): Promise<PanelSession | null> {
    const id = `external_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const creatorUrl = this.getCreatorCenterUrl(account.platform);

    try {
      await shell.openExternal(creatorUrl);

      const externalSession: ExternalBrowserSession = {
        id,
        accountId,
        platform: account.platform,
        nickname: account.nickname || account.platform,
        browser_mode: browserMode,
        createdAt: new Date(),
      };

      this.externalSessions.set(id, externalSession);
      logger.info(`打开外部浏览器: ${account.nickname} (${account.platform})`);

      return this.createVirtualPanelSession(externalSession);
    } catch (error) {
      logger.error(`打开外部浏览器失败: ${accountId}`, error);
      return null;
    }
  }

  private createVirtualPanelSession(external: ExternalBrowserSession): PanelSession {
    return {
      id: external.id,
      accountId: external.accountId,
      platform: external.platform,
      nickname: external.nickname,
      browser_mode: external.browser_mode,
      createdAt: external.createdAt,
    };
  }

  closePanel(panelId: string): void {
    const session = this.sessions.get(panelId);
    if (session) {
      browserManager.closeTab(session.accountId);
      this.sessions.delete(panelId);

      if (this.activePanelId === panelId) {
        this.activePanelId = null;
        const remaining = Array.from(this.sessions.values());
        if (remaining.length > 0) {
          this.focusPanel(remaining[0].id);
        }
      }

      logger.info(`关闭面板: ${panelId}`);
      return;
    }

    if (this.externalSessions.has(panelId)) {
      this.externalSessions.delete(panelId);
      logger.info(`关闭外部浏览器会话: ${panelId}`);
    }
  }

  focusPanel(panelId: string): void {
    const prevSession = this.activePanelId ? this.sessions.get(this.activePanelId) : null;
    if (prevSession) {
      browserManager.detachFromMainWindow(prevSession.accountId);
    }

    const session = this.sessions.get(panelId);
    if (!session) return;

    browserManager.attachToMainWindow(session.accountId);
    this.activePanelId = panelId;
    this.layoutActivePanel();
  }

  getActivePanels(): PanelSession[] {
    return Array.from(this.sessions.values());
  }

  hideAllPanels(): void {
    if (!this.activePanelId) {
      logger.info(`hideAllPanels: 没有活动面板`);
      return;
    }
    const session = this.sessions.get(this.activePanelId);
    if (session) {
      browserManager.detachFromMainWindow(session.accountId);
      logger.info(`hideAllPanels: 已分离面板 ${session.nickname} (${session.accountId})，剩余 ${this.sessions.size} 个会话`);
    } else {
      logger.warn(`hideAllPanels: 找不到活动会话 ${this.activePanelId}`);
    }
  }

  showAllPanels(): void {
    if (!this.activePanelId) {
      logger.info(`showAllPanels: 没有活动面板`);
      return;
    }
    const session = this.sessions.get(this.activePanelId);
    if (session) {
      browserManager.attachToMainWindow(session.accountId);
      this.layoutActivePanel();
      logger.info(`showAllPanels: 已挂载面板 ${session.nickname} (${session.accountId})`);
    } else {
      logger.warn(`showAllPanels: 找不到活动会话 ${this.activePanelId}`);
    }
  }

  private layoutActivePanel(): void {
    if (!this.mainWindow || !this.activePanelId) return;

    const session = this.sessions.get(this.activePanelId);
    if (!session) return;

    const [contentWidth, contentHeight] = this.mainWindow.getContentSize();

    const mainSidebarWidth = 150;
    const contentPadding = 24;
    const panelSidebarWidth = 220;
    const titlebarHeight = 38;
    const headerHeight = 56;
    const tabBarHeight = 36;
    const toolbarHeight = 44;

    const bounds = {
      x: mainSidebarWidth + contentPadding + panelSidebarWidth,
      y: titlebarHeight + headerHeight + contentPadding + tabBarHeight + toolbarHeight,
      width: contentWidth - mainSidebarWidth - contentPadding - panelSidebarWidth - contentPadding,
      height: contentHeight - titlebarHeight - headerHeight - contentPadding - tabBarHeight - toolbarHeight,
    };

    logger.info(`layoutActivePanel: bounds={x:${bounds.x}, y:${bounds.y}, w:${bounds.width}, h:${bounds.height}}, contentSize={w:${contentWidth}, h:${contentHeight}}`);

    browserManager.layoutEmbedded(session.accountId, bounds);
  }

  private getAccount(accountId: string): { platform: string; nickname: string; browser_mode: BrowserMode } | null {
    if (!isDatabaseAvailable()) return null;
    const db = getDatabase();

    const row = db.prepare(`
      SELECT a.platform, a.nickname, a.browser_mode
      FROM accounts a
      WHERE a.id = ?
    `).get(accountId) as { platform: string; nickname: string | null; browser_mode: string | null } | undefined;

    return row ? {
      platform: row.platform,
      nickname: row.nickname || '',
      browser_mode: (row.browser_mode as BrowserMode) || 'embedded'
    } : null;
  }

  private getCreatorCenterUrl(platform: string): string {
    const urls: Record<string, string> = {
      douyin: 'https://creator.douyin.com/creator-micro/home',
      xiaohongshu: 'https://creator.xiaohongshu.com/',
      kuaishou: 'https://cp.kuaishou.com/',
      channels: 'https://channels.weixin.qq.com/platform',
      bilibili: 'https://member.bilibili.com/platform/home',
    };
    return urls[platform] || 'about:blank';
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      browserManager.closeTab(session.accountId);
    }
    this.sessions.clear();
    this.externalSessions.clear();
    browserManager.dispose();
    logger.info('MultiPanelService 已释放');
  }
}

export const multiPanelService = MultiPanelService.getInstance();
