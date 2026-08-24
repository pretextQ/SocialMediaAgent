import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  installMatrixflowMock,
  removeMatrixflowMock,
} from '../../../mocks/window-matrixflow';
import { useLicenseStore } from '@/renderer/stores/license';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';

let mock: MatrixflowMock;

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

function makeLicense(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lic-1',
    email: 'test@example.com',
    plan: 'pro' as const,
    devices: 3,
    activatedDevices: ['device-1'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    features: {
      multi_account: true,
      scheduled_publish: true,
      ai_optimization: false,
    },
    ...overrides,
  };
}

describe('license store', () => {
  describe('initial state', () => {
    it('starts with null license', () => {
      const store = useLicenseStore();
      expect(store.license).toBeNull();
    });

    it('starts with isValid=false', () => {
      const store = useLicenseStore();
      expect(store.isValid).toBe(false);
    });

    it('starts with loading=false', () => {
      const store = useLicenseStore();
      expect(store.loading).toBe(false);
    });
  });

  describe('computed: planName', () => {
    it('returns "未激活" when no license', () => {
      const store = useLicenseStore();
      expect(store.planName).toBe('未激活');
    });

    it('returns "入门版" for starter plan', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ plan: 'starter' }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.planName).toBe('入门版');
    });

    it('returns "专业版" for pro plan', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ plan: 'pro' }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.planName).toBe('专业版');
    });

    it('returns "企业版" for enterprise plan', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ plan: 'enterprise' }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.planName).toBe('企业版');
    });
  });

  describe('computed: daysRemaining', () => {
    it('returns 0 when no license', () => {
      const store = useLicenseStore();
      expect(store.daysRemaining).toBe(0);
    });

    it('returns days remaining for valid license', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ expiresAt: futureDate }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.daysRemaining).toBeGreaterThanOrEqual(14);
      expect(store.daysRemaining).toBeLessThanOrEqual(16);
    });

    it('returns 0 for expired license', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ expiresAt: pastDate }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.daysRemaining).toBe(0);
    });

    it('returns 1 for license expiring today', async () => {
      const nearFuture = new Date(Date.now() + 12 * 60 * 60 * 1000);
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ expiresAt: nearFuture }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.daysRemaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computed: featureList', () => {
    it('returns empty array when no license', () => {
      const store = useLicenseStore();
      expect(store.featureList).toEqual([]);
    });

    it('returns only enabled features', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({
          features: {
            multi_account: true,
            scheduled_publish: true,
            ai_optimization: false,
          },
        }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.featureList).toContain('multi_account');
      expect(store.featureList).toContain('scheduled_publish');
      expect(store.featureList).not.toContain('ai_optimization');
    });

    it('returns empty array when all features disabled', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({
          features: { feature_a: false, feature_b: false },
        }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.featureList).toEqual([]);
    });
  });

  describe('checkLicense', () => {
    it('fetches status and updates license state', async () => {
      const licenseData = makeLicense();
      mock.license.status.mockResolvedValue({
        valid: true,
        license: licenseData,
      });

      const store = useLicenseStore();
      await store.checkLicense();

      expect(store.isValid).toBe(true);
      expect(store.license).toEqual(licenseData);
      expect(mock.license.status).toHaveBeenCalled();
    });

    it('sets isValid=false when license is invalid', async () => {
      mock.license.status.mockResolvedValue({
        valid: false,
        license: null,
      });

      const store = useLicenseStore();
      await store.checkLicense();

      expect(store.isValid).toBe(false);
      expect(store.license).toBeNull();
    });

    it('manages loading state', async () => {
      let loadingDuringRequest = false;
      mock.license.status.mockImplementation(async () => {
        loadingDuringRequest = true;
        return { valid: false, license: null };
      });

      const store = useLicenseStore();
      expect(store.loading).toBe(false);

      const promise = store.checkLicense();
      expect(store.loading).toBe(true);

      await promise;
      expect(store.loading).toBe(false);
    });

    it('clears loading even when IPC throws', async () => {
      mock.license.status.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.checkLicense()).rejects.toThrow('IPC failure');
      expect(store.loading).toBe(false);
    });
  });

  describe('activate', () => {
    it('activates license and updates state', async () => {
      const licenseData = makeLicense();
      mock.license.activate.mockResolvedValue({
        success: true,
        license: licenseData,
      });

      const store = useLicenseStore();
      const result = await store.activate('KEY-123', 'test@example.com');

      expect(result).toEqual({ success: true });
      expect(store.license).toEqual(licenseData);
      expect(store.isValid).toBe(true);
      expect(mock.license.activate).toHaveBeenCalledWith(
        'KEY-123',
        'test@example.com'
      );
    });

    it('returns error when activation fails', async () => {
      mock.license.activate.mockResolvedValue({
        success: false,
        error: 'Invalid license key',
      });

      const store = useLicenseStore();
      const result = await store.activate('BAD-KEY', 'test@example.com');

      expect(result).toEqual({ success: false, error: 'Invalid license key' });
      expect(store.isValid).toBe(false);
      expect(store.license).toBeNull();
    });

    it('manages loading state during activation', async () => {
      mock.license.activate.mockImplementation(async () => {
        return { success: true, license: makeLicense() };
      });

      const store = useLicenseStore();
      const promise = store.activate('KEY', 'email');
      expect(store.loading).toBe(true);
      await promise;
      expect(store.loading).toBe(false);
    });

    it('clears loading even when activation throws', async () => {
      mock.license.activate.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.activate('KEY', 'email')).rejects.toThrow(
        'IPC failure'
      );
      expect(store.loading).toBe(false);
    });
  });

  describe('activateOffline', () => {
    it('activates offline and updates state', async () => {
      const licenseData = makeLicense();
      mock.license.activateOffline.mockResolvedValue({
        success: true,
        license: licenseData,
      });

      const store = useLicenseStore();
      const result = await store.activateOffline('/path/to/license.dat');

      expect(result).toEqual({ success: true });
      expect(store.license).toEqual(licenseData);
      expect(store.isValid).toBe(true);
      expect(mock.license.activateOffline).toHaveBeenCalledWith(
        '/path/to/license.dat'
      );
    });

    it('returns error when offline activation fails', async () => {
      mock.license.activateOffline.mockResolvedValue({
        success: false,
        error: 'File not found',
      });

      const store = useLicenseStore();
      const result = await store.activateOffline('/bad/path');

      expect(result).toEqual({ success: false, error: 'File not found' });
      expect(store.isValid).toBe(false);
    });

    it('manages loading state during offline activation', async () => {
      mock.license.activateOffline.mockImplementation(async () => {
        return { success: true, license: makeLicense() };
      });

      const store = useLicenseStore();
      const promise = store.activateOffline('/path');
      expect(store.loading).toBe(true);
      await promise;
      expect(store.loading).toBe(false);
    });

    it('clears loading even when offline activation throws', async () => {
      mock.license.activateOffline.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.activateOffline('/path')).rejects.toThrow(
        'IPC failure'
      );
      expect(store.loading).toBe(false);
    });
  });

  describe('generateOfflineRequest', () => {
    it('returns request data on success', async () => {
      mock.license.offlineRequest.mockResolvedValue({
        success: true,
        data: 'offline-request-data-abc123',
      });

      const store = useLicenseStore();
      const result = await store.generateOfflineRequest(
        'KEY-123',
        'test@example.com'
      );

      expect(result).toBe('offline-request-data-abc123');
      expect(mock.license.offlineRequest).toHaveBeenCalledWith(
        'KEY-123',
        'test@example.com'
      );
    });

    it('returns null when request fails', async () => {
      mock.license.offlineRequest.mockResolvedValue({
        success: false,
        error: 'request failed',
      });

      const store = useLicenseStore();
      const result = await store.generateOfflineRequest('KEY', 'email');

      expect(result).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('clears license state on success', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense(),
      });
      mock.license.deactivate.mockResolvedValue({ success: true });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.isValid).toBe(true);

      const result = await store.deactivate();

      expect(result).toBe(true);
      expect(store.license).toBeNull();
      expect(store.isValid).toBe(false);
      expect(mock.license.deactivate).toHaveBeenCalled();
    });

    it('returns false when deactivation fails', async () => {
      mock.license.deactivate.mockResolvedValue({ success: false });

      const store = useLicenseStore();
      const result = await store.deactivate();

      expect(result).toBe(false);
    });

    it('does not reset state when deactivation fails', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense(),
      });
      mock.license.deactivate.mockResolvedValue({ success: false });

      const store = useLicenseStore();
      await store.checkLicense();
      await store.deactivate();

      expect(store.isValid).toBe(true);
      expect(store.license).not.toBeNull();
    });
  });

  describe('hasFeature', () => {
    it('returns false when no license', () => {
      const store = useLicenseStore();
      expect(store.hasFeature('multi_account')).toBe(false);
    });

    it('returns false when license exists but isValid is false', async () => {
      mock.license.status.mockResolvedValue({
        valid: false,
        license: makeLicense({
          features: { multi_account: true },
        }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.hasFeature('multi_account')).toBe(false);
    });

    it('returns true for enabled feature with valid license', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({
          features: { multi_account: true, ai_optimization: false },
        }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.hasFeature('multi_account')).toBe(true);
    });

    it('returns false for disabled feature with valid license', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({
          features: { ai_optimization: false },
        }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.hasFeature('ai_optimization')).toBe(false);
    });

    it('returns false for non-existent feature', async () => {
      mock.license.status.mockResolvedValue({
        valid: true,
        license: makeLicense({ features: {} }),
      });

      const store = useLicenseStore();
      await store.checkLicense();
      expect(store.hasFeature('nonexistent')).toBe(false);
    });
  });

  describe('offline request flow', () => {
    it('full offline flow: generate request then activate', async () => {
      const store = useLicenseStore();

      mock.license.offlineRequest.mockResolvedValue({
        success: true,
        data: 'request-data-xyz',
      });
      const request = await store.generateOfflineRequest(
        'OFFLINE-KEY',
        'user@example.com'
      );
      expect(request).toBe('request-data-xyz');

      const licenseData = makeLicense();
      mock.license.activateOffline.mockResolvedValue({
        success: true,
        license: licenseData,
      });
      const activation = await store.activateOffline('/path/to/response.dat');

      expect(activation).toEqual({ success: true });
      expect(store.isValid).toBe(true);
      expect(store.license).toEqual(licenseData);
    });

    it('offline activation failure does not change state', async () => {
      mock.license.activateOffline.mockResolvedValue({
        success: false,
        error: 'invalid response file',
      });

      const store = useLicenseStore();
      const result = await store.activateOffline('/bad/file');

      expect(result.success).toBe(false);
      expect(store.isValid).toBe(false);
      expect(store.license).toBeNull();
    });
  });

  describe('error paths', () => {
    it('checkLicense handles IPC rejection', async () => {
      mock.license.status.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.checkLicense()).rejects.toThrow('IPC failure');
      expect(store.loading).toBe(false);
    });

    it('activate handles IPC rejection', async () => {
      mock.license.activate.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.activate('KEY', 'email')).rejects.toThrow(
        'IPC failure'
      );
      expect(store.loading).toBe(false);
    });

    it('activateOffline handles IPC rejection', async () => {
      mock.license.activateOffline.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.activateOffline('/path')).rejects.toThrow(
        'IPC failure'
      );
      expect(store.loading).toBe(false);
    });

    it('generateOfflineRequest handles IPC rejection', async () => {
      mock.license.offlineRequest.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(
        store.generateOfflineRequest('KEY', 'email')
      ).rejects.toThrow('IPC failure');
    });

    it('deactivate handles IPC rejection', async () => {
      mock.license.deactivate.mockRejectedValue(new Error('IPC failure'));

      const store = useLicenseStore();
      await expect(store.deactivate()).rejects.toThrow('IPC failure');
    });
  });

  describe('window.matrixflow undefined', () => {
    it('checkLicense throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useLicenseStore();
      await expect(store.checkLicense()).rejects.toThrow();
    });

    it('activate throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useLicenseStore();
      await expect(store.activate('KEY', 'email')).rejects.toThrow();
    });

    it('activateOffline throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useLicenseStore();
      await expect(store.activateOffline('/path')).rejects.toThrow();
    });

    it('generateOfflineRequest throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useLicenseStore();
      await expect(
        store.generateOfflineRequest('KEY', 'email')
      ).rejects.toThrow();
    });

    it('deactivate throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useLicenseStore();
      await expect(store.deactivate()).rejects.toThrow();
    });
  });
});
