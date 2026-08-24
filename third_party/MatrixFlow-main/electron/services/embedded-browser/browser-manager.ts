import { WebContentsView, BrowserWindow, BrowserView, session, screen, ipcMain } from 'electron';
import * as path from 'path';
import { StealthEngine } from './stealth-engine';
import { FingerprintAdapter } from './fingerprint-adapter';
import { ProxyBinder } from './proxy-binder';
import type { Platform } from '../types';
import { Logger } from '../../core/Logger';

const logger = new Logger('BrowserManager');

export const MAX_CONCURRENT_TABS = 5;
const ADDRESS_BAR_HEIGHT = 48;

interface TabWindow {
  window: BrowserWindow | null; // null for embedded mode (attached to main window)
  contentView: WebContentsView;
  addressBar: BrowserView | null; // null for embedded mode (address bar handled by Vue)
}

export class BrowserManager {
  private tabs: Map<string, TabWindow> = new Map();
  private stealth: StealthEngine;
  private fingerprints: FingerprintAdapter;
  private proxyBinder: ProxyBinder;
  private mainWindow: BrowserWindow | null = null;
  private ipcRegistered = false;

  constructor() {
    this.stealth = new StealthEngine();
    this.fingerprints = new FingerprintAdapter();
    this.proxyBinder = new ProxyBinder();
    this.registerIPC();
  }

  private registerIPC(): void {
    if (this.ipcRegistered) return;
    this.ipcRegistered = true;

    ipcMain.on('panel-address:navigate', (_, data: { panelId: string; url?: string }) => {
      const tab = this.tabs.get(data.panelId);
      if (!tab || !data.url) return;
      tab.contentView.webContents.loadURL(data.url);
    });

    ipcMain.on('panel-address:back', (_, data: { panelId: string }) => {
      const tab = this.tabs.get(data.panelId);
      if (!tab) return;
      tab.contentView.webContents.goBack();
    });

    ipcMain.on('panel-address:forward', (_, data: { panelId: string }) => {
      const tab = this.tabs.get(data.panelId);
      if (!tab) return;
      tab.contentView.webContents.goForward();
    });

    ipcMain.on('panel-address:refresh', (_, data: { panelId: string }) => {
      const tab = this.tabs.get(data.panelId);
      if (!tab) return;
      tab.contentView.webContents.reload();
    });

    ipcMain.on('panel-address:open-devtools', (_, data: { panelId: string }) => {
      const tab = this.tabs.get(data.panelId);
      if (!tab) return;
      tab.contentView.webContents.openDevTools({ mode: 'detach' });
    });
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async createEmbeddedTab(accountId: string, platform: Platform, url: string): Promise<WebContentsView> {
    if (this.tabs.size >= MAX_CONCURRENT_TABS) {
      logger.warn(`达到最大标签数限制 ${MAX_CONCURRENT_TABS}，关闭最老的标签`);
      await this.closeOldestTab();
    }

    const partition = `persist:${accountId}`;
    const contentView = new WebContentsView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      await this.proxyBinder.bind(accountId, partition);
      const profile = await this.fingerprints.getOrAssign(accountId, platform);
      await this.stealth.apply(contentView, platform, profile);

      this.tabs.set(accountId, { window: null, contentView, addressBar: null });

      this.wireEvents(accountId);

      contentView.webContents.loadURL(url).catch((err: Error & { errno?: number }) => {
        if (err.errno !== -3) {
          logger.warn(`页面加载失败: ${accountId}`, err);
        }
      });

      logger.info(`内嵌标签已创建: ${accountId}`);
      return contentView;
    } catch (error) {
      logger.error(`创建内嵌标签失败: ${accountId}`, error);
      try { contentView.webContents.close(); } catch {}
      throw error;
    }
  }

  attachToMainWindow(accountId: string): void {
    const tab = this.tabs.get(accountId);
    if (!tab || !this.mainWindow) return;

    this.mainWindow.contentView.addChildView(tab.contentView);
    logger.debug(`已将标签附加到主窗口: ${accountId}`);
  }

