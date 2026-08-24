import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { ConfigManager } from '@electron/core/ConfigManager';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

function resetSingleton(): void {
  Reflect.set(ConfigManager, 'instance', null);
}

describe('ConfigManager', () => {
  let config: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    config = ConfigManager.getInstance();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('getInstance', () => {
    it('返回同一个单例实例', () => {
      const a = ConfigManager.getInstance();
      const b = ConfigManager.getInstance();
      expect(a).toBe(b);
    });

    it('重置后返回新实例', () => {
      const first = ConfigManager.getInstance();
      resetSingleton();
      const second = ConfigManager.getInstance();
      expect(first).not.toBe(second);
    });
  });

  describe('默认配置', () => {
    it('dataDir 包含 data 路径', () => {
      expect(config.get('dataDir')).toContain('data');
    });

    it('logLevel 默认为 info', () => {
      expect(config.get('logLevel')).toBe('info');
    });

    it('maxConcurrentPublish 默认为 5', () => {
      expect(config.get('maxConcurrentPublish')).toBe(5);
    });

    it('browserMode 默认为 system-chrome', () => {
      expect(config.get('browserMode')).toBe('system-chrome');
    });
  });

  describe('get / set', () => {
    it('set 更新配置值', () => {
      config.set('logLevel', 'debug');
      expect(config.get('logLevel')).toBe('debug');
    });

    it('set 不影响其他配置值', () => {
      config.set('logLevel', 'debug');
      expect(config.get('maxConcurrentPublish')).toBe(5);
      expect(config.get('browserMode')).toBe('system-chrome');
    });

    it('set browserMode 为 embedded', () => {
      config.set('browserMode', 'embedded');
      expect(config.get('browserMode')).toBe('embedded');
    });

    it('set browserMode 为 fingerprint', () => {
      config.set('browserMode', 'fingerprint');
      expect(config.get('browserMode')).toBe('fingerprint');
    });

    it('set maxConcurrentPublish 为新值', () => {
      config.set('maxConcurrentPublish', 10);
      expect(config.get('maxConcurrentPublish')).toBe(10);
    });
  });

  describe('getAll', () => {
    it('返回包含所有配置键的对象', () => {
      const all = config.getAll();
      expect(all).toHaveProperty('dataDir');
      expect(all).toHaveProperty('logLevel');
      expect(all).toHaveProperty('maxConcurrentPublish');
      expect(all).toHaveProperty('browserMode');
    });

    it('返回副本而非引用', () => {
      const all1 = config.getAll();
      const all2 = config.getAll();
      expect(all1).toEqual(all2);
      expect(all1).not.toBe(all2);
    });

    it('修改返回值不影响原始配置', () => {
      const all = config.getAll();
      all.logLevel = 'modified';
      expect(config.get('logLevel')).toBe('info');
    });
  });

  describe('initialize', () => {
    it('目录不存在时创建数据目录', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await config.initialize();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('目录已存在时不创建', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('config.yaml')) return false;
        return true;
      });
      await config.initialize();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('从 YAML 文件加载配置', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        'logLevel: debug\nmaxConcurrentPublish: 10\n',
      );

      await config.initialize();
      expect(config.get('logLevel')).toBe('debug');
      expect(config.get('maxConcurrentPublish')).toBe(10);
    });

    it('加载的配置与默认配置合并', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('config.yaml')) return true;
        return true;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('logLevel: warn\n');

      await config.initialize();
      expect(config.get('logLevel')).toBe('warn');
      expect(config.get('maxConcurrentPublish')).toBe(5);
    });

    it('加载配置后仍可 set 修改', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('config.yaml')) return true;
        return true;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('logLevel: warn\n');

      await config.initialize();
      config.set('logLevel', 'error');
      expect(config.get('logLevel')).toBe('error');
    });
  });

  describe('save', () => {
    it('将配置写入 YAML 文件', async () => {
      await config.save();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [pathArg, contentArg, encodingArg] = vi.mocked(
        fs.writeFileSync,
      ).mock.calls[0];
      expect(pathArg).toContain('config.yaml');
      expect(typeof contentArg).toBe('string');
      expect(encodingArg).toBe('utf-8');
    });

    it('写入的内容包含修改后的配置值', async () => {
      config.set('logLevel', 'error');
      config.set('maxConcurrentPublish', 20);
      await config.save();
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('error');
      expect(content).toContain('20');
    });
  });
});
