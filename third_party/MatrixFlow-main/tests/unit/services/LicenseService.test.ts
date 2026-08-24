import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { licenseService, LicenseService } from '@electron/services/LicenseService';
import type { License } from '@electron/services/LicenseService';

const { mockVerify, mockCreateVerify, mockCreateHash, mockRandomUUID, mockFs, mockStmt, mockDb } = vi.hoisted(() => {
  const verifyFn = vi.fn();
  const createVerifyFn = vi.fn(() => ({
    update: vi.fn(),
    verify: verifyFn,
  }));
  const createHashFn = vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'hashed_signature'),
    })),
  }));
  const randomUUIDFn = vi.fn(() => 'test-device-uuid');
  const fs = {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
    unlinkSync: vi.fn(),
  };
  const stmt = { run: vi.fn(), get: vi.fn() };
  const db = {
    prepare: vi.fn(() => stmt),
  };
  return {
    mockVerify: verifyFn,
    mockCreateVerify: createVerifyFn,
    mockCreateHash: createHashFn,
    mockRandomUUID: randomUUIDFn,
    mockFs: fs,
    mockStmt: stmt,
    mockDb: db,
  };
});

vi.mock('crypto', () => ({
  default: {
    createVerify: mockCreateVerify,
    createHash: mockCreateHash,
    randomUUID: mockRandomUUID,
  },
  createVerify: mockCreateVerify,
  createHash: mockCreateHash,
  randomUUID: mockRandomUUID,
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => true,
}));

vi.mock('path', () => ({
  default: {
    join: (...args: string[]) => args.join('/'),
  },
  join: (...args: string[]) => args.join('/'),
}));

import { LicenseService } from '@electron/services/LicenseService';

function encodeLicenseKey(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function createLicenseData(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'lic_001',
    plan: 'pro',
    devices: 3,
    activatedDevices: ['test-device-uuid'],
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date('2026-01-01').toISOString(),
    features: { aiAssist: true, multiPlatform: true },
    signature: 'valid_signature',
    ...overrides,
  };
}

function resetSingleton(): void {
  try {
    (LicenseService as unknown as { instance: LicenseService | null }).instance = null;
  } catch {
    // ignore singleton reset errors
  }
}

function resetLicenseState(): void {
  try {
    (licenseService as unknown as { currentLicense: License | null }).currentLicense = null;
  } catch {
    // ignore state reset errors
  }
}

