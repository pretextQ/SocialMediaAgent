import type { BrowserContext } from 'patchright';
import type { ILoginDetector, Platform, PlatformCookieConfig } from './types';
import { PLATFORM_COOKIE_CONFIGS } from './types';
import { detectChannelsLoginInPage } from '../platform/channels/login-detection';
import { isChannelsPlatform } from './platform-normalizer';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class AdaptiveCookiePoller implements ILoginDetector {
  private baseInterval = 2000;
  private maxInterval = 10000;
  private currentInterval = 2000;
  private consecutiveFailures = 0;
  private timeout: number;
  private cancelled = false;
  private onNetworkSlow?: (data: { currentInterval: number; consecutiveFailures: number }) => void;

  constructor(timeout: number = 300000, onNetworkSlow?: (data: { currentInterval: number; consecutiveFailures: number }) => void) {
    this.timeout = timeout;
    this.onNetworkSlow = onNetworkSlow;
  }

  async waitForLogin(
    context: BrowserContext,
    platform: Platform,
    _timeout: number
  ): Promise<boolean> {
    const config = PLATFORM_COOKIE_CONFIGS[platform];
    if (!config) {
      throw new Error(`未知的平台: ${platform}`);
    }

    const startTime = Date.now();
    this.cancelled = false;

    while (Date.now() - startTime < this.timeout && !this.cancelled) {
      try {
        const detected = await this.detectCookies(context, config);
        if (detected) {
          return true;
        }
        if (isChannelsPlatform(platform) && await this.detectChannelsPageLogin(context)) {
          return true;
        }
        this.onSuccess();
      } catch (e) {
        this.onFailure();
        console.warn('[LoginDetector] Cookie 检测失败:', e);
      }

      await sleep(this.currentInterval);
    }

    return false;
  }

  cancel(): void {
    this.cancelled = true;
  }

  private async detectCookies(
    context: BrowserContext,
    config: PlatformCookieConfig
  ): Promise<boolean> {
    const cookies = await context.cookies(config.domains);
    const cookieMap = new Map(cookies.map(c => [c.name, c.value]));

    return config.requiredCookies.every(name => cookieMap.has(name));
  }

  private async detectChannelsPageLogin(context: BrowserContext): Promise<boolean> {
    for (const page of context.pages()) {
      const detection = await detectChannelsLoginInPage(page);
      if (detection.loggedIn) {
        return true;
      }
    }
    return false;
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.currentInterval = this.baseInterval;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    
    this.currentInterval = Math.min(
      this.baseInterval * Math.pow(1.5, this.consecutiveFailures),
      this.maxInterval
    );

    if (this.consecutiveFailures >= 3 && this.onNetworkSlow) {
      this.onNetworkSlow({
        currentInterval: this.currentInterval,
        consecutiveFailures: this.consecutiveFailures,
      });
    }
  }
}

export class LoginDetector implements ILoginDetector {
  private poller: AdaptiveCookiePoller;
  private cancelled = false;

  constructor(
    private interval: number = 2000,
    private timeout: number = 300000,
    private onNetworkSlow?: (data: { currentInterval: number; consecutiveFailures: number }) => void
  ) {
    this.poller = new AdaptiveCookiePoller(timeout, onNetworkSlow);
  }

  async waitForLogin(
    context: BrowserContext,
    platform: Platform,
    timeout: number
  ): Promise<boolean> {
    this.cancelled = false;
    const result = await this.poller.waitForLogin(context, platform, timeout);
    return result && !this.cancelled;
  }

  cancel(): void {
    this.cancelled = true;
    this.poller.cancel();
  }
}
