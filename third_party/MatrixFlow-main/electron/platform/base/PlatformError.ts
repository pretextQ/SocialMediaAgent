/**
 * Platform Error Taxonomy — 错误分类体系
 * 8 种错误子类，覆盖所有平台操作失败场景
 */

export type PlatformId = 'douyin' | 'xiaohongshu' | 'channels' | 'kuaishou' | 'bilibili';

export type ErrorCategory =
  | 'NetworkError'         // 网络错误
  | 'AuthError'            // 认证错误（Cookie 失效、登录过期）
  | 'AccountBannedError'  // 账号被封
  | 'ContentRejectedError' // 内容被拒（标题/封面/视频违规）
  | 'SelectorError'        // 选择器失效
  | 'BrowserCrashError'   // 浏览器崩溃
  | 'RateLimitError'       // 平台限流
  | 'ValidationError';     // 参数校验失败

export interface SerializedError {
  name: string;
  message: string;
  category: ErrorCategory;
  platform?: PlatformId;
  context?: Record<string, unknown>;
  retryable: boolean;
  userMessage: string;
}

/**
 * 平台错误基类
 * 所有平台操作抛出的错误必须是此基类的子类
 */
export class PlatformError extends Error {
  readonly category: ErrorCategory;
  readonly platform?: PlatformId;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    category: ErrorCategory,
    context?: Record<string, unknown>,
    platform?: PlatformId,
  ) {
    super(message);
    this.name = 'PlatformError';
    this.category = category;
    this.context = context;
    this.platform = platform;
  }

  /** 用户友好提示语（i18n 准备） */
  get userMessage(): string {
    return this.message;
  }

  /** 是否可重试 */
  get retryable(): boolean {
    return false;
  }

  /** 序列化用于日志/存储 */
  toJSON(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      platform: this.platform,
      context: this.context,
      retryable: this.retryable,
      userMessage: this.userMessage,
    };
  }
}

// ─── 8 个错误子类 ─────────────────────────────────────────────

export class NetworkError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'NetworkError', context, platform);
    this.name = 'NetworkError';
  }

  override get userMessage(): string {
    return '网络异常，请检查网络后重试';
  }

  override get retryable(): boolean {
    return true;
  }
}

export class AuthError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'AuthError', context, platform);
    this.name = 'AuthError';
  }

  override get userMessage(): string {
    return '登录已过期，请重新扫码';
  }

  override get retryable(): boolean {
    return false;
  }
}

export class AccountBannedError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'AccountBannedError', context, platform);
    this.name = 'AccountBannedError';
  }

  override get userMessage(): string {
    return '账号已被平台封禁';
  }

  override get retryable(): boolean {
    return false;
  }
}

export class ContentRejectedError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'ContentRejectedError', context, platform);
    this.name = 'ContentRejectedError';
  }

  override get userMessage(): string {
    return '内容被平台拒绝，请检查标题/封面';
  }

  override get retryable(): boolean {
    return false;
  }
}

export class SelectorError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'SelectorError', context, platform);
    this.name = 'SelectorError';
  }

  override get userMessage(): string {
    return '页面结构变化，请更新选择器';
  }

  override get retryable(): boolean {
    return false;
  }
}

export class BrowserCrashError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'BrowserCrashError', context, platform);
    this.name = 'BrowserCrashError';
  }

  override get userMessage(): string {
    return '浏览器进程异常退出';
  }

  override get retryable(): boolean {
    return true;
  }
}

export class RateLimitError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'RateLimitError', context, platform);
    this.name = 'RateLimitError';
  }

  override get userMessage(): string {
    return '操作过于频繁，请稍后再试';
  }

  override get retryable(): boolean {
    return true;
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, context?: Record<string, unknown>, platform?: PlatformId) {
    super(message, 'ValidationError', context, platform);
    this.name = 'ValidationError';
  }

  override get userMessage(): string {
    return '输入参数错误';
  }

  override get retryable(): boolean {
    return false;
  }
}

// ─── 错误转换器 ─────────────────────────────────────────────

/** 从任意 Error 转换为对应的 PlatformError 子类 */
export function toPlatformError(
  error: unknown,
  platform?: PlatformId,
  context?: Record<string, unknown>,
): PlatformError {
  if (error instanceof PlatformError) {
    return error;
  }

  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (/network|timeout|conn|econnrefused|enetunreach|enotconn|socket/.test(msg)) {
    return new NetworkError(error instanceof Error ? error.message : String(error), context, platform);
  }
  if (/cookie|login|auth|unauthorized|401|403|expired|登录/.test(msg)) {
    return new AuthError(error instanceof Error ? error.message : String(error), context, platform);
  }
  if (/banned|封禁|forbidden|account.*ban|账号.*封/.test(msg)) {
    return new AccountBannedError(error instanceof Error ? error.message : String(error), context, platform);
  }
  if (/content|违规|rejected|标题|封面|reject|内容.*拒绝/.test(msg)) {
    return new ContentRejectedError(error instanceof Error ? error.message : String(error), context, platform);
  }
  if (/selector|not found|element|locator|no such|cannot find/.test(msg)) {
    return new SelectorError(error instanceof Error ? error.message : String(error), context, platform);
  }
  if (/browser|crash|context closed|target closed|process|abnormally/.test(msg)) {
    return new BrowserCrashError(error instanceof Error ? error.message : String(error), context, platform);
  }
  if (/rate limit|too many|frequent|限流|频繁|操作.*频繁/.test(msg)) {
    return new RateLimitError(error instanceof Error ? error.message : String(error), context, platform);
  }

  return new ValidationError(error instanceof Error ? error.message : String(error), context, platform);
}