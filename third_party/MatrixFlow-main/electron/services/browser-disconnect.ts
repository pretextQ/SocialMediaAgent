import type { Browser } from 'patchright';

export interface BrowserDisconnectHandlerOptions {
  accountId: string;
  onDisconnect: () => void;
  onLog?: (message: string, data?: Record<string, unknown>) => void;
}

export class BrowserDisconnectHandler {
  private browser: Browser | null = null;
  private accountId: string;
  private onDisconnect: () => void;
  private onLog?: (message: string, data?: Record<string, unknown>) => void;

  constructor(options: BrowserDisconnectHandlerOptions) {
    this.accountId = options.accountId;
    this.onDisconnect = options.onDisconnect;
    this.onLog = options.onLog;
  }

  attach(browser: Browser): void {
    this.browser = browser;
    
    browser.on('disconnected', () => {
      this.handleDisconnect();
    });
  }

  private async handleDisconnect(): Promise<void> {
    if (this.onLog) {
      this.onLog('Browser disconnected', {
        accountId: this.accountId,
        timestamp: new Date().toISOString(),
      });
    }

    this.onDisconnect();
  }

  async gracefulClose(): Promise<void> {
    if (this.browser) {
      this.browser.removeAllListeners('disconnected');
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
