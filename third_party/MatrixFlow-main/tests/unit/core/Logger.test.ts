import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as electronLog from 'electron-log';
import { Logger } from '@electron/core/Logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('创建 Logger 实例', () => {
      const logger = new Logger('TestModule');
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('info', () => {
    it('调用 electron-log.info 并附加模块名前缀', () => {
      const logger = new Logger('MyModule');
      logger.info('测试消息');
      expect(electronLog.info).toHaveBeenCalledWith(
        '[MyModule] 测试消息',
      );
    });

    it('传递额外参数', () => {
      const logger = new Logger('Mod');
      const extra = { key: 'value' };
      logger.info('消息', extra);
      expect(electronLog.info).toHaveBeenCalledWith(
        '[Mod] 消息',
        extra,
      );
    });

    it('传递多个额外参数', () => {
      const logger = new Logger('Mod');
      logger.info('消息', 'arg1', 'arg2', 42);
      expect(electronLog.info).toHaveBeenCalledWith(
        '[Mod] 消息',
        'arg1',
        'arg2',
        42,
      );
    });
  });

  describe('warn', () => {
    it('调用 electron-log.warn 并附加模块名前缀', () => {
      const logger = new Logger('WarnModule');
      logger.warn('警告消息');
      expect(electronLog.warn).toHaveBeenCalledWith(
        '[WarnModule] 警告消息',
      );
    });

    it('传递额外参数', () => {
      const logger = new Logger('WarnMod');
      const err = new Error('test error');
      logger.warn('出错了', err);
      expect(electronLog.warn).toHaveBeenCalledWith(
        '[WarnMod] 出错了',
        err,
      );
    });
  });

  describe('error', () => {
    it('调用 electron-log.error 并附加模块名前缀', () => {
      const logger = new Logger('ErrModule');
      logger.error('错误消息');
      expect(electronLog.error).toHaveBeenCalledWith(
        '[ErrModule] 错误消息',
      );
    });

    it('传递 Error 对象作为额外参数', () => {
      const logger = new Logger('ErrMod');
      const err = new Error('critical');
      logger.error('严重错误', err);
      expect(electronLog.error).toHaveBeenCalledWith(
        '[ErrMod] 严重错误',
        err,
      );
    });
  });

  describe('debug', () => {
    it('调用 electron-log.debug 并附加模块名前缀', () => {
      const logger = new Logger('DbgModule');
      logger.debug('调试消息');
      expect(electronLog.debug).toHaveBeenCalledWith(
        '[DbgModule] 调试消息',
      );
    });

    it('传递额外参数', () => {
      const logger = new Logger('DbgMod');
      logger.debug('变量值', 42, true);
      expect(electronLog.debug).toHaveBeenCalledWith(
        '[DbgMod] 变量值',
        42,
        true,
      );
    });
  });

  describe('不同模块名', () => {
    it('不同模块名产生不同前缀', () => {
      const loggerA = new Logger('ModuleA');
      const loggerB = new Logger('ModuleB');

      loggerA.info('from A');
      loggerB.info('from B');

      expect(electronLog.info).toHaveBeenCalledWith('[ModuleA] from A');
      expect(electronLog.info).toHaveBeenCalledWith('[ModuleB] from B');
    });
  });
});
