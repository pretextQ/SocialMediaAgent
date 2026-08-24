import type { Page } from 'patchright';
import type {
  PlatformConfig,
  PlatformCapabilities,
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
  CommentContext,
  CommentResult,
  PageChangeReport,
  HealthCheckResult,
} from './types';

export type {
  PlatformConfig,
  PlatformCapabilities,
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
  CommentContext,
  CommentResult,
  PageChangeReport,
  HealthCheckResult,
};

export interface IPlatformInfo {
  readonly platformId: string;
  readonly config: PlatformConfig;
  readonly capabilities: PlatformCapabilities;
  getPublishPageUrl(): string;
  getCreatorCenterUrl(): string;
  detectPageChanges(page: Page): Promise<PageChangeReport>;
}

export interface ILoginAdapter {
  login(accountId: string, headless?: boolean, options?: LoginOptions): Promise<CookieResult>;
  checkCookie(accountId: string, cookiePath?: string): Promise<boolean>;
  getQRCode(accountId: string): Promise<string>;
  checkHealth?(accountId: string): Promise<HealthCheckResult>;
}

export interface IUploadAdapter {
  uploadVideo(ctx: UploadContext): Promise<UploadResult>;
}

export interface IPublishAdapter {
  publish(ctx: PublishContext): Promise<PublishResult>;
  schedule?(ctx: ScheduleContext): Promise<ScheduleResult>;
}

export interface IStatsAdapter {
  fetchStats(accountId: string, period: TimePeriod): Promise<StatsData>;
  fetchVideoStats(videoId: string): Promise<VideoStatsData>;
}

export interface ICommentAdapter {
  postComment(ctx: CommentContext): Promise<CommentResult>;
}

export interface ICoverAdapter {
  getCoverRatios?(): string[];
}

export type PlatformAdapter = IPlatformInfo &
  ILoginAdapter &
  IUploadAdapter &
  IPublishAdapter &
  IStatsAdapter &
  ICoverAdapter;
