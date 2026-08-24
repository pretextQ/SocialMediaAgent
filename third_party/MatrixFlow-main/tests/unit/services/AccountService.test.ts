import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AccountService } from '@electron/services/AccountService';
import { AccountEvent } from '@electron/services/types/account';
import type { AccountRow } from '@electron/services/types/account';

const eventBusEmit = vi.fn();
const electronMocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({
      cookies: {
        get: electronMocks.cookiesGet,
      },
    })),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock('@electron/core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emit: eventBusEmit,
      on: vi.fn(),
      off: vi.fn(),
    }),
  },
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

vi.mock('@electron/core/SecurityLayer', () => ({
  securityLayer: {
    encrypt: vi.fn().mockResolvedValue('encrypted-cookie'),
    decrypt: vi.fn().mockResolvedValue('raw-cookie'),
  },
}));

const mockAdapter = {
  getQRCode: vi.fn().mockResolvedValue('/tmp/qr.png'),
  login: vi.fn().mockResolvedValue({ success: true, message: 'ok', cookiePath: '/tmp/cookie.json' }),
  checkCookie: vi.fn().mockResolvedValue(true),
};

vi.mock('@electron/platform/base/PlatformRegistry', () => ({
  PlatformRegistry: {
    getAdapter: (platform: string) => ['douyin', 'channels'].includes(platform) ? mockAdapter : undefined,
    getSupportedPlatforms: () => ['douyin', 'xiaohongshu', 'channels', 'kuaishou', 'bilibili'],
    getAllAdapters: () => [],
  },
}));

const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(),
  transaction: vi.fn((fn: Function) => fn),
};

let dbAvailable = true;

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('raw-cookie-data'),
}));

