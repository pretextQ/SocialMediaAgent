import { describe, it, expect } from 'vitest';
import { ErrorType, ErrorCategory, PlatformError } from '../../../electron/core/types/errors';

describe('PlatformError', () => {
  describe('constructor', () => {
    it('should set all properties correctly', () => {
      const error = new PlatformError(
        'Network timeout',
        'douyin',
        ErrorType.NETWORK_TIMEOUT,
        ErrorCategory.RETRYABLE,
        true
      );
      
      expect(error.message).toBe('Network timeout');
      expect(error.platform).toBe('douyin');
      expect(error.type).toBe(ErrorType.NETWORK_TIMEOUT);
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('PlatformError');
    });

    it('should include userAction when provided', () => {
      const error = new PlatformError(
        'Cookie expired',
        'douyin',
        ErrorType.COOKIE_EXPIRED,
        ErrorCategory.USER_ACTION,
        false,
        '请重新登录'
      );
      
      expect(error.userAction).toBe('请重新登录');
    });
  });

  describe('fromError', () => {
    it('should return same instance if already PlatformError', () => {
      const original = new PlatformError(
        'test',
        'douyin',
        ErrorType.NETWORK_TIMEOUT,
        ErrorCategory.RETRYABLE,
        true
      );
      
      const result = PlatformError.fromError(original, 'douyin');
      expect(result).toBe(original);
    });

    it('should wrap generic Error as UNKNOWN type', () => {
      const genericError = new Error('Something went wrong');
      const result = PlatformError.fromError(genericError, 'xiaohongshu');
      
      expect(result).toBeInstanceOf(PlatformError);
      expect(result.type).toBe(ErrorType.UNKNOWN);
      expect(result.category).toBe(ErrorCategory.RETRYABLE);
      expect(result.retryable).toBe(true);
      expect(result.platform).toBe('xiaohongshu');
    });

    it('should handle non-Error objects', () => {
      const result = PlatformError.fromError('string error', 'douyin');
      expect(result.message).toBe('string error');
      expect(result.type).toBe(ErrorType.UNKNOWN);
    });
  });

  describe('classify', () => {
    it('should identify NETWORK_TIMEOUT from "timeout" keyword', () => {
      const result = PlatformError.classify(new Error('Connection timeout'), 'douyin');
      expect(result.type).toBe(ErrorType.NETWORK_TIMEOUT);
      expect(result.category).toBe(ErrorCategory.RETRYABLE);
      expect(result.retryable).toBe(true);
      expect(result.maxRetries).toBe(3);
    });

    it('should identify NETWORK_TIMEOUT from "网络" keyword', () => {
      const result = PlatformError.classify(new Error('网络错误'), 'douyin');
      expect(result.type).toBe(ErrorType.NETWORK_TIMEOUT);
    });

    it('should identify RATE_LIMITED from "rate" keyword', () => {
      const result = PlatformError.classify(new Error('Rate limit exceeded'), 'douyin');
      expect(result.type).toBe(ErrorType.RATE_LIMITED);
      expect(result.category).toBe(ErrorCategory.RETRYABLE);
      expect(result.maxRetries).toBe(2);
    });

    it('should identify RATE_LIMITED from "限流" keyword', () => {
      const result = PlatformError.classify(new Error('触发限流'), 'douyin');
      expect(result.type).toBe(ErrorType.RATE_LIMITED);
    });

    it('should identify RATE_LIMITED from "频繁" keyword', () => {
      const result = PlatformError.classify(new Error('操作频繁'), 'douyin');
      expect(result.type).toBe(ErrorType.RATE_LIMITED);
    });

    it('should identify COOKIE_EXPIRED from "cookie" keyword', () => {
      const result = PlatformError.classify(new Error('cookie invalid'), 'douyin');
      expect(result.type).toBe(ErrorType.COOKIE_EXPIRED);
      expect(result.category).toBe(ErrorCategory.USER_ACTION);
      expect(result.retryable).toBe(false);
      expect(result.userAction).toBe('请重新登录该账号');
    });

    it('should identify COOKIE_EXPIRED from "登录" keyword', () => {
      const result = PlatformError.classify(new Error('需要重新登录'), 'douyin');
      expect(result.type).toBe(ErrorType.COOKIE_EXPIRED);
    });

    it('should identify COOKIE_EXPIRED from "login" keyword', () => {
      const result = PlatformError.classify(new Error('login required'), 'douyin');
      expect(result.type).toBe(ErrorType.COOKIE_EXPIRED);
    });

    it('should identify ACCOUNT_BANNED from "ban" keyword', () => {
      const result = PlatformError.classify(new Error('account banned'), 'douyin');
      expect(result.type).toBe(ErrorType.ACCOUNT_BANNED);
      expect(result.category).toBe(ErrorCategory.USER_ACTION);
      expect(result.retryable).toBe(false);
      expect(result.userAction).toBe('请检查账号状态');
    });

    it('should identify ACCOUNT_BANNED from "封禁" keyword', () => {
      const result = PlatformError.classify(new Error('账号被封禁'), 'douyin');
      expect(result.type).toBe(ErrorType.ACCOUNT_BANNED);
    });

    it('should identify ACCOUNT_BANNED from "违规" keyword', () => {
      const result = PlatformError.classify(new Error('违规封号'), 'douyin');
      expect(result.type).toBe(ErrorType.ACCOUNT_BANNED);
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      const result = PlatformError.classify(new Error('something random'), 'douyin');
      expect(result.type).toBe(ErrorType.UNKNOWN);
      expect(result.category).toBe(ErrorCategory.RETRYABLE);
      expect(result.retryable).toBe(true);
    });

    it('should return PlatformError properties if already classified', () => {
      const original = new PlatformError(
        'test',
        'douyin',
        ErrorType.VIDEO_REJECTED,
        ErrorCategory.USER_ACTION,
        false,
        '修改视频内容'
      );
      
      const result = PlatformError.classify(original, 'xiaohongshu');
      expect(result.type).toBe(ErrorType.VIDEO_REJECTED);
      expect(result.userAction).toBe('修改视频内容');
    });
  });
});
