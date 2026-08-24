import type { PlatformAdapter, PlatformConfig, PlatformCapabilities } from '../base/interfaces';
import type { Page } from 'patchright';
import { BILIBILI_URLS } from './selectors';
import { qrCodeLogin, checkCookie, getQRCode } from './login';
import { uploadVideo } from './upload';
import { publish } from './publish';
import { schedule } from './schedule';
import { fetchStats, fetchVideoStats } from './stats';
import type {
  CookieResult,
  LoginOptions,
  UploadContext,
  UploadResult,
  PublishContext,
  PublishResult,
  ScheduleContext,
  ScheduleResult,
  StatsData,
  VideoStatsData,
  TimePeriod,
  PageChangeReport,
} from '../base/types';

const BILIBILI_CONFIG: PlatformConfig = {
  platformId: 'bilibili',
  platformName: 'B站',
  domain: 'bilibili.com',
  rateLimit: {
    hourly: 8,
    daily: 30,
    burst: 3,
  },
  urls: {
    creator: BILIBILI_URLS.creatorHome,
    upload: BILIBILI_URLS.upload,
    publish: BILIBILI_URLS.upload,
    login: BILIBILI_URLS.loginPage,
  },
  selectors: {
    login: {
      qrCode: '.qr-code img',
      scanTab: 'text=扫码登录',
    },
    upload: {
      fileInput: 'input[type="file"]',
      titleInput: 'input[placeholder*="标题"]',
      publishBtn: 'button:has-text("发布")',
    },
  },
};

const BILIBILI_CAPABILITIES: PlatformCapabilities = {
  serverScheduledPublish: true,
  maxScheduleDays: 10,
  comment: true,
  image: true,
};

class BilibiliAdapter implements PlatformAdapter {
  readonly platformId = 'bilibili';
  readonly config = BILIBILI_CONFIG;
  readonly capabilities = BILIBILI_CAPABILITIES;

  getPublishPageUrl(): string {
    return BILIBILI_URLS.upload;
  }

  getCreatorCenterUrl(): string {
    return BILIBILI_URLS.creatorHome;
  }

  async detectPageChanges(page: Page): Promise<PageChangeReport> {
    const changedSelectors: string[] = [];

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      changedSelectors.push('upload.fileInput');
    }

    return {
      hasChanges: changedSelectors.length > 0,
      changedSelectors,
      timestamp: new Date(),
    };
  }

  async login(accountId: string, headless: boolean = false, options?: LoginOptions): Promise<CookieResult> {
    return qrCodeLogin(accountId, headless, undefined, undefined, options);
  }

  async checkCookie(accountId: string): Promise<boolean> {
    return checkCookie(accountId);
  }

  async getQRCode(accountId: string): Promise<string> {
    return getQRCode(accountId);
  }

  async uploadVideo(ctx: UploadContext): Promise<UploadResult> {
    return uploadVideo(ctx);
  }

  async publish(ctx: PublishContext): Promise<PublishResult> {
    return publish(ctx);
  }

  async schedule?(ctx: ScheduleContext): Promise<ScheduleResult> {
    return schedule(ctx);
  }

  async fetchStats(accountId: string, period: TimePeriod): Promise<StatsData> {
    return fetchStats(accountId, period);
  }

  async fetchVideoStats(videoId: string): Promise<VideoStatsData> {
    return fetchVideoStats(videoId);
  }
}

export const bilibiliAdapter = new BilibiliAdapter();
