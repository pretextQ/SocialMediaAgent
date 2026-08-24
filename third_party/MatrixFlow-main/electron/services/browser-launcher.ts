import { chromium } from 'patchright';
import type { Browser, BrowserContext } from 'patchright';
import path from 'path';
import fs from 'fs';
import type { IBrowserLauncher, BrowserConfig, BrowserType } from './types';

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

export class EmbeddedLauncher implements IBrowserLauncher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  getBrowserType(): BrowserType {
    return 'embedded';
  }

  async launch(config: BrowserConfig, accountId: string): Promise<BrowserContext> {
    const userDataDir = this.getUserDataDir(accountId);
    
    this.context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: config.headless ?? false,
      viewport: null,
      args: BROWSER_ARGS,
    });
    
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  private getUserDataDir(accountId: string): string {
    const baseDir = path.join(process.cwd(), 'storage', 'browser_data', 'embedded');
    const userDataDir = path.join(baseDir, accountId);
    
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    
    return userDataDir;
  }
}

export class ChromeLauncher implements IBrowserLauncher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  getBrowserType(): BrowserType {
    return 'chrome';
  }

  async launch(config: BrowserConfig, accountId: string): Promise<BrowserContext> {
    const executablePath = config.executablePath || this.getDefaultChromePath();
    
    if (!executablePath || !fs.existsSync(executablePath)) {
      throw new Error(`Chrome 可执行文件不存在: ${executablePath}`);
    }

    const userDataDir = this.getUserDataDir(accountId);
    
    this.context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: config.headless ?? false,
      viewport: null,
      args: BROWSER_ARGS,
    });
    
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  private getUserDataDir(accountId: string): string {
    const baseDir = path.join(process.cwd(), 'storage', 'browser_data', 'chrome');
    const userDataDir = path.join(baseDir, accountId);
    
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    
    return userDataDir;
  }

  private getDefaultChromePath(): string {
    switch (process.platform) {
      case 'darwin':
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      case 'win32':
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      case 'linux':
        return '/usr/bin/google-chrome';
      default:
        return '';
    }
  }
}

export class FingerprintLauncher implements IBrowserLauncher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private fingerprintId: string | null = null;

  getBrowserType(): BrowserType {
    return 'fingerprint';
  }

  async launch(config: BrowserConfig, accountId: string): Promise<BrowserContext> {
    if (!config.fingerprintId) {
      throw new Error('指纹浏览器需要提供 fingerprintId');
    }
    
    this.fingerprintId = config.fingerprintId;
    
    const launchInfo = await this.startFingerprintBrowser(config.fingerprintId);
    
    this.browser = await chromium.connect(launchInfo.websocketEndpoint);
    const contexts = this.browser.contexts();
    this.context = contexts[0] || await this.browser.newContext();
    
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    
    if (this.fingerprintId) {
      await this.stopFingerprintBrowser(this.fingerprintId);
      this.fingerprintId = null;
    }
    
    if (this.browser) {
      this.browser = null;
    }
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  private async startFingerprintBrowser(profileId: string): Promise<{ websocketEndpoint: string }> {
    const adspowerApiUrl = `http://local.adspower.net:50325/api/v1/browser/start`;
    
    try {
      const response = await fetch(`${adspowerApiUrl}?user_id=${profileId}&launch_args=[]`);
      const data = await response.json() as { code?: number; data?: { ws?: { endpoint: string } } };
      
      if (data.code !== 0) {
        throw new Error(`AdsPower API 返回错误: ${JSON.stringify(data)}`);
      }
      
      const websocketEndpoint = data.data?.ws?.endpoint;
      if (!websocketEndpoint) {
        throw new Error('未获取到 WebSocket 端点');
      }
      
      return { websocketEndpoint };
    } catch (error) {
      throw new Error(`启动指纹浏览器失败: ${error}`);
    }
  }

  private async stopFingerprintBrowser(profileId: string): Promise<void> {
    const adspowerApiUrl = `http://local.adspower.net:50325/api/v1/browser/stop`;
    
    try {
      await fetch(`${adspowerApiUrl}?user_id=${profileId}`);
    } catch {
      // 忽略关闭错误
    }
  }
}

export function createBrowserLauncher(config: BrowserConfig): IBrowserLauncher {
  switch (config.type) {
    case 'embedded':
      return new EmbeddedLauncher();
    case 'chrome':
      return new ChromeLauncher();
    case 'fingerprint':
      return new FingerprintLauncher();
    default:
      throw new Error(`未知的浏览器类型: ${config.type}`);
  }
}
