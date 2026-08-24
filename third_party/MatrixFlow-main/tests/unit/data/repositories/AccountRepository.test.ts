import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { AccountRepository } from '@electron/data/repositories/AccountRepository';
import type { Account } from '@electron/data/types';

describe('AccountRepository', () => {
  let repo: AccountRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockAccount: Account = {
    id: 'acc-1',
    platform: 'douyin',
    nickname: 'Test User',
    avatar_url: null,
    cookie_path: '/tmp/cookies/acc-1.json',
    cookie_valid: 1,
    last_login: '2025-01-01T00:00:00.000Z',
    last_publish: null,
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new AccountRepository();
  });

  describe('constructor', () => {
    it('uses "accounts" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('accounts');
    });
  });

  describe('findById', () => {
    it('returns account when found', async () => {
      stmt.get.mockReturnValue(mockAccount);

      const result = await repo.findById('acc-1');

      expect(result).toEqual(mockAccount);
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findByPlatform', () => {
    it('returns accounts for given platform', async () => {
      const accounts: Account[] = [mockAccount];
      stmt.all.mockReturnValue(accounts);

      const result = await repo.findByPlatform('douyin');

      expect(result).toEqual(accounts);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform')
      );
    });

    it('returns empty array when no accounts found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByPlatform('kuaishou');

      expect(result).toEqual([]);
    });
  });

  describe('findActive', () => {
    it('returns active accounts', async () => {
      const accounts: Account[] = [mockAccount];
      stmt.all.mockReturnValue(accounts);

      const result = await repo.findActive();

      expect(result).toEqual(accounts);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = @status")
      );
    });
  });

  describe('updateLoginTime', () => {
    it('updates last_login timestamp', async () => {
      const updated = { ...mockAccount, last_login: '2025-06-01T00:00:00.000Z' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.updateLoginTime('acc-1');

      expect(result).toEqual(updated);
      expect(runStmt.run).toHaveBeenCalled();
    });
  });

  describe('updatePublishTime', () => {
    it('updates last_publish timestamp', async () => {
      const updated = { ...mockAccount, last_publish: '2025-06-01T00:00:00.000Z' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.updatePublishTime('acc-1');

      expect(result).toEqual(updated);
    });
  });

  describe('setCookieValid', () => {
    it('sets cookie_valid to 1 when valid is true', async () => {
      const updated = { ...mockAccount, cookie_valid: 1 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.setCookieValid('acc-1', true);

      expect(result.cookie_valid).toBe(1);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ cookie_valid: 1, id: 'acc-1' })
      );
    });

    it('sets cookie_valid to 0 when valid is false', async () => {
      const updated = { ...mockAccount, cookie_valid: 0 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.setCookieValid('acc-1', false);

      expect(result.cookie_valid).toBe(0);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ cookie_valid: 0, id: 'acc-1' })
      );
    });
  });

  describe('deactivate', () => {
    it('sets status to inactive', async () => {
      const deactivated = { ...mockAccount, status: 'inactive' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(deactivated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.deactivate('acc-1');

      expect(result.status).toBe('inactive');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'inactive', id: 'acc-1' })
      );
    });
  });

  describe('insert', () => {
    it('inserts new account', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockAccount) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'acc-1',
        platform: 'douyin',
        nickname: 'Test User',
        avatar_url: null,
        cookie_path: '/tmp/cookies/acc-1.json',
        cookie_valid: 1,
        last_login: null,
        last_publish: null,
        status: 'active',
      });

      expect(result).toEqual(mockAccount);
    });
  });

  describe('deleteById', () => {
    it('deletes account by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('acc-1');

      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      stmt.get.mockReturnValue({ total: 5 });

      const result = await repo.count();

      expect(result).toBe(5);
    });
  });
});
