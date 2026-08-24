import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformRegistry } from '@electron/platform/base/PlatformRegistry';
import type { PlatformAdapter } from '@electron/platform/base/interfaces';

function createMockAdapter(platformId: string): PlatformAdapter {
  return {
    platformId,
    config: {
      platformId,
      platformName: `Test ${platformId}`,
      domain: `${platformId}.test.com`,
      rateLimit: { hourly: 10, daily: 50, burst: 3 },
      urls: {
        creator: `https://${platformId}.test.com/creator`,
        upload: `https://${platformId}.test.com/upload`,
        publish: `https://${platformId}.test.com/publish`,
      },
      selectors: {},
    },
    capabilities: {
      serverScheduledPublish: false,
      maxScheduleDays: 0,
      comment: false,
      image: false,
    },
    getPublishPageUrl: () => `https://${platformId}.test.com/publish`,
    getCreatorCenterUrl: () => `https://${platformId}.test.com/creator`,
    detectPageChanges: async () => ({ hasChanges: false, changedSelectors: [], timestamp: new Date() }),
    login: async () => ({ success: true, cookiePath: '', message: '' }),
    checkCookie: async () => true,
    getQRCode: async () => '',
    uploadVideo: async () => ({ success: true, message: '' }),
    publish: async () => ({ success: true, message: '' }),
    fetchStats: async () => ({
      playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, fetchTime: new Date(),
    }),
    fetchVideoStats: async () => ({
      playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, fetchTime: new Date(), videoId: '',
    }),
  };
}

describe('PlatformRegistry', () => {
  beforeEach(() => {
    const adapters = (PlatformRegistry as unknown as { adapters: Map<string, PlatformAdapter> }).adapters;
    adapters.clear();
  });

  describe('register', () => {
    it('registers a platform adapter', () => {
      const adapter = createMockAdapter('test-platform');
      PlatformRegistry.register(adapter);

      expect(PlatformRegistry.getAdapter('test-platform')).toBe(adapter);
    });

    it('overwrites existing adapter for same platformId', () => {
      const adapter1 = createMockAdapter('douyin');
      const adapter2 = createMockAdapter('douyin');

      PlatformRegistry.register(adapter1);
      PlatformRegistry.register(adapter2);

      expect(PlatformRegistry.getAdapter('douyin')).toBe(adapter2);
    });

    it('registers multiple different platforms', () => {
      const douyin = createMockAdapter('douyin');
      const xhs = createMockAdapter('xiaohongshu');

      PlatformRegistry.register(douyin);
      PlatformRegistry.register(xhs);

      expect(PlatformRegistry.getAdapter('douyin')).toBe(douyin);
      expect(PlatformRegistry.getAdapter('xiaohongshu')).toBe(xhs);
    });
  });

  describe('getAdapter', () => {
    it('returns undefined for unregistered platform', () => {
      expect(PlatformRegistry.getAdapter('nonexistent')).toBeUndefined();
    });

    it('returns registered adapter', () => {
      const adapter = createMockAdapter('kuaishou');
      PlatformRegistry.register(adapter);

      expect(PlatformRegistry.getAdapter('kuaishou')).toBe(adapter);
    });
  });

  describe('getAllAdapters', () => {
    it('returns empty array when no adapters registered', () => {
      expect(PlatformRegistry.getAllAdapters()).toEqual([]);
    });

    it('returns all registered adapters', () => {
      const a1 = createMockAdapter('douyin');
      const a2 = createMockAdapter('xiaohongshu');
      const a3 = createMockAdapter('channels');

      PlatformRegistry.register(a1);
      PlatformRegistry.register(a2);
      PlatformRegistry.register(a3);

      const all = PlatformRegistry.getAllAdapters();
      expect(all).toHaveLength(3);
      expect(all).toContain(a1);
      expect(all).toContain(a2);
      expect(all).toContain(a3);
    });
  });

  describe('getSupportedPlatforms', () => {
    it('returns empty array when no adapters registered', () => {
      expect(PlatformRegistry.getSupportedPlatforms()).toEqual([]);
    });

    it('returns platform IDs of all registered adapters', () => {
      PlatformRegistry.register(createMockAdapter('douyin'));
      PlatformRegistry.register(createMockAdapter('kuaishou'));

      const platforms = PlatformRegistry.getSupportedPlatforms();
      expect(platforms).toEqual(expect.arrayContaining(['douyin', 'kuaishou']));
    });
  });

  describe('hasPlatform', () => {
    it('returns false for unregistered platform', () => {
      expect(PlatformRegistry.hasPlatform('missing')).toBe(false);
    });

    it('returns true for registered platform', () => {
      PlatformRegistry.register(createMockAdapter('douyin'));
      expect(PlatformRegistry.hasPlatform('douyin')).toBe(true);
    });
  });

  describe('singleton behavior', () => {
    it('is a singleton instance (same reference across imports)', async () => {
      const { PlatformRegistry: registry2 } = await import('@electron/platform/base/PlatformRegistry');
      expect(PlatformRegistry).toBe(registry2);
    });
  });
});
