import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { licenseServerClient } from '@electron/services/LicenseServerClient';

const mockFetch = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: mockLog,
  info: mockLog.info,
  error: mockLog.error,
  warn: mockLog.warn,
  transports: { file: { resolvePathFn: vi.fn() } },
}));

const originalEnv = process.env;

function mockFetchResponse(data: { success: boolean; data?: unknown; error?: string }, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('LicenseServerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    process.env = { ...originalEnv, MATRIXFLOW_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateOnline', () => {
    it('returns success when server validates key', async () => {
      mockFetchResponse({
        success: true,
        data: { key: 'VALID-KEY', type: 'pro', expiresAt: '2027-01-01' },
      });

      const result = await licenseServerClient.validateOnline('VALID-KEY');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('returns error when server rejects key', async () => {
      mockFetchResponse({ success: false, error: '无效密钥' });

      const result = await licenseServerClient.validateOnline('INVALID-KEY');
      expect(result.success).toBe(false);
      expect(result.error).toBe('无效密钥');
    });

    it('retries on network failure and returns error', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await licenseServerClient.validateOnline('SOME-KEY');
      expect(result.success).toBe(false);
      expect(result.error).toContain('网络连接失败');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('activateOnline', () => {
    it('returns success with license on activation', async () => {
      const licenseData = { key: 'ACT-KEY', type: 'pro', expiresAt: '2027-01-01' };
      mockFetchResponse({ success: true, data: licenseData });

      const result = await licenseServerClient.activateOnline('ACT-KEY', 'test@test.com', 'device-1');
      expect(result.success).toBe(true);
      expect(result.license).toBeDefined();
    });

    it('returns error when activation fails', async () => {
      mockFetchResponse({ success: false, error: '已达到最大设备数' });

      const result = await licenseServerClient.activateOnline('ACT-KEY', 'test@test.com', 'device-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('已达到最大设备数');
    });

    it('returns network error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));

      const result = await licenseServerClient.activateOnline('KEY', 'test@test.com', 'dev-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('网络连接失败');
    });
  });

  describe('deactivateOnline', () => {
    it('returns true when deactivation succeeds', async () => {
      mockFetchResponse({ success: true });

      const result = await licenseServerClient.deactivateOnline('KEY', 'device-1');
      expect(result).toBe(true);
    });

    it('returns false when deactivation fails', async () => {
      mockFetch.mockRejectedValue(new Error('network'));

      const result = await licenseServerClient.deactivateOnline('KEY', 'device-1');
      expect(result).toBe(false);
    });

    it('returns false on server error', async () => {
      mockFetchResponse({ success: false }, 500);

      const result = await licenseServerClient.deactivateOnline('KEY', 'device-1');
      expect(result).toBe(false);
    });
  });

  describe('checkUpdate', () => {
    it('returns update available', async () => {
      mockFetchResponse({ success: true, data: { hasUpdate: true, version: '2.0.0' } });

      const result = await licenseServerClient.checkUpdate('KEY');
      expect(result.hasUpdate).toBe(true);
      expect(result.version).toBe('2.0.0');
    });

    it('returns no update when not available', async () => {
      mockFetchResponse({ success: true, data: { hasUpdate: false } });

      const result = await licenseServerClient.checkUpdate('KEY');
      expect(result.hasUpdate).toBe(false);
    });

    it('returns no update on error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));

      const result = await licenseServerClient.checkUpdate('KEY');
      expect(result.hasUpdate).toBe(false);
    });
  });

  describe('generateOfflineActivation', () => {
    it('returns activation code on success', async () => {
      mockFetchResponse({ success: true, data: { activationCode: 'OFFLINE-CODE-123' } });

      const result = await licenseServerClient.generateOfflineActivation('KEY', 'email@test.com', 'dev-1', 'fp-1');
      expect(result).toBe('OFFLINE-CODE-123');
    });

    it('returns null when no activation code in response', async () => {
      mockFetchResponse({ success: true, data: {} });

      const result = await licenseServerClient.generateOfflineActivation('KEY', 'email@test.com', 'dev-1', 'fp-1');
      expect(result).toBeNull();
    });

    it('returns null on failure', async () => {
      mockFetch.mockRejectedValue(new Error('network'));

      const result = await licenseServerClient.generateOfflineActivation('KEY', 'email@test.com', 'dev-1', 'fp-1');
      expect(result).toBeNull();
    });

    it('returns null when server returns error', async () => {
      mockFetchResponse({ success: false, error: 'invalid' });

      const result = await licenseServerClient.generateOfflineActivation('KEY', 'email@test.com', 'dev-1', 'fp-1');
      expect(result).toBeNull();
    });
  });

  describe('request headers', () => {
    it('sends HMAC signature headers', async () => {
      mockFetchResponse({ success: true, data: {} });

      await licenseServerClient.validateOnline('KEY');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Timestamp': expect.any(String),
            'X-Nonce': expect.any(String),
            'X-Signature': expect.any(String),
          }),
        }),
      );
    });
  });
});