function createAccountRow(overrides?: Partial<AccountRow>): AccountRow {
  return {
    id: 'acc-001',
    platform: 'douyin',
    name: '测试账号',
    avatar: null,
    cookie_encrypted: 'encrypted',
    cookie_valid: 1,
    last_cookie_check: '2026-01-01T00:00:00.000Z',
    group_id: null,
    fingerprint_id: null,
    proxy_id: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stmt(get?: unknown, all?: unknown[], run?: unknown) {
  return { get: vi.fn(() => get), all: vi.fn(() => all ?? []), run: vi.fn(() => run) };
}

function resetSingleton(): void {
  (AccountService as unknown as { instance: null }).instance = null;
}

describe('AccountService', () => {
  let service: AccountService;

  beforeEach(() => {
    resetSingleton();
    vi.clearAllMocks();
    electronMocks.cookiesGet.mockResolvedValue([]);
    dbAvailable = true;
    mockDb.prepare.mockReturnValue(stmt());
    mockDb.transaction = vi.fn((fn: Function) => fn);
    service = AccountService.getInstance();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const a = AccountService.getInstance();
      const b = AccountService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('initializes successfully when database is available', async () => {
      await service.initialize();
      expect(mockDb.exec).toHaveBeenCalled();
    });

    it('skips schema when database is unavailable', async () => {
      dbAvailable = false;
      await service.initialize();
      expect(mockDb.exec).not.toHaveBeenCalled();
    });

    it('is idempotent', async () => {
      await service.initialize();
      const callCount = mockDb.exec.mock.calls.length;
      await service.initialize();
      expect(mockDb.exec.mock.calls.length).toBe(callCount);
    });
  });

  describe('dispose', () => {
    it('clears initialized state', async () => {
      await service.initialize();
      service.dispose();
      await service.initialize();
      expect(mockDb.exec).toHaveBeenCalled();
    });
  });

  describe('bindAccount', () => {
    it('binds account successfully', async () => {
      await service.initialize();
      const row = createAccountRow();
      mockDb.prepare
        .mockReturnValueOnce(stmt()) // INSERT
        .mockReturnValueOnce(stmt(row)); // getAccount SELECT

      const account = await service.bindAccount('douyin', 'grp-1');
      expect(account).not.toBeNull();
      expect(account.id).toBe('acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.ACCOUNT_BOUND,
        expect.objectContaining({ platform: 'douyin', groupId: 'grp-1' }),
      );
    });

    it('throws when adapter login fails', async () => {
      await service.initialize();
      mockAdapter.login.mockResolvedValueOnce({ success: false, message: '扫码超时' });

      await expect(service.bindAccount('douyin')).rejects.toThrow('登录失败');
    });

    it('throws for unsupported platform', async () => {
      await service.initialize();
      await expect(service.bindAccount('unknown-platform')).rejects.toThrow('不支持的平台');
    });
  });

  describe('getQRCode', () => {
    it('returns QR code path for valid platform', async () => {
      mockAdapter.getQRCode.mockResolvedValueOnce('/tmp/qr-test.png');
      const qrPath = await service.getQRCode('douyin');
      expect(qrPath).toBe('/tmp/qr-test.png');
    });

    it('throws for unsupported platform', async () => {
      await expect(service.getQRCode('unknown')).rejects.toThrow('不支持的平台');
    });
  });

  describe('checkLoginStatus', () => {
    it('returns error for unknown session', async () => {
      const result = await service.checkLoginStatus('nonexistent');
      expect(result.status).toBe('error');
    });
  });

  describe('validateCookie', () => {
    it('returns false when account does not exist', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined)); // getAccount returns null
      const result = await service.validateCookie('nonexistent');
      expect(result).toBe(false);
    });

    it('returns true when cookie is valid', async () => {
      const row = createAccountRow();
      mockDb.prepare
        .mockReturnValueOnce(stmt(row))   // getAccount SELECT
        .mockReturnValueOnce(stmt());     // UPDATE

      const result = await service.validateCookie('acc-001');
      expect(result).toBe(true);
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.COOKIE_VALIDATED,
        expect.objectContaining({ accountId: 'acc-001', valid: true }),
      );
    });

    it('normalizes legacy video account platform and validates saved cookie path', async () => {
      const row = {
        ...createAccountRow({ platform: 'weixin_video' }),
        cookie_path: '/tmp/channels-cookie.json',
      };
      const updateStmt = stmt();
      mockDb.prepare
        .mockReturnValueOnce(stmt(row))
        .mockReturnValueOnce(updateStmt);
      electronMocks.cookiesGet.mockResolvedValueOnce([
        { name: 'sessionid', value: 'session-value' },
        { name: 'wxuin', value: 'uin-value' },
      ]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          errCode: 0,
          data: { finderUser: { uniqId: 'finder-001' } },
        }),
      }));

      const result = await service.validateCookie('acc-001');

      expect(result).toBe(true);
      expect(mockAdapter.checkCookie).toHaveBeenCalledWith('acc-001', '/tmp/channels-cookie.json');
      expect(updateStmt.run).toHaveBeenCalledWith(
        'channels',
        1,
        expect.any(String),
        'active',
        expect.any(String),
        'acc-001'
      );
    });

    it('returns false when cookie check throws', async () => {
      const row = createAccountRow();
      mockDb.prepare.mockReturnValueOnce(stmt(row));
      mockAdapter.checkCookie.mockRejectedValueOnce(new Error('network'));
      mockDb.prepare.mockReturnValueOnce(stmt());

      const result = await service.validateCookie('acc-001');
      expect(result).toBe(false);
    });

    it('emits STATUS_CHANGED when cookie becomes expired', async () => {
      const row = createAccountRow({ status: 'active' });
      mockDb.prepare
        .mockReturnValueOnce(stmt(row))   // getAccount
        .mockReturnValueOnce(stmt());     // UPDATE
      mockAdapter.checkCookie.mockResolvedValueOnce(false);

      await service.validateCookie('acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.STATUS_CHANGED,
        expect.objectContaining({ oldStatus: 'active', newStatus: 'expired' }),
      );
    });
  });

  describe('refreshCookie', () => {
    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined));
      await expect(service.refreshCookie('nonexistent')).rejects.toThrow('账号不存在');
    });

    it('returns false when login fails', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(createAccountRow({ status: 'expired' })));
      mockAdapter.login.mockResolvedValueOnce({ success: false, message: 'timeout' });

      const result = await service.refreshCookie('acc-001');
      expect(result).toBe(false);
    });

    it('refreshes cookie and returns true', async () => {
      mockDb.prepare
        .mockReturnValueOnce(stmt(createAccountRow({ status: 'expired' }))) // getAccount
        .mockReturnValueOnce(stmt()); // UPDATE
      mockAdapter.login.mockResolvedValueOnce({ success: true, message: 'ok', cookiePath: '/tmp/new.json' });

      const result = await service.refreshCookie('acc-001');
      expect(result).toBe(true);
      expect(mockAdapter.login).toHaveBeenCalledWith(
        'acc-001',
        false,
        expect.objectContaining({ force: true })
      );
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.COOKIE_REFRESHED,
        expect.objectContaining({ accountId: 'acc-001' }),
      );
    });
  });

  describe('getAccount', () => {
    it('returns null when account not found', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined));
      const result = await service.getAccount('nonexistent');
      expect(result).toBeNull();
    });

    it('returns mapped Account when found', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(createAccountRow()));
      const result = await service.getAccount('acc-001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('acc-001');
      expect(result!.platform).toBe('douyin');
      expect(result!.status).toBe('active');
    });

    it('normalizes legacy platform ids when mapping an account', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(createAccountRow({ platform: 'weixin_video' })));

      const result = await service.getAccount('acc-001');

      expect(result?.platform).toBe('channels');
    });
  });

  describe('getAccountsByPlatform', () => {
    it('returns mapped accounts for given platform', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined, [createAccountRow(), createAccountRow({ id: 'acc-002' })]));
      const result = await service.getAccountsByPlatform('douyin');
      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe('douyin');
    });

    it('returns empty array when none found', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined, []));
      const result = await service.getAccountsByPlatform('douyin');
      expect(result).toHaveLength(0);
    });
  });

  describe('getAccountsByGroup', () => {
    it('returns accounts for given group', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined, [createAccountRow({ group_id: 'grp-1' })]));
      const result = await service.getAccountsByGroup('grp-1');
      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe('grp-1');
    });
  });

  describe('getAllAccounts', () => {
    it('returns all accounts', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined, [createAccountRow()]));
      const result = await service.getAllAccounts();
      expect(result).toHaveLength(1);
    });
  });

  describe('setGroup', () => {
    it('sets group and emits GROUP_CHANGED', async () => {
      mockDb.prepare
        .mockReturnValueOnce(stmt(createAccountRow({ group_id: null }))) // getAccount
        .mockReturnValueOnce(stmt()); // UPDATE

      await service.setGroup('acc-001', 'grp-1');

      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.GROUP_CHANGED,
        expect.objectContaining({ accountId: 'acc-001', newGroupId: 'grp-1' }),
      );
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined));
      await expect(service.setGroup('nonexistent', 'grp-1')).rejects.toThrow('账号不存在');
    });
  });

  describe('setFingerprint', () => {
    it('sets fingerprint and updates database', async () => {
      const selectStmt = stmt(createAccountRow());
      const updateStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(updateStmt);

      await service.setFingerprint('acc-001', 'fp-001');
      expect(updateStmt.run).toHaveBeenCalledWith('fp-001', expect.any(String), 'acc-001');
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      await expect(service.setFingerprint('nonexistent', 'fp-001')).rejects.toThrow('账号不存在');
    });

    it('sets fingerprint to null', async () => {
      const selectStmt = stmt(createAccountRow());
      const updateStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(updateStmt);

      await service.setFingerprint('acc-001', null);
      expect(updateStmt.run).toHaveBeenCalledWith(null, expect.any(String), 'acc-001');
    });
  });

  describe('setProxy', () => {
    it('sets proxy and updates database', async () => {
      const selectStmt = stmt(createAccountRow());
      const updateStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(updateStmt);

      await service.setProxy('acc-001', 'proxy-001');
      expect(updateStmt.run).toHaveBeenCalledWith('proxy-001', expect.any(String), 'acc-001');
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      await expect(service.setProxy('nonexistent', 'proxy-001')).rejects.toThrow('账号不存在');
    });
  });

  describe('removeFromGroup', () => {
    it('removes account from group and emits GROUP_CHANGED', async () => {
      const selectStmt = stmt(createAccountRow({ group_id: 'grp-1' }));
      const updateStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(updateStmt);

      await service.removeFromGroup('acc-001');

      expect(updateStmt.run).toHaveBeenCalledWith(expect.any(String), 'acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.GROUP_CHANGED,
        expect.objectContaining({ accountId: 'acc-001', oldGroupId: 'grp-1', newGroupId: undefined }),
      );
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      await expect(service.removeFromGroup('nonexistent')).rejects.toThrow('账号不存在');
    });
  });

  describe('batchValidateCookies', () => {
    it('validates multiple cookies', async () => {
      mockDb.prepare
        .mockReturnValueOnce(stmt(createAccountRow({ id: 'acc-1' }))) // getAccount for acc-1
        .mockReturnValueOnce(stmt()) // UPDATE for acc-1
        .mockReturnValueOnce(stmt(createAccountRow({ id: 'acc-2' }))) // getAccount for acc-2
        .mockReturnValueOnce(stmt()); // UPDATE for acc-2

      mockAdapter.checkCookie
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const results = await service.batchValidateCookies(['acc-1', 'acc-2']);
      expect(results.get('acc-1')).toBe(true);
      expect(results.get('acc-2')).toBe(false);
    });

    it('returns empty map for empty array', async () => {
      const results = await service.batchValidateCookies([]);
      expect(results.size).toBe(0);
    });
  });

  describe('batchSetGroup', () => {
    it('sets group for multiple accounts in transaction', async () => {
      const updateStmt = stmt();
      mockDb.prepare.mockReset().mockReturnValue(updateStmt);
      mockDb.transaction = vi.fn((fn: Function) => fn);

      await service.batchSetGroup(['acc-1', 'acc-2'], 'grp-1');

      expect(updateStmt.run).toHaveBeenCalledTimes(2);
      expect(eventBusEmit).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateStatus', () => {
    it('updates status and emits event', async () => {
      const selectStmt = stmt(createAccountRow({ status: 'active' }));
      const updateStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(updateStmt);

      await service.updateStatus('acc-001', 'inactive');

      expect(updateStmt.run).toHaveBeenCalledWith('inactive', 0, expect.any(String), 'acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.STATUS_CHANGED,
        expect.objectContaining({ oldStatus: 'active', newStatus: 'inactive' }),
      );
    });

    it('does nothing when status unchanged', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(createAccountRow({ status: 'active' })));

      await service.updateStatus('acc-001', 'active');
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      await expect(service.updateStatus('nonexistent', 'inactive')).rejects.toThrow('账号不存在');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account and emits event', async () => {
      const selectStmt = stmt(createAccountRow());
      const deleteStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(deleteStmt);

      await service.deleteAccount('acc-001');

      expect(deleteStmt.run).toHaveBeenCalledWith('acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.ACCOUNT_DELETED,
        expect.objectContaining({ accountId: 'acc-001' }),
      );
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      await expect(service.deleteAccount('nonexistent')).rejects.toThrow('账号不存在');
    });
  });

  describe('updateStatus', () => {
    it('updates status and emits event', async () => {
      const selectStmt = stmt(createAccountRow({ status: 'active' }));
      const updateStmt = stmt();
      mockDb.prepare
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(updateStmt);

      await service.updateStatus('acc-001', 'inactive');

      expect(updateStmt.run).toHaveBeenCalledWith('inactive', 0, expect.any(String), 'acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.STATUS_CHANGED,
        expect.objectContaining({ oldStatus: 'active', newStatus: 'inactive' }),
      );
    });

    it('does nothing when status unchanged', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(createAccountRow({ status: 'active' })));

      await service.updateStatus('acc-001', 'active');
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined));
      await expect(service.updateStatus('nonexistent', 'inactive')).rejects.toThrow('账号不存在');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account and emits event', async () => {
      const selectStmt = stmt(createAccountRow());
      const deleteStmt = stmt();
      mockDb.prepare
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(deleteStmt);

      await service.deleteAccount('acc-001');

      expect(deleteStmt.run).toHaveBeenCalledWith('acc-001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        AccountEvent.ACCOUNT_DELETED,
        expect.objectContaining({ accountId: 'acc-001' }),
      );
    });

    it('throws when account does not exist', async () => {
      mockDb.prepare.mockReturnValueOnce(stmt(undefined));
      await expect(service.deleteAccount('nonexistent')).rejects.toThrow('账号不存在');
    });
  });

  describe('database unavailability', () => {
    it('getAccount throws when database unavailable', async () => {
      dbAvailable = false;
      await expect(service.getAccount('any')).rejects.toThrow('数据库不可用');
    });

    it('getAllAccounts throws when database unavailable', async () => {
      dbAvailable = false;
      await expect(service.getAllAccounts()).rejects.toThrow('数据库不可用');
    });
  });

  describe('rowToAccount mapping', () => {
    it('maps null fields to undefined', async () => {
      const row = createAccountRow({
        avatar: null,
        group_id: null,
        fingerprint_id: null,
        proxy_id: null,
        last_cookie_check: null,
      });
      const s = stmt(row);
      mockDb.prepare.mockReset().mockReturnValue(s);

      const account = await service.getAccount('acc-001');
      expect(account).not.toBeNull();
      expect(account!.groupId).toBeUndefined();
      expect(account!.fingerprintId).toBeUndefined();
      expect(account!.proxyId).toBeUndefined();
      expect(account!.lastCookieCheck).toBeUndefined();
    });

    it('maps non-null fields correctly', async () => {
      const row = createAccountRow({
        group_id: 'grp-1',
        fingerprint_id: 'fp-1',
        proxy_id: 'proxy-1',
        last_cookie_check: '2026-05-01T00:00:00.000Z',
      });
      const s = stmt(row);
      mockDb.prepare.mockReset().mockReturnValue(s);

      const account = await service.getAccount('acc-001');
      expect(account!.groupId).toBe('grp-1');
      expect(account!.fingerprintId).toBe('fp-1');
      expect(account!.proxyId).toBe('proxy-1');
      expect(account!.lastCookieCheck).toBeInstanceOf(Date);
    });

    it('maps cookie_valid correctly', async () => {
      const row = createAccountRow({ cookie_valid: 0 });
      const s = stmt(row);
      mockDb.prepare.mockReset().mockReturnValue(s);
      const account = await service.getAccount('acc-001');
      expect(account!.cookieValid).toBe(false);
    });
  });
});
