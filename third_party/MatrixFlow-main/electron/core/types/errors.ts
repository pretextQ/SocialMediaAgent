export enum ErrorType {
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  COOKIE_EXPIRED = 'COOKIE_EXPIRED',
  ACCOUNT_BANNED = 'ACCOUNT_BANNED',
  VIDEO_REJECTED = 'VIDEO_REJECTED',
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DB_ERROR = 'DB_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorCategory {
  RETRYABLE = 'RETRYABLE',
  USER_ACTION = 'USER_ACTION',
  FATAL = 'FATAL',
}

export interface ErrorClassification {
  type: ErrorType;
  category: ErrorCategory;
  retryable: boolean;
  userAction?: string;
  maxRetries?: number;
}

export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly type: ErrorType,
    public readonly category: ErrorCategory,
    public readonly retryable: boolean = false,
    public readonly userAction?: string
  ) {
    super(message);
    this.name = 'PlatformError';
  }

  static fromError(error: unknown, platform: string): PlatformError {
    if (error instanceof PlatformError) return error;
    const msg = error instanceof Error ? error.message : String(error);
    return new PlatformError(msg, platform, ErrorType.UNKNOWN, ErrorCategory.RETRYABLE, true);
  }

  static classify(error: unknown, platform: string): ErrorClassification {
    if (error instanceof PlatformError) {
      return {
        type: error.type,
        category: error.category,
        retryable: error.retryable,
        userAction: error.userAction,
      };
    }
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('timeout') || msg.includes('网络')) {
      return { type: ErrorType.NETWORK_TIMEOUT, category: ErrorCategory.RETRYABLE, retryable: true, maxRetries: 3 };
    }
    if (msg.includes('rate') || msg.includes('限流') || msg.includes('频繁')) {
      return { type: ErrorType.RATE_LIMITED, category: ErrorCategory.RETRYABLE, retryable: true, maxRetries: 2 };
    }
    if (msg.includes('cookie') || msg.includes('登录') || msg.includes('login')) {
      return { type: ErrorType.COOKIE_EXPIRED, category: ErrorCategory.USER_ACTION, retryable: false, userAction: '请重新登录该账号' };
    }
    if (msg.includes('ban') || msg.includes('封禁') || msg.includes('违规')) {
      return { type: ErrorType.ACCOUNT_BANNED, category: ErrorCategory.USER_ACTION, retryable: false, userAction: '请检查账号状态' };
    }
    return { type: ErrorType.UNKNOWN, category: ErrorCategory.RETRYABLE, retryable: true };
  }
}
