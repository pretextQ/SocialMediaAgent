import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';
import type { Account } from '@/renderer/stores/account';
import { useAccountStore } from '@/renderer/stores/account';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1',
    platform: 'douyin',
    nickname: '测试账号',
    status: 'online',
    cookieValid: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useAccountStore', () => {
  let mock: MatrixflowMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    mock = installMatrixflowMock();
  });

  afterEach(() => {
    removeMatrixflowMock();
  });

  describe('state', () => {
    it('initializes with empty accounts and loading=false', () => {
      const store = useAccountStore();
      expect(store.accounts).toEqual([]);
      expect(store.loading).toBe(false);
    });
  });

  describe('computed', () => {
    describe('onlineCount', () => {
      it('returns 0 when no accounts', () => {
        const store = useAccountStore();
        expect(store.onlineCount).toBe(0);
      });

      it('counts only online accounts', () => {
        const store = useAccountStore();
        store.accounts = [
          makeAccount({ id: '1', status: 'online' }),
          makeAccount({ id: '2', status: 'offline' }),
          makeAccount({ id: '3', status: 'online' }),
          makeAccount({ id: '4', status: 'expired' }),
        ];
        expect(store.onlineCount).toBe(2);
      });

      it('returns 0 when all accounts are offline', () => {
        const store = useAccountStore();
        store.accounts = [
          makeAccount({ id: '1', status: 'offline' }),
          makeAccount({ id: '2', status: 'expired' }),
        ];
        expect(store.onlineCount).toBe(0);
      });
    });

    describe('totalCount', () => {
      it('returns 0 when no accounts', () => {
        const store = useAccountStore();
        expect(store.totalCount).toBe(0);
      });

      it('returns total number of accounts', () => {
        const store = useAccountStore();
        store.accounts = [
          makeAccount({ id: '1' }),
          makeAccount({ id: '2' }),
          makeAccount({ id: '3' }),
        ];
        expect(store.totalCount).toBe(3);
      });
    });
  });

  describe('actions', () => {
    describe('fetchAccounts', () => {
      it('calls accounts.list and populates state', async () => {
        const accounts = [
          makeAccount({ id: '1', nickname: 'A' }),
          makeAccount({ id: '2', nickname: 'B' }),
        ];
        mock.accounts.list.mockResolvedValue(accounts);

        const store = useAccountStore();
        await store.fetchAccounts();

        expect(mock.accounts.list).toHaveBeenCalledOnce();
        expect(store.accounts).toEqual(accounts);
      });

      it('sets loading=true during fetch and loading=false after', async () => {
        let loadingDuringCall = false;
        mock.accounts.list.mockImplementation(async () => {
          const store = useAccountStore();
          loadingDuringCall = store.loading;
          return [];
        });

        const store = useAccountStore();
        await store.fetchAccounts();

        expect(loadingDuringCall).toBe(true);
        expect(store.loading).toBe(false);
      });

      it('resets loading to false even on error', async () => {
        mock.accounts.list.mockRejectedValue(new Error('IPC fail'));

        const store = useAccountStore();
        await expect(store.fetchAccounts()).rejects.toThrow('IPC fail');

        expect(store.loading).toBe(false);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        await store.fetchAccounts();

        expect(store.accounts).toEqual([]);
      });
    });

    describe('createAccount', () => {
      it('calls accounts.create and appends to state', async () => {
        const newAccount = makeAccount({ id: 'new_1', nickname: '新账号' });
        mock.accounts.create.mockResolvedValue(newAccount);

        const store = useAccountStore();
        const result = await store.createAccount({ platform: 'douyin', nickname: '新账号' });

        expect(mock.accounts.create).toHaveBeenCalledWith({ platform: 'douyin', nickname: '新账号' });
        expect(store.accounts).toHaveLength(1);
        expect(store.accounts[0]).toEqual(newAccount);
        expect(result).toEqual(newAccount);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        const result = await store.createAccount({ platform: 'douyin' });

        expect(result).toBeUndefined();
        expect(store.accounts).toEqual([]);
      });
    });

    describe('deleteAccount', () => {
      it('calls accounts.delete and removes from state', async () => {
        const store = useAccountStore();
        store.accounts = [
          makeAccount({ id: '1' }),
          makeAccount({ id: '2' }),
        ];
        mock.accounts.delete.mockResolvedValue({ success: true });

        await store.deleteAccount('1');

        expect(mock.accounts.delete).toHaveBeenCalledWith('1');
        expect(store.accounts).toHaveLength(1);
        expect(store.accounts[0].id).toBe('2');
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: '1' })];
        await store.deleteAccount('1');

        expect(store.accounts).toHaveLength(1);
      });
    });

    describe('loginAccount', () => {
      it('calls accounts.login and returns result', async () => {
        const loginResult = { success: true, data: { url: 'https://login.douyin.com' } };
        mock.accounts.login.mockResolvedValue(loginResult);

        const store = useAccountStore();
        const result = await store.loginAccount('acc_1');

        expect(mock.accounts.login).toHaveBeenCalledWith('acc_1');
        expect(result).toEqual(loginResult);
      });

      it('throws when relogin fails', async () => {
        mock.accounts.login.mockResolvedValue({ success: false, message: '重新登录失败' });

        const store = useAccountStore();

        await expect(store.loginAccount('acc_1')).rejects.toThrow('重新登录失败');
      });

      it('returns undefined when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        const result = await store.loginAccount('acc_1');

        expect(result).toBeUndefined();
      });
    });

    describe('checkCookie', () => {
      it('calls accounts.checkCookie and returns result', async () => {
        mock.accounts.checkCookie.mockResolvedValue({ success: true, valid: true });

        const store = useAccountStore();
        const result = await store.checkCookie('acc_1');

        expect(mock.accounts.checkCookie).toHaveBeenCalledWith('acc_1');
        expect(result).toEqual({ success: true, valid: true });
      });

      it('returns false when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        const result = await store.checkCookie('acc_1');

        expect(result).toBe(false);
      });
    });

    describe('setFingerprint', () => {
      it('calls account.setFingerprint and updates local state', async () => {
        mock.account.setFingerprint.mockResolvedValue({ success: true });

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: 'acc_1', fingerprintId: undefined })];

        await store.setFingerprint('acc_1', 'fp_123');

        expect(mock.account.setFingerprint).toHaveBeenCalledWith('acc_1', 'fp_123');
        expect(store.accounts[0].fingerprintId).toBe('fp_123');
      });

      it('sets fingerprintId to undefined when null is passed', async () => {
        mock.account.setFingerprint.mockResolvedValue({ success: true });

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: 'acc_1', fingerprintId: 'fp_old' })];

        await store.setFingerprint('acc_1', null);

        expect(store.accounts[0].fingerprintId).toBeUndefined();
      });

      it('does not throw if account not found in local state', async () => {
        mock.account.setFingerprint.mockResolvedValue({ success: true });

        const store = useAccountStore();
        await expect(store.setFingerprint('nonexistent', 'fp_123')).resolves.toBeUndefined();
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: 'acc_1', fingerprintId: 'fp_old' })];
        await store.setFingerprint('acc_1', 'fp_new');

        expect(store.accounts[0].fingerprintId).toBe('fp_old');
      });
    });

    describe('setProxy', () => {
      it('calls account.setProxy and updates local state', async () => {
        mock.account.setProxy.mockResolvedValue({ success: true });

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: 'acc_1', proxyId: undefined })];

        await store.setProxy('acc_1', 'proxy_456');

        expect(mock.account.setProxy).toHaveBeenCalledWith('acc_1', 'proxy_456');
        expect(store.accounts[0].proxyId).toBe('proxy_456');
      });

      it('sets proxyId to undefined when null is passed', async () => {
        mock.account.setProxy.mockResolvedValue({ success: true });

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: 'acc_1', proxyId: 'proxy_old' })];

        await store.setProxy('acc_1', null);

        expect(store.accounts[0].proxyId).toBeUndefined();
      });

      it('does not throw if account not found in local state', async () => {
        mock.account.setProxy.mockResolvedValue({ success: true });

        const store = useAccountStore();
        await expect(store.setProxy('nonexistent', 'proxy_123')).resolves.toBeUndefined();
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useAccountStore();
        store.accounts = [makeAccount({ id: 'acc_1', proxyId: 'proxy_old' })];
        await store.setProxy('acc_1', 'proxy_new');

        expect(store.accounts[0].proxyId).toBe('proxy_old');
      });
    });
  });
});
