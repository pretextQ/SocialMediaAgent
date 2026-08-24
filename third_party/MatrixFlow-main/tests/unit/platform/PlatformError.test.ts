/**
 * PlatformError 单元测试
 * 覆盖：8 子类 + toPlatformError 转换器 + userMessage + retryable + toJSON
 */
import { describe, it, expect } from 'vitest';
import {
  PlatformError,
  NetworkError,
  AuthError,
  AccountBannedError,
  ContentRejectedError,
  SelectorError,
  BrowserCrashError,
  RateLimitError,
  ValidationError,
  toPlatformError,
} from '../../../electron/platform/base/PlatformError';

describe('PlatformError 基类', () => {
  it('应正确设置字段', () => {
    const err = new PlatformError('test', 'ValidationError', { foo: 'bar' }, 'douyin');
    expect(err.message).toBe('test');
    expect(err.category).toBe('ValidationError');
    expect(err.platform).toBe('douyin');
    expect(err.context).toEqual({ foo: 'bar' });
    expect(err.name).toBe('PlatformError');
  });

  it('默认 userMessage 等于 message', () => {
    const err = new PlatformError('test message', 'ValidationError');
    expect(err.userMessage).toBe('test message');
  });

  it('默认 retryable=false', () => {
    const err = new PlatformError('test', 'ValidationError');
    expect(err.retryable).toBe(false);
  });

  it('toJSON 返回完整序列化', () => {
    const err = new PlatformError('test', 'NetworkError', { url: 'x' }, 'douyin');
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'PlatformError',
      message: 'test',
      category: 'NetworkError',
      platform: 'douyin',
      context: { url: 'x' },
      retryable: false,
      userMessage: 'test',
    });
  });
});

describe('8 个错误子类', () => {
  const subclasses: Array<[
    new (...args: any[]) => PlatformError,
    string,
    boolean,
    string,
  ]> = [
    [NetworkError, 'NetworkError', true, '网络异常'],
    [AuthError, 'AuthError', false, '登录已过期'],
    [AccountBannedError, 'AccountBannedError', false, '账号已被平台封禁'],
    [ContentRejectedError, 'ContentRejectedError', false, '内容被平台拒绝'],
    [SelectorError, 'SelectorError', false, '页面结构变化'],
    [BrowserCrashError, 'BrowserCrashError', true, '浏览器进程异常'],
    [RateLimitError, 'RateLimitError', true, '操作过于频繁'],
    [ValidationError, 'ValidationError', false, '输入参数错误'],
  ];

  for (const [Cls, category, retryable, userMessagePart] of subclasses) {
    it(`${Cls.name} 应有正确的 category/retryable/userMessage`, () => {
      const err = new Cls('test message');
      expect(err.category).toBe(category);
      expect(err.retryable).toBe(retryable);
      expect(err.userMessage).toContain(userMessagePart);
      expect(err).toBeInstanceOf(PlatformError);
    });

    it(`${Cls.name} 应能设置 platform/context`, () => {
      const err = new Cls('msg', { ctx: 1 }, 'xiaohongshu');
      expect(err.platform).toBe('xiaohongshu');
      expect(err.context).toEqual({ ctx: 1 });
    });
  }
});

describe('toPlatformError 转换器', () => {
  it('已是 PlatformError 直接返回', () => {
    const orig = new NetworkError('net', undefined, 'douyin');
    const result = toPlatformError(orig);
    expect(result).toBe(orig);
  });

  it('网络关键字 → NetworkError', () => {
    const result = toPlatformError(new Error('ECONNREFUSED timeout'), 'douyin');
    expect(result).toBeInstanceOf(NetworkError);
    expect(result.retryable).toBe(true);
    expect(result.platform).toBe('douyin');
  });

  it('认证关键字 → AuthError', () => {
    const result = toPlatformError(new Error('Cookie expired, please login'));
    expect(result).toBeInstanceOf(AuthError);
    expect(result.retryable).toBe(false);
  });

  it('封禁关键字 → AccountBannedError', () => {
    const result = toPlatformError(new Error('账号已被封禁'));
    expect(result).toBeInstanceOf(AccountBannedError);
  });

  it('内容拒绝 → ContentRejectedError', () => {
    const result = toPlatformError(new Error('标题违规 rejected'));
    expect(result).toBeInstanceOf(ContentRejectedError);
  });

  it('选择器失效 → SelectorError', () => {
    const result = toPlatformError(new Error('selector not found'));
    expect(result).toBeInstanceOf(SelectorError);
  });

  it('浏览器崩溃 → BrowserCrashError', () => {
    const result = toPlatformError(new Error('browser context closed'));
    expect(result).toBeInstanceOf(BrowserCrashError);
    expect(result.retryable).toBe(true);
  });

  it('限流 → RateLimitError', () => {
    const result = toPlatformError(new Error('rate limit exceeded'));
    expect(result).toBeInstanceOf(RateLimitError);
    expect(result.retryable).toBe(true);
  });

  it('未知错误 → ValidationError', () => {
    const result = toPlatformError(new Error('some random error'));
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.retryable).toBe(false);
  });

  it('非 Error 抛出 → ValidationError', () => {
    const result = toPlatformError('a string error', 'channels');
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.platform).toBe('channels');
  });

  it('null/undefined → ValidationError', () => {
    const r1 = toPlatformError(null);
    const r2 = toPlatformError(undefined);
    expect(r1).toBeInstanceOf(ValidationError);
    expect(r2).toBeInstanceOf(ValidationError);
  });
});

describe('错误类型 RetryPolicy 决策', () => {
  it('retryable=true 的 3 类可重试', () => {
    expect(new NetworkError('').retryable).toBe(true);
    expect(new BrowserCrashError('').retryable).toBe(true);
    expect(new RateLimitError('').retryable).toBe(true);
  });

  it('其他 5 类不重试', () => {
    expect(new AuthError('').retryable).toBe(false);
    expect(new AccountBannedError('').retryable).toBe(false);
    expect(new ContentRejectedError('').retryable).toBe(false);
    expect(new SelectorError('').retryable).toBe(false);
    expect(new ValidationError('').retryable).toBe(false);
  });
});