describe('LicenseService', () => {
  let service: typeof licenseService;

  beforeEach(() => {
    resetSingleton();
    resetLicenseState();
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('');
    mockVerify.mockReturnValue(true);
    service = licenseService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('activateLicense', () => {
    it('有效密钥激活成功', async () => {
      const data = createLicenseData();
      const key = encodeLicenseKey(data);

      const result = await service.activateLicense(key, 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.license).toBeDefined();
      expect(result.license!.plan).toBe('pro');
      expect(result.license!.email).toBe('test@example.com');
    });

    it('无效的 base64 格式返回失败', async () => {
      const result = await service.activateLicense('not-valid-base64!!!', 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('无效');
    });

    it('签名验证失败返回错误', async () => {
      mockVerify.mockReturnValue(false);
      const data = createLicenseData();
      const key = encodeLicenseKey(data);

      const result = await service.activateLicense(key, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('签名');
    });

    it('已过期的许可证返回错误', async () => {
      const data = createLicenseData({
        expiresAt: new Date('2020-01-01').toISOString(),
      });
      const key = encodeLicenseKey(data);

      const result = await service.activateLicense(key, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('过期');
    });

    it('设备数已满且非已激活设备返回错误', async () => {
      const data = createLicenseData({
        devices: 1,
        activatedDevices: ['other-device'],
      });
      const key = encodeLicenseKey(data);

      const result = await service.activateLicense(key, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('设备');
    });

    it('设备数已满但是已激活设备可继续使用', async () => {
      const data = createLicenseData({
        devices: 1,
        activatedDevices: ['test-device-uuid'],
      });
      const key = encodeLicenseKey(data);

      const result = await service.activateLicense(key, 'test@example.com');

      expect(result.success).toBe(true);
    });

    it('新设备添加到 activatedDevices', async () => {
      const data = createLicenseData({
        devices: 3,
        activatedDevices: [],
      });
      const key = encodeLicenseKey(data);

      const result = await service.activateLicense(key, 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.license!.activatedDevices).toContain('test-device-uuid');
    });

    it('保存到数据库和离线文件', async () => {
      const data = createLicenseData();
      const key = encodeLicenseKey(data);

      await service.activateLicense(key, 'test@example.com');

      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('activateOffline', () => {
    it('设备 ID 不匹配返回错误', async () => {
      const fileContent = JSON.stringify({
        deviceId: 'wrong-device',
        licenseId: 'lic_001',
        key: 'test',
        email: 'test@example.com',
        plan: 'pro',
        devices: 3,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date('2026-01-01').toISOString(),
        features: {},
        signature: 'hashed_signature',
      });
      mockFs.readFileSync.mockReturnValue(fileContent);

      const result = await service.activateOffline('/path/to/file.lic');

      expect(result.success).toBe(false);
      expect(result.error).toContain('不匹配');
    });

    it('离线签名验证失败返回错误', async () => {
      const fileContent = JSON.stringify({
        deviceId: 'test-device-uuid',
        licenseId: 'lic_001',
        key: 'test',
        email: 'test@example.com',
        plan: 'pro',
        devices: 3,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date('2026-01-01').toISOString(),
        features: {},
        signature: 'wrong_signature',
      });
      mockFs.readFileSync.mockReturnValue(fileContent);
      mockCreateHash.mockReturnValueOnce({
        update: vi.fn(() => ({
          digest: vi.fn(() => 'different_hash'),
        })),
      });

      const result = await service.activateOffline('/path/to/file.lic');

      expect(result.success).toBe(false);
    });

    it('文件读取失败返回错误', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('文件不存在');
      });

      const result = await service.activateOffline('/nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateLicense', () => {
    it('无许可证时返回 false', () => {
      mockStmt.get.mockReturnValue(undefined);
      expect(service.validateLicense()).toBe(false);
    });

    it('已过期许可证返回 false', async () => {
      const data = createLicenseData({
        expiresAt: new Date('2020-01-01').toISOString(),
      });
      const key = encodeLicenseKey(data);
      await service.activateLicense(key, 'test@example.com');

      expect(service.validateLicense()).toBe(false);
    });

    it('有效许可证返回 true', async () => {
      const data = createLicenseData();
      const key = encodeLicenseKey(data);
      await service.activateLicense(key, 'test@example.com');

      expect(service.validateLicense()).toBe(true);
    });
  });

  describe('getLicense', () => {
    it('未激活时从数据库加载', async () => {
      mockStmt.get.mockReturnValue({
        id: 'lic_db',
        key: 'db_key',
        email: 'db@test.com',
        plan: 'starter',
        devices: 1,
        activated_devices: '["test-device-uuid"]',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: '2026-01-01T00:00:00.000Z',
        features: '{"basic":true}',
      });

      const license = service.getLicense();

      expect(license).not.toBeNull();
      expect(license!.id).toBe('lic_db');
    });
  });

  describe('hasFeature', () => {
    it('许可证无效时返回 false', () => {
      expect(service.hasFeature('aiAssist')).toBe(false);
    });

    it('有效许可证且有该 feature 返回 true', async () => {
      const data = createLicenseData();
      const key = encodeLicenseKey(data);
      await service.activateLicense(key, 'test@example.com');

      expect(service.hasFeature('aiAssist')).toBe(true);
    });

    it('有效许可证但无该 feature 返回 false', async () => {
      const data = createLicenseData({ features: { basic: true } });
      const key = encodeLicenseKey(data);
      await service.activateLicense(key, 'test@example.com');

      expect(service.hasFeature('premium')).toBe(false);
    });
  });

  describe('getMaxDevices', () => {
    it('无许可证时返回 1', () => {
      mockStmt.get.mockReturnValue(undefined);
      expect(service.getMaxDevices()).toBe(1);
    });

    it('有许可证时返回 devices 数', async () => {
      const data = createLicenseData({ devices: 5 });
      const key = encodeLicenseKey(data);
      await service.activateLicense(key, 'test@example.com');

      expect(service.getMaxDevices()).toBe(5);
    });
  });

  describe('deactivate', () => {
    it('清除数据库和离线文件', async () => {
      const data = createLicenseData();
      const key = encodeLicenseKey(data);
      await service.activateLicense(key, 'test@example.com');

      mockFs.existsSync.mockReturnValue(true);
      service.deactivate();

      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('离线文件不存在时不报错', async () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(() => service.deactivate()).not.toThrow();
    });
  });

  describe('generateOfflineRequest', () => {
    it('生成请求文件并返回路径', () => {
      const path = service.generateOfflineRequest('KEY', 'test@example.com');

      expect(path).toContain('activation_request.json');
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const content = JSON.parse(writeCall[1]);
      expect(content.deviceId).toBe('test-device-uuid');
      expect(content.licenseKey).toBe('KEY');
      expect(content.email).toBe('test@example.com');
    });
  });
});
