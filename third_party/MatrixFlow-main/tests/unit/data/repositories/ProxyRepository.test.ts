import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { ProxyRepository } from '@electron/data/repositories/ProxyRepository';
import type { Proxy } from '@electron/data/types';

describe('ProxyRepository', () => {
  let repo: ProxyRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockProxy: Proxy = {
    id: 'proxy-1',
    name: 'Test Proxy',
    protocol: 'http',
    host: '127.0.0.1',
    port: 8080,
    username: null,
    password: null,
    status: 'active',
    last_check_at: null,
    last_check_result: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new ProxyRepository();
  });

  describe('constructor', () => {
    it('uses "proxies" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('proxies');
    });
  });

  describe('findActive', () => {
    it('returns active proxies', async () => {
      stmt.all.mockReturnValue([mockProxy]);

      const result = await repo.findActive();

      expect(result).toEqual([mockProxy]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = @status')
      );
    });

    it('returns empty array when no active proxies', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findActive();

      expect(result).toEqual([]);
    });
  });

  describe('findByProtocol', () => {
    it('returns proxies for given protocol', async () => {
      stmt.all.mockReturnValue([mockProxy]);

      const result = await repo.findByProtocol('http');

      expect(result).toEqual([mockProxy]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE protocol = @protocol')
      );
    });

    it('returns empty array for unknown protocol', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByProtocol('socks5');

      expect(result).toEqual([]);
    });
  });

  describe('updateCheckResult', () => {
    it('updates last_check_at and last_check_result', async () => {
      const updated = { ...mockProxy, last_check_result: 'ok' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.updateCheckResult('proxy-1', 'ok');

      expect(result.last_check_result).toBe('ok');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({
          last_check_result: 'ok',
          id: 'proxy-1',
        })
      );
    });
  });

  describe('deactivate', () => {
    it('sets status to inactive', async () => {
      const updated = { ...mockProxy, status: 'inactive' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.deactivate('proxy-1');

      expect(result.status).toBe('inactive');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'inactive', id: 'proxy-1' })
      );
    });
  });

  describe('findById', () => {
    it('returns proxy when found', async () => {
      stmt.get.mockReturnValue(mockProxy);

      const result = await repo.findById('proxy-1');

      expect(result).toEqual(mockProxy);
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('insert', () => {
    it('inserts new proxy', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockProxy) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'proxy-1',
        name: 'Test Proxy',
        protocol: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: null,
        password: null,
        status: 'active',
        last_check_at: null,
        last_check_result: null,
      });

      expect(result).toEqual(mockProxy);
    });
  });

  describe('update', () => {
    it('updates proxy fields', async () => {
      const updated = { ...mockProxy, host: '192.168.1.1' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.update('proxy-1', { host: '192.168.1.1' });

      expect(result.host).toBe('192.168.1.1');
    });
  });

  describe('deleteById', () => {
    it('deletes proxy by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('proxy-1');

      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      stmt.get.mockReturnValue({ total: 3 });

      const result = await repo.count();

      expect(result).toBe(3);
    });
  });
});
