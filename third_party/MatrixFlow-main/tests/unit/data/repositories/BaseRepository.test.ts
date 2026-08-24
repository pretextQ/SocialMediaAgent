import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';
import type { DatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { BaseRepository } from '@electron/data/repositories/BaseRepository';

interface TestEntity {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

describe('BaseRepository', () => {
  let repo: BaseRepository<TestEntity>;
  let stmt: ReturnType<typeof mockDb.prepare>;

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new BaseRepository<TestEntity>('test_table');
  });

  describe('findById', () => {
    it('returns entity when found', async () => {
      const entity: TestEntity = {
        id: 'test-1',
        name: 'Test',
        status: 'active',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };
      stmt.get.mockReturnValue(entity);

      const result = await repo.findById('test-1');

      expect(result).toEqual(entity);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE id = ?'
      );
      expect(stmt.get).toHaveBeenCalledWith('test-1');
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns paginated results with defaults', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'A', status: 'active', created_at: '', updated_at: '' },
      ];
      stmt.all.mockReturnValue(entities);

      const countStmt = { get: vi.fn().mockReturnValue({ total: 1 }) };
      const listStmt = { all: vi.fn().mockReturnValue(entities) };
      mockDb.prepare
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(listStmt);

      const result = await repo.findAll();

      expect(result).toEqual({
        data: entities,
        total: 1,
        page: 1,
        pageSize: 50,
      });
    });

    it('uses custom page and pageSize', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 100 }) };
      const listStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(listStmt);

      const result = await repo.findAll({ page: 3, pageSize: 10 });

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(listStmt.all).toHaveBeenCalledWith(10, 20);
    });

    it('uses custom orderBy and orderDir', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 0 }) };
      const listStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(listStmt);

      await repo.findAll({ orderBy: 'name', orderDir: 'ASC' });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM test_table ORDER BY name ASC LIMIT ? OFFSET ?'
      );
    });
  });

  describe('findWhere', () => {
    it('returns matching entities', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'A', status: 'active', created_at: '', updated_at: '' },
      ];
      stmt.all.mockReturnValue(entities);

      const result = await repo.findWhere({ status: 'active' });

      expect(result).toEqual(entities);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = @status'
      );
    });

    it('returns all entities when no conditions provided', async () => {
      const entities: TestEntity[] = [];
      stmt.all.mockReturnValue(entities);

      const result = await repo.findWhere({});

      expect(result).toEqual([]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM test_table'
      );
    });

    it('filters out undefined condition values', async () => {
      stmt.all.mockReturnValue([]);

      await repo.findWhere({ status: 'active', name: undefined });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = @status'
      );
    });
  });

  describe('findOneWhere', () => {
    it('returns first matching entity', async () => {
      const entity: TestEntity = {
        id: '1', name: 'A', status: 'active', created_at: '', updated_at: '',
      };
      stmt.get.mockReturnValue(entity);

      const result = await repo.findOneWhere({ status: 'active' });

      expect(result).toEqual(entity);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = @status LIMIT 1'
      );
    });

    it('returns undefined when no conditions provided', async () => {
      const result = await repo.findOneWhere({});

      expect(result).toBeUndefined();
    });
  });

  describe('insert', () => {
    it('inserts and returns entity', async () => {
      const inserted: TestEntity = {
        id: 'new-1',
        name: 'New',
        status: 'active',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(inserted) };
      mockDb.prepare
        .mockReturnValueOnce(runStmt)
        .mockReturnValueOnce(getStmt);

      const result = await repo.insert({ id: 'new-1', name: 'New', status: 'active' });

      expect(result).toEqual(inserted);
      expect(runStmt.run).toHaveBeenCalled();
      expect(getStmt.get).toHaveBeenCalledWith('new-1');
    });
  });

  describe('update', () => {
    it('updates and returns entity', async () => {
      const updated: TestEntity = {
        id: '1',
        name: 'Updated',
        status: 'active',
        created_at: '2025-01-01',
        updated_at: '2025-01-02',
      };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare
        .mockReturnValueOnce(runStmt)
        .mockReturnValueOnce(getStmt);

      const result = await repo.update('1', { name: 'Updated' });

      expect(result).toEqual(updated);
      expect(runStmt.run).toHaveBeenCalledWith({ name: 'Updated', id: '1' });
    });
  });

  describe('deleteById', () => {
    it('returns true when row was deleted', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('1');

      expect(result).toBe(true);
    });

    it('returns false when no row was deleted', async () => {
      stmt.run.mockReturnValue({ changes: 0 });

      const result = await repo.deleteById('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteWhere', () => {
    it('returns number of deleted rows', async () => {
      stmt.run.mockReturnValue({ changes: 3 });

      const result = await repo.deleteWhere({ status: 'inactive' });

      expect(result).toBe(3);
    });

    it('returns 0 when no conditions provided', async () => {
      const result = await repo.deleteWhere({});

      expect(result).toBe(0);
    });
  });

  describe('count', () => {
    it('returns total count without conditions', async () => {
      stmt.get.mockReturnValue({ total: 42 });

      const result = await repo.count();

      expect(result).toBe(42);
    });

    it('returns count with conditions', async () => {
      stmt.get.mockReturnValue({ total: 5 });

      const result = await repo.count({ status: 'active' });

      expect(result).toBe(5);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT COUNT(*) as total FROM test_table WHERE status = @status'
      );
    });
  });

  describe('exists', () => {
    it('returns true when entity exists', async () => {
      stmt.get.mockReturnValue({ '1': 1 });

      const result = await repo.exists('1');

      expect(result).toBe(true);
    });

    it('returns false when entity does not exist', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.exists('nonexistent');

      expect(result).toBe(false);
    });
  });
});
