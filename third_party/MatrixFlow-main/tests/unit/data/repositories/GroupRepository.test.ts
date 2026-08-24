import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { GroupRepository } from '@electron/data/repositories/GroupRepository';
import type { Group } from '@electron/data/types';

describe('GroupRepository', () => {
  let repo: GroupRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockGroup: Group = {
    id: 'group-1',
    name: 'Test Group',
    description: 'A test group',
    color: '#FF0000',
    sort_order: 1,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new GroupRepository();
  });

  describe('constructor', () => {
    it('uses "groups" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('groups');
    });
  });

  describe('findOrdered', () => {
    it('returns groups ordered by sort_order and created_at', async () => {
      const groups: Group[] = [
        { ...mockGroup, id: 'g1', sort_order: 1 },
        { ...mockGroup, id: 'g2', sort_order: 2 },
      ];
      stmt.all.mockReturnValue(groups);

      const result = await repo.findOrdered();

      expect(result).toEqual(groups);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM groups ORDER BY sort_order ASC, created_at ASC'
      );
    });

    it('returns empty array when no groups exist', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findOrdered();

      expect(result).toEqual([]);
    });
  });

  describe('reorder', () => {
    it('updates sort_order for a group', async () => {
      const updated = { ...mockGroup, sort_order: 5 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.reorder('group-1', 5);

      expect(result.sort_order).toBe(5);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 5, id: 'group-1' })
      );
    });
  });

  describe('findById', () => {
    it('returns group when found', async () => {
      stmt.get.mockReturnValue(mockGroup);

      const result = await repo.findById('group-1');

      expect(result).toEqual(mockGroup);
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('insert', () => {
    it('inserts new group', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockGroup) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'group-1',
        name: 'Test Group',
        description: 'A test group',
        color: '#FF0000',
        sort_order: 1,
      });

      expect(result).toEqual(mockGroup);
    });
  });

  describe('update', () => {
    it('updates group fields', async () => {
      const updated = { ...mockGroup, name: 'Updated Group' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.update('group-1', { name: 'Updated Group' });

      expect(result.name).toBe('Updated Group');
    });
  });

  describe('deleteById', () => {
    it('deletes group by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('group-1');

      expect(result).toBe(true);
    });
  });
});
