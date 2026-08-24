import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all submodules
vi.mock('@electron/platform/kuaishou/login', () => ({
  qrCodeLogin: vi.fn(() => Promise.resolve({ success: true, cookiePath: '/tmp/test.json', message: 'ok' })),
  checkCookie: vi.fn(() => Promise.resolve(true)),
  getQRCode: vi.fn(() => Promise.resolve('/tmp/qr.png')),
}));

vi.mock('@electron/platform/kuaishou/upload', () => ({
  uploadVideo: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
}));

vi.mock('@electron/platform/kuaishou/publish', () => ({
  publish: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
}));

vi.mock('@electron/platform/kuaishou/schedule', () => ({
  schedule: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
}));

vi.mock('@electron/platform/kuaishou/stats', () => ({
  fetchStats: vi.fn(() => Promise.resolve({
    playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, fetchTime: new Date(),
  })),
  fetchVideoStats: vi.fn(() => Promise.resolve({
    videoId: 'vid1', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, fetchTime: new Date(),
  })),
}));

describe('kuaishou/index (KuaishouAdapter)', () => {
  let kuaishouAdapter: import('@electron/platform/kuaishou/index').kuaishouAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@electron/platform/kuaishou/index');
    kuaishouAdapter = mod.kuaishouAdapter;
  });

  describe('singleton properties', () => {
    it('has correct platformId', () => {
      expect(kuaishouAdapter.platformId).toBe('kuaishou');
    });

    it('has correct config', () => {
      expect(kuaishouAdapter.config.platformId).toBe('kuaishou');
      expect(kuaishouAdapter.config.platformName).toBe('快手');
      expect(kuaishouAdapter.config.domain).toBe('kuaishou.com');
    });

    it('has correct rateLimit', () => {
      expect(kuaishouAdapter.config.rateLimit).toEqual({
        hourly: 6,
        daily: 25,
        burst: 2,
      });
    });

    it('has correct URLs all pointing to cp.kuaishou.com', () => {
      const urls = kuaishouAdapter.config.urls;
      expect(urls.creator).toContain('cp.kuaishou.com');
      expect(urls.upload).toContain('cp.kuaishou.com');
      expect(urls.publish).toContain('cp.kuaishou.com');
      expect(urls.login).toContain('cp.kuaishou.com');
    });

    it('has config selectors with login and upload groups', () => {
      expect(kuaishouAdapter.config.selectors.login).toBeDefined();
      expect(kuaishouAdapter.config.selectors.upload).toBeDefined();
    });
  });

  describe('capabilities', () => {
    it('supports server scheduled publish', () => {
      expect(kuaishouAdapter.capabilities.serverScheduledPublish).toBe(true);
    });

    it('has maxScheduleDays of 14', () => {
      expect(kuaishouAdapter.capabilities.maxScheduleDays).toBe(14);
    });

    it('supports comments', () => {
      expect(kuaishouAdapter.capabilities.comment).toBe(true);
    });

    it('supports image posts', () => {
      expect(kuaishouAdapter.capabilities.image).toBe(true);
    });
  });

  describe('getPublishPageUrl', () => {
    it('returns upload URL', () => {
      expect(kuaishouAdapter.getPublishPageUrl()).toContain('cp.kuaishou.com');
      expect(kuaishouAdapter.getPublishPageUrl()).toContain('/article/publish/video');
    });
  });

  describe('getCreatorCenterUrl', () => {
    it('returns creator home URL', () => {
      expect(kuaishouAdapter.getCreatorCenterUrl()).toContain('cp.kuaishou.com');
    });
  });

  describe('detectPageChanges', () => {
    it('detects missing file input as change', async () => {
      const mockPage = {
        $: vi.fn(() => Promise.resolve(null)),
      } as any;
      const result = await kuaishouAdapter.detectPageChanges(mockPage);
      expect(result.hasChanges).toBe(true);
      expect(result.changedSelectors).toContain('upload.fileInput');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('returns no changes when file input exists', async () => {
      const mockPage = {
        $: vi.fn(() => Promise.resolve({})),
      } as any;
      const result = await kuaishouAdapter.detectPageChanges(mockPage);
      expect(result.hasChanges).toBe(false);
      expect(result.changedSelectors).toEqual([]);
    });
  });

  describe('delegation methods', () => {
    it('login delegates to qrCodeLogin', async () => {
      const { qrCodeLogin } = await import('@electron/platform/kuaishou/login');
      await kuaishouAdapter.login('acc1', false);
      expect(qrCodeLogin).toHaveBeenCalledWith('acc1', false);
    });

    it('checkCookie delegates to checkCookie', async () => {
      const { checkCookie } = await import('@electron/platform/kuaishou/login');
      await kuaishouAdapter.checkCookie('acc1');
      expect(checkCookie).toHaveBeenCalledWith('acc1');
    });

    it('getQRCode delegates to getQRCode', async () => {
      const { getQRCode } = await import('@electron/platform/kuaishou/login');
      await kuaishouAdapter.getQRCode('acc1');
      expect(getQRCode).toHaveBeenCalledWith('acc1');
    });

    it('uploadVideo delegates to uploadVideo', async () => {
      const { uploadVideo } = await import('@electron/platform/kuaishou/upload');
      const ctx = { accountId: 'acc1', videoPath: '/tmp/video.mp4' } as any;
      await kuaishouAdapter.uploadVideo(ctx);
      expect(uploadVideo).toHaveBeenCalledWith(ctx);
    });

    it('publish delegates to publish', async () => {
      const { publish } = await import('@electron/platform/kuaishou/publish');
      const ctx = { accountId: 'acc1', title: 'test' } as any;
      await kuaishouAdapter.publish(ctx);
      expect(publish).toHaveBeenCalledWith(ctx);
    });

    it('schedule delegates to schedule', async () => {
      const { schedule } = await import('@electron/platform/kuaishou/schedule');
      const ctx = { accountId: 'acc1', scheduledTime: new Date() } as any;
      await kuaishouAdapter.schedule?.(ctx);
      expect(schedule).toHaveBeenCalledWith(ctx);
    });

    it('fetchStats delegates to fetchStats', async () => {
      const { fetchStats } = await import('@electron/platform/kuaishou/stats');
      await kuaishouAdapter.fetchStats('acc1', '7d' as any);
      expect(fetchStats).toHaveBeenCalledWith('acc1', '7d');
    });

    it('fetchVideoStats delegates to fetchVideoStats', async () => {
      const { fetchVideoStats } = await import('@electron/platform/kuaishou/stats');
      await kuaishouAdapter.fetchVideoStats('vid1');
      expect(fetchVideoStats).toHaveBeenCalledWith('vid1');
    });
  });
});