  detachFromMainWindow(accountId: string): void {
    const tab = this.tabs.get(accountId);
    if (!tab || !this.mainWindow) return;

    try {
      this.mainWindow.contentView.removeChildView(tab.contentView);
    } catch {}
    logger.debug(`已将标签从主窗口分离: ${accountId}`);
  }

  layoutEmbedded(accountId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    const tab = this.tabs.get(accountId);
    if (!tab) return;

    tab.contentView.setBounds(bounds);
  }

  layoutEmbeddedToMainContent(accountId: string): void {
    const tab = this.tabs.get(accountId);
    if (!tab || !this.mainWindow) return;

    const [contentWidth, contentHeight] = this.mainWindow.getContentSize();
    const mainSidebarWidth = 150;
    const titlebarHeight = 38;
    const headerHeight = 56;

    tab.contentView.setBounds({
      x: mainSidebarWidth,
      y: titlebarHeight + headerHeight,
      width: Math.max(400, contentWidth - mainSidebarWidth),
      height: Math.max(300, contentHeight - titlebarHeight - headerHeight),
    });
  }

  async createTab(accountId: string, platform: Platform, url: string): Promise<WebContentsView> {
    if (this.tabs.size >= MAX_CONCURRENT_TABS) {
      logger.warn(`达到最大标签数限制 ${MAX_CONCURRENT_TABS}，关闭最老的标签`);
      await this.closeOldestTab();
    }

    const partition = `persist:${accountId}`;
    const contentView = new WebContentsView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      await this.proxyBinder.bind(accountId, partition);
      const profile = await this.fingerprints.getOrAssign(accountId, platform);
      await this.stealth.apply(contentView, platform, profile);

      const addressBar = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '..', '..', 'browser-ui', 'panel-address-bar-preload.js'),
        },
      });

      const win = this.createBrowserWindow(platform);

      win.setBrowserView(addressBar);
      win.contentView.addChildView(contentView);

      this.tabs.set(accountId, { window: win, contentView, addressBar });

      this.layoutTab(accountId);
      this.wireEvents(accountId);

      const addressBarPath = path.join(__dirname, '..', '..', 'browser-ui', 'panel-address-bar.html');
      await addressBar.webContents.loadFile(addressBarPath);
      addressBar.webContents.send('panel-address:url-change', accountId, url);

      contentView.webContents.loadURL(url).catch((err: Error & { errno?: number }) => {
        if (err.errno !== -3) {
          logger.warn(`页面加载失败: ${accountId}`, err);
        }
      });

      win.on('closed', () => {
        this.tabs.delete(accountId);
        logger.info(`标签窗口已关闭: ${accountId}`);
      });
      logger.info(`标签已创建: ${accountId}`);
      return contentView;
    } catch (error) {
      logger.error(`创建标签失败: ${accountId}`, error);
      try { contentView.webContents.close(); } catch {}
      throw error;
    }
  }

  switchTab(accountId: string): void {
    const tab = this.tabs.get(accountId);
    if (!tab) {
      logger.warn(`标签不存在: ${accountId}`);
      return;
    }

    if (tab.window) {
      tab.window.focus();
    }
    logger.debug(`已切换到标签: ${accountId}`);
  }

  async closeTab(accountId: string): Promise<void> {
    const tab = this.tabs.get(accountId);
    if (!tab) {
      logger.warn(`标签不存在: ${accountId}`);
      return;
    }

    if (tab.window) {
      tab.window.destroy();
    } else {
      this.detachFromMainWindow(accountId);
      try { tab.contentView.webContents.close(); } catch {}
    }

    if (tab.addressBar) {
      try { tab.addressBar.webContents.close(); } catch {}
    }

    this.tabs.delete(accountId);
    logger.info(`标签已关闭: ${accountId}`);
  }

  getTabCount(): number {
    return this.tabs.size;
  }

  hasTab(accountId: string): boolean {
    return this.tabs.has(accountId);
  }

  hasStandaloneTab(accountId: string): boolean {
    return !!this.tabs.get(accountId)?.window;
  }

  getView(accountId: string): WebContentsView | undefined {
    return this.tabs.get(accountId)?.contentView;
  }

  dispose(): void {
    for (const [accountId, tab] of this.tabs) {
      if (tab.window) {
        try { tab.window.destroy(); } catch {}
      } else {
        this.detachFromMainWindow(accountId);
        try { tab.contentView.webContents.close(); } catch {}
      }
      if (tab.addressBar) {
        try { tab.addressBar.webContents.close(); } catch {}
      }
      logger.debug(`已清理标签: ${accountId}`);
    }
    this.tabs.clear();
    logger.info('BrowserManager 已释放');
  }

  private createBrowserWindow(platform: Platform): BrowserWindow {
    const primary = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primary.workAreaSize;
    const winW = Math.min(1280, screenW - 100);
    const winH = Math.min(900, screenH - 100);

    const platformNames: Record<string, string> = {
      douyin: '抖音', xiaohongshu: '小红书',
      channels: '视频号', kuaishou: '快手', bilibili: 'B站',
    };

    return new BrowserWindow({
      width: winW,
      height: winH,
      title: `${platformNames[platform] || platform} - MatrixFlow`,
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
  }

  private layoutTab(accountId: string): void {
    const tab = this.tabs.get(accountId);
    if (!tab || !tab.window || !tab.addressBar) return;

    const { window: win, contentView, addressBar } = tab;
    const [winW, winH] = win.getSize();
    const titleBarH = process.platform === 'darwin' ? 28 : 32;

    addressBar.setBounds({
      x: 0, y: titleBarH,
      width: winW, height: ADDRESS_BAR_HEIGHT,
    });

    win.contentView.addChildView(contentView);
    contentView.setBounds({
      x: 0, y: titleBarH + ADDRESS_BAR_HEIGHT,
      width: winW, height: winH - titleBarH - ADDRESS_BAR_HEIGHT,
    });

    win.on('resize', () => {
      const [w, h] = win.getSize();
      addressBar.setBounds({ x: 0, y: titleBarH, width: w, height: ADDRESS_BAR_HEIGHT });
      contentView.setBounds({
        x: 0, y: titleBarH + ADDRESS_BAR_HEIGHT,
        width: w, height: h - titleBarH - ADDRESS_BAR_HEIGHT,
      });
    });
  }

  private wireEvents(accountId: string): void {
    const tab = this.tabs.get(accountId);
    if (!tab) return;

    const { contentView, addressBar } = tab;
    const wc = contentView.webContents;

    const safeSend = (target: Electron.WebContents | undefined | null, channel: string, ...args: any[]) => {
      try { if (target && !target.isDestroyed()) target.send(channel, ...args); } catch {}
    };

    wc.on('did-navigate', (_, url) => {
      safeSend(addressBar?.webContents, 'panel-address:url-change', accountId, url);
      safeSend(this.mainWindow?.webContents, 'panel-browser:url-change', accountId, url);
    });

    wc.on('did-navigate-in-page', (_, url) => {
      safeSend(addressBar?.webContents, 'panel-address:url-change', accountId, url);
      safeSend(this.mainWindow?.webContents, 'panel-browser:url-change', accountId, url);
    });

    wc.on('did-start-loading', () => {
      safeSend(addressBar?.webContents, 'panel-address:loading-state', accountId, true);
      safeSend(this.mainWindow?.webContents, 'panel-browser:loading-state', accountId, true);
    });

    wc.on('did-stop-loading', () => {
      safeSend(addressBar?.webContents, 'panel-address:loading-state', accountId, false);
      safeSend(this.mainWindow?.webContents, 'panel-browser:loading-state', accountId, false);
    });

    wc.on('did-finish-load', () => {
      const navState = { back: wc.navigationHistory.canGoBack(), forward: wc.navigationHistory.canGoForward() };
      safeSend(addressBar?.webContents, 'panel-address:navigation-state', accountId, navState.back, navState.forward);
      safeSend(this.mainWindow?.webContents, 'panel-browser:navigation-state', accountId, navState.back, navState.forward);
    });
  }

  private async closeOldestTab(): Promise<void> {
    if (this.tabs.size === 0) return;
    const oldestId = this.tabs.keys().next().value;
    if (oldestId) await this.closeTab(oldestId);
  }
}

export const browserManager = new BrowserManager();
