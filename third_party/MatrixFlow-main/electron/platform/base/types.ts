import type { Page } from 'patchright';

export interface PlatformCapabilities {
  serverScheduledPublish: boolean;
  maxScheduleDays: number;
  comment: boolean;
  image: boolean;
  coverRatios?: string[];
}

export interface PlatformConfig {
  platformId: string;
  platformName: string;
  domain: string;
  rateLimit: {
    hourly: number;
    daily: number;
    burst: number;
  };
  urls: {
    creator: string;
    upload: string;
    publish: string;
    login?: string;
  };
  selectors: Record<string, Record<string, string>>;
}

export interface CookieResult {
  success: boolean;
  cookiePath: string;
  message: string;
  nickname?: string;
  avatarUrl?: string;
}

export interface LoginOptions {
  /** 用户显式发起重新登录时，不复用已有 Cookie。 */
  force?: boolean;
  /** 登录确认后立即回调（Cookie 已保存但验证可能还未完成），用于即时更新 UI 状态。 */
  onLoginConfirmed?: () => void;
}

export interface UploadContext {
  accountId: string;
  videoPath: string;
  title: string;
  description?: string;
  tags?: string[];
  coverPath?: string;
  coverRatio?: string;
  coverDimensions?: { width: number; height: number };
  location?: string;
  visibility?: 'public' | 'private' | 'friends' | 'followers' | string;
  declaration?: string;
  scheduleMode?: 'immediate' | 'scheduled';
  scheduledAt?: string | Date | null;
  allowComment?: boolean;
  allowShare?: boolean;
  allowSameFrame?: boolean;
  allowDownload?: boolean;
  showInCity?: boolean;
  headless?: boolean;
  slowMo?: number;
  debugSteps?: boolean;
  browserMode?: 'embedded' | 'external_chrome' | 'external_fingerprint' | 'chrome' | 'fingerprint';
  fingerprintId?: string | null;
  chromePath?: string | null;
  cookiePath?: string | null;
}

export interface UploadResult {
  success: boolean;
  message: string;
  videoId?: string;
}

export interface PublishContext {
  page?: Page;
  accountId: string;
  videoId?: string;
  title: string;
  description?: string;
  tags?: string[];
  scheduledTime?: Date;
  dryRun?: boolean;
  /** 视频号短标题（≤ 16 字符） */
  shortTitle?: string;
  /** 发布位置（视频号支持位置选择；空=不设置） */
  location?: string;
  /** 合集名（视频号特有） */
  collection?: string;
  /** 商品链接 / 推广链接（视频号、抖音、快手支持） */
  productLink?: string;
  /** 商品标题（productLink 配套文案） */
  productTitle?: string;
  /** 声明原创（视频号特有） */
  isOriginal?: boolean;
}

export interface PublishResult {
  success: boolean;
  message: string;
  videoId?: string;
  publishUrl?: string;
}

export interface ScheduleContext {
  page?: Page;
  accountId: string;
  videoId?: string;
  title: string;
  description?: string;
  tags?: string[];
  scheduledTime: Date;
}

export interface ScheduleResult {
  success: boolean;
  message: string;
  scheduledTime?: Date;
}

export interface StatsData {
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  fetchTime: Date;
  error?: string;
}

export interface VideoStatsData extends StatsData {
  videoId: string;
}

export type TimePeriod = '7d' | '30d' | 'all';

export interface CommentContext {
  accountId: string;
  videoId: string;
  comment: string;
}

export interface CommentResult {
  success: boolean;
  message: string;
  commentId?: string;
}

export interface PageChangeReport {
  hasChanges: boolean;
  changedSelectors: string[];
  timestamp: Date;
}

export interface HealthCheckResult {
  healthy: boolean;
  platform: string;
  accountId: string;
  issues: string[];
  lastChecked: string;
}
