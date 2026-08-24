import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { TaskItemRepository } from '@electron/data/repositories/TaskItemRepository';
import type { TaskItem } from '@electron/data/types';

describe('TaskItemRepository', () => {
  let repo: TaskItemRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockItem: TaskItem = {
    id: 'ti-1',
    task_id: 'task-1',
    account_id: 'acc-1',
    platform: 'douyin',
    status: 'pending',
    platform_video_id: null,
    publish_url: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new TaskItemRepository();
  });

  describe('constructor', () => {
    it('uses "task_items" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('task_items');
    });
  });

  describe('findByTaskId', () => {
    it('returns items for given task', async () => {
      stmt.all.mockReturnValue([mockItem]);

      const result = await repo.findByTaskId('task-1');

      expect(result).toEqual([mockItem]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE task_id = @task_id')
      );
    });
  });

  describe('findByAccountId', () => {
    it('returns items for given account', async () => {
      stmt.all.mockReturnValue([mockItem]);

      const result = await repo.findByAccountId('acc-1');

      expect(result).toEqual([mockItem]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE account_id = @account_id')
      );
    });
  });

  describe('findByStatus', () => {
    it('returns items with given status', async () => {
      stmt.all.mockReturnValue([mockItem]);

      const result = await repo.findByStatus('pending');

      expect(result).toEqual([mockItem]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = @status')
      );
    });
  });

  describe('createBatch', () => {
    it('inserts multiple items in a transaction', async () => {
      const items = [
        { ...mockItem, id: 'ti-1' },
        { ...mockItem, id: 'ti-2' },
      ];
      const insertStmt = { run: vi.fn() };
      const getStmt1 = { get: vi.fn().mockReturnValue(items[0]) };
      const getStmt2 = { get: vi.fn().mockReturnValue(items[1]) };
      mockDb.prepare
        .mockReturnValueOnce(insertStmt)
        .mockReturnValueOnce(getStmt1)
        .mockReturnValueOnce(getStmt2);

      const result = await repo.createBatch(items as Omit<TaskItem, 'created_at' | 'updated_at'>[]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(items[0]);
      expect(result[1]).toEqual(items[1]);
      expect(insertStmt.run).toHaveBeenCalledTimes(2);
    });

    it('returns empty array for empty input', async () => {
      const result = await repo.createBatch([]);

      expect(result).toEqual([]);
    });
  });

  describe('markStarted', () => {
    it('updates status to running with started_at', async () => {
      const updated = { ...mockItem, status: 'running' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markStarted('ti-1');

      expect(result.status).toBe('running');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', id: 'ti-1' })
      );
    });
  });

  describe('markCompleted', () => {
    it('updates status to completed with video id and url', async () => {
      const updated = { ...mockItem, status: 'completed', platform_video_id: 'vid-123', publish_url: 'https://example.com/vid-123' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markCompleted('ti-1', 'vid-123', 'https://example.com/vid-123');

      expect(result.status).toBe('completed');
      expect(result.platform_video_id).toBe('vid-123');
      expect(result.publish_url).toBe('https://example.com/vid-123');
    });
  });

  describe('markFailed', () => {
    it('updates status to failed with error message', async () => {
      const updated = { ...mockItem, status: 'failed', error_message: 'Timeout' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markFailed('ti-1', 'Timeout');

      expect(result.status).toBe('failed');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error_message: 'Timeout', id: 'ti-1' })
      );
    });
  });

  describe('getPendingCountByTask', () => {
    it('returns count of pending and running items for task', async () => {
      stmt.get.mockReturnValue({ total: 3 });

      const result = await repo.getPendingCountByTask('task-1');

      expect(result).toBe(3);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'running')")
      );
      expect(stmt.get).toHaveBeenCalledWith('task-1');
    });

    it('returns 0 when no pending items', async () => {
      stmt.get.mockReturnValue({ total: 0 });

      const result = await repo.getPendingCountByTask('task-1');

      expect(result).toBe(0);
    });
  });

  describe('findById', () => {
    it('returns item when found', async () => {
      stmt.get.mockReturnValue(mockItem);

      const result = await repo.findById('ti-1');

      expect(result).toEqual(mockItem);
    });
  });

  describe('deleteById', () => {
    it('deletes item by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('ti-1');

      expect(result).toBe(true);
    });
  });
});
