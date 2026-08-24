import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as yaml from 'yaml';
import { SelectorUpdateService } from '@electron/core/SelectorUpdateService';
import { EventBus } from '@electron/core/EventBus';
import { SelectorEvents } from '@electron/core/types/selector';

vi.mock('@electron/core/SignatureVerifier', () => ({
  SignatureVerifier: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn().mockReturnValue(undefined),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  statSync: vi.fn().mockReturnValue({ mtime: new Date() }),
  unlinkSync: vi.fn(),
}));

import * as fs from 'fs';

const MOCK_SELECTORS_DIR = '/tmp/matrixflow-test/selectors';

function makeRemoteConfig(version: string, updatedAt?: string) {
  return {
    version,
    updatedAt: updatedAt ?? new Date().toISOString(),
    selectors: {
      login: { username: '#username', password: '#password' },
      upload: { fileInput: 'input[type=file]', submit: '#submit' },
      publish: { title: '#title', content: '#content' },
    },
  };
}

function makeYamlContent(version: string) {
  return yaml.stringify(makeRemoteConfig(version));
}

describe('SelectorUpdateService', () => {
  let service: SelectorUpdateService;
  let eventBus: EventBus;

  beforeEach(() => {
    (SelectorUpdateService as unknown as { instance: unknown }).instance = undefined;

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    eventBus = EventBus.getInstance();
    eventBus.removeAllHandlers();
  });

  function createService(strictVerification = false, remoteBaseUrl?: string): SelectorUpdateService {
    service = SelectorUpdateService.getInstance(remoteBaseUrl);
    return service;
  }

  describe('getInstance', () => {
    it('should return singleton', () => {
      const a = createService();
      const b = SelectorUpdateService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('should create selectors directory and load local cache', async () => {
      const svc = createService();
      await svc.initialize();

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should not re-initialize if already initialized', async () => {
      const svc = createService();
      await svc.initialize();

      const mkdirCallCount = (fs.mkdirSync as ReturnType<typeof vi.fn>).mock.calls.length;
      await svc.initialize();

      expect((fs.mkdirSync as ReturnType<typeof vi.fn>).mock.calls.length).toBe(mkdirCallCount);
    });

    it('should load yaml files from selectors directory into cache', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (p === MOCK_SELECTORS_DIR) return true;
        if (p === path.join(MOCK_SELECTORS_DIR, 'douyin.yaml')) return true;
        return false;
      });
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['douyin.yaml']);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (p === path.join(MOCK_SELECTORS_DIR, 'douyin.yaml')) {
          return makeYamlContent('1.0.0');
        }
        return '';
      });

      const svc = createService();
      await svc.initialize();

      const selectors = await svc.getSelectors('douyin');
      expect(selectors.version).toBe('1.0.0');
      expect(selectors.platform).toBe('douyin');
    });

    it('should destroy clears timer and resets initialized', async () => {
      const svc = createService();
      await svc.initialize();
      expect(svc.getLocalVersion('douyin')).toBe('0.0.0');

      svc.destroy();
    });
  });

  describe('getSelectors', () => {
    it('should return cached selectors when available', async () => {
      const svc = createService();
      await svc.initialize();

      const remoteConfig = makeRemoteConfig('2.0.0');

      (svc as unknown as { cache: Map<string, unknown> }).cache.set('douyin', {
        version: '2.0.0',
        updatedAt: remoteConfig.updatedAt,
        platform: 'douyin',
        login: remoteConfig.selectors.login,
        upload: remoteConfig.selectors.upload,
        publish: remoteConfig.selectors.publish,
      });

      const result = await svc.getSelectors('douyin');
      expect(result.version).toBe('2.0.0');
    });

    it('should load from local yaml when not in cache', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (p === MOCK_SELECTORS_DIR) return true;
        if (p === path.join(MOCK_SELECTORS_DIR, 'xiaohongshu.yaml')) return true;
        return false;
      });
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (p === path.join(MOCK_SELECTORS_DIR, 'xiaohongshu.yaml')) {
          return makeYamlContent('1.5.0');
        }
        return '';
      });

      const svc = createService();
      await svc.initialize();

      const result = await svc.getSelectors('xiaohongshu');
      expect(result.version).toBe('1.5.0');
    });

    it('should throw when no cache and no local file', async () => {
      const svc = createService();
      await svc.initialize();

      await expect(svc.getSelectors('nonexistent')).rejects.toThrow(
        '平台 nonexistent 无可用选择器配置（无本地缓存）',
      );
    });
  });

  describe('getLocalVersion', () => {
    it('should return version from cache', async () => {
      const svc = createService();
      await svc.initialize();

      (svc as unknown as { cache: Map<string, { version: string }> }).cache.set('douyin', {
        version: '3.0.0',
      } as { version: string });

      expect(svc.getLocalVersion('douyin')).toBe('3.0.0');
    });

    it('should return version from local yaml when not cached', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (p === MOCK_SELECTORS_DIR) return true;
        if (p === path.join(MOCK_SELECTORS_DIR, 'channels.yaml')) return true;
        return false;
      });
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (p === path.join(MOCK_SELECTORS_DIR, 'channels.yaml')) {
          return makeYamlContent('2.1.0');
        }
        return '';
      });

      const svc = createService();
      await svc.initialize();

      expect(svc.getLocalVersion('channels')).toBe('2.1.0');
    });

    it('should return 0.0.0 when nothing available', async () => {
      const svc = createService();
      await svc.initialize();

      expect(svc.getLocalVersion('unknown')).toBe('0.0.0');
    });
  });

  describe('checkForUpdates', () => {
    it('should return false when no platforms registered', async () => {
      const svc = createService();
      await svc.initialize();

      const result = await svc.checkForUpdates();
      expect(result).toBe(false);
    });

    it('should emit UPDATE_CHECK_STARTED event', async () => {
      const emitSpy = vi.fn();
      eventBus.on(SelectorEvents.UPDATE_CHECK_STARTED, emitSpy);

      const svc = createService();
      await svc.initialize();

      (svc as unknown as { cache: Map<string, unknown> }).cache.set('douyin', {
        version: '1.0.0',
        updatedAt: '',
        platform: 'douyin',
        login: {},
        upload: {},
        publish: {},
      });

      const discoverSpy = vi.spyOn(svc as unknown as { discoverPlatforms: () => string[] }, 'discoverPlatforms');
      discoverSpy.mockReturnValue(['douyin']);

      const checkAndSpy = vi.spyOn(svc as unknown as { checkAndUpdatePlatform: (p: string) => Promise<unknown> }, 'checkAndUpdatePlatform');
      checkAndSpy.mockResolvedValue({ platform: 'douyin', oldVersion: '1.0.0', newVersion: '1.0.0', updated: false });

      await svc.checkForUpdates();

      expect(emitSpy).toHaveBeenCalledWith({ platforms: ['douyin'] });
    });
  });

  describe('forceUpdate', () => {
    it('should fetch remote, save locally, update cache, and emit events', async () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      const remoteConfig = makeRemoteConfig('5.0.0');

      const svc = createService();
      await svc.initialize();

      const fetchSpy = vi.spyOn(svc as unknown as { fetchRemoteConfig: (p: string) => Promise<unknown> }, 'fetchRemoteConfig');
      fetchSpy.mockResolvedValue(remoteConfig);

      const saveSpy = vi.spyOn(svc as unknown as { saveToLocal: (p: string, c: unknown) => void }, 'saveToLocal');
      saveSpy.mockImplementation(() => {});

      await svc.forceUpdate('douyin');

      expect(fetchSpy).toHaveBeenCalledWith('douyin');
      expect(saveSpy).toHaveBeenCalledWith('douyin', remoteConfig);
      expect(emitSpy).toHaveBeenCalledWith(SelectorEvents.FORCE_UPDATE_STARTED, { platform: 'douyin' });
      expect(emitSpy).toHaveBeenCalledWith(SelectorEvents.UPDATE_COMPLETED, expect.objectContaining({
        platform: 'douyin',
        newVersion: '5.0.0',
        updated: true,
      }));
    });
  });

  describe('isNewerVersion', () => {
    it.each([
      { remote: '2.0.0', local: '1.0.0', expected: true },
      { remote: '1.0.0', local: '1.0.0', expected: false },
      { remote: '1.0.0', local: '2.0.0', expected: false },
      { remote: '1.1.0', local: '1.0.0', expected: true },
      { remote: '1.0.1', local: '1.0.0', expected: true },
      { remote: '2.0.0', local: '1.9.9', expected: true },
      { remote: '1.0.0', local: '1.0.1', expected: false },
    ])('should compare $remote vs $local → $expected', ({ remote, local, expected }) => {
      const svc = createService();
      const method = (svc as unknown as { isNewerVersion: (r: string, l: string) => boolean }).isNewerVersion;
      expect(method(remote, local)).toBe(expected);
    });
  });
});
