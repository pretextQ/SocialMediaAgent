import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { PublishTaskRepository } from '@electron/data/repositories/PublishTaskRepository';
import type { PublishTask } from '@electron/data/types';

describe('PublishTaskRepository', () => {
  let repo: PublishTaskRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockTask: PublishTask = {
    id: 'pt-1',
    content_id: 'content-1',
    group_id: 'group-1',
    platform: 'douyin',
    account_id: 'acc-1',
    proxy_id: null,
    fingerprint_id: null,
    scheduled_at: null,
    publish_mode: 'client_direct',
    status: 'pending',
    result: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new PublishTaskRepository();
  });

  describe('constructor', () => {
    it('uses "publish_tasks" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('publish_tasks');
    });
  });

  describe('findByStatus', () => {
    it('returns paginated tasks filtered by status', async () => {
      const tasks: PublishTask[] = [mockTask];
      const countStmt = { get: vi.fn().mockReturnValue({ total: 1 }) };
      const listStmt = { all: vi.fn().mockReturnValue(tasks) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.findByStatus('pending');

      expect(result).toEqual({
        data: tasks,
        total: 1,
        page: 1,
        pageSize: 50,
      });
    });

    it('respects pagination options', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 10 }) };
      const listStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.findByStatus('pending', { page: 2, pageSize: 5 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
    });
  });

  describe('findByContentId', () => {
    it('returns tasks for given content', async () => {
      const tasks: PublishTask[] = [mockTask];
      stmt.all.mockReturnValue(tasks);

      const result = await repo.findByContentId('content-1');

      expect(result).toEqual(tasks);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE content_id = @content_id')
      );
    });
  });

  describe('findByGroupId', () => {
    it('returns tasks for given group', async () => {
      stmt.all.mockReturnValue([mockTask]);

      const result = await repo.findByGroupId('group-1');

      expect(result).toEqual([mockTask]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE group_id = @group_id')
      );
    });
  });

  describe('findPendingScheduled', () => {
    it('returns pending scheduled tasks before given time', async () => {
      const tasks: PublishTask[] = [mockTask];
      stmt.all.mockReturnValue(tasks);

      const result = await repo.findPendingScheduled('2025-06-01T00:00:00.000Z');

      expect(result).toEqual(tasks);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending' AND publish_mode = 'scheduled' AND scheduled_at <= ?")
      );
      expect(stmt.all).toHaveBeenCalledWith('2025-06-01T00:00:00.000Z');
    });
  });

  describe('markRunning', () => {
    it('updates status to running', async () => {
      const updated = { ...mockTask, status: 'running' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markRunning('pt-1');

      expect(result.status).toBe('running');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', id: 'pt-1' })
      );
    });
  });

  describe('markCompleted', () => {
    it('updates status to completed with result', async () => {
      const updated = { ...mockTask, status: 'completed', result: 'success' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markCompleted('pt-1', 'success');

      expect(result.status).toBe('completed');
      expect(result.result).toBe('success');
    });
  });

  describe('markFailed', () => {
    it('sets status to pending when retries remain', async () => {
      const taskData = { retry_count: 1, max_retries: 3 };
      const updated = { ...mockTask, status: 'pending', retry_count: 2 };
      const getRetryStmt = { get: vi.fn().mockReturnValue(taskData) };
      const updateStmt = { run: vi.fn() };
      const getResultStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare
        .mockReturnValueOnce(getRetryStmt)
        .mockReturnValueOnce(updateStmt)
        .mockReturnValueOnce(getResultStmt);

      const result = await repo.markFailed('pt-1', 'Network error');

      expect(result.status).toBe('pending');
      expect(updateStmt.run).toHaveBeenCalledWith('pending', 'Network error', 2, 'pt-1');
    });

    it('sets status to failed when max retries reached', async () => {
      const taskData = { retry_count: 2, max_retries: 3 };
      const updated = { ...mockTask, status: 'failed', retry_count: 3 };
      const getRetryStmt = { get: vi.fn().mockReturnValue(taskData) };
      const updateStmt = { run: vi.fn() };
      const getResultStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare
        .mockReturnValueOnce(getRetryStmt)
        .mockReturnValueOnce(updateStmt)
        .mockReturnValueOnce(getResultStmt);

      const result = await repo.markFailed('pt-1', 'Timeout');

      expect(result.status).toBe('failed');
      expect(updateStmt.run).toHaveBeenCalledWith('failed', 'Timeout', 3, 'pt-1');
    });

    it('throws when task not found', async () => {
      const getRetryStmt = { get: vi.fn().mockReturnValue(undefined) };
      mockDb.prepare.mockReturnValueOnce(getRetryStmt);

      await expect(repo.markFailed('nonexistent', 'error')).rejects.toThrow(
        'PublishTask nonexistent not found'
      );
    });
  });

  describe('markFinalFailed', () => {
    it('sets status to failed even when retries remain', async () => {
      const taskData = { retry_count: 1 };
      const updated = { ...mockTask, status: 'failed', retry_count: 2 };
      const getRetryStmt = { get: vi.fn().mockReturnValue(taskData) };
      const updateStmt = { run: vi.fn() };
      const getResultStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare
        .mockReturnValueOnce(getRetryStmt)
        .mockReturnValueOnce(updateStmt)
        .mockReturnValueOnce(getResultStmt);

      const result = await repo.markFinalFailed('pt-1', 'Publish failed');

      expect(result.status).toBe('failed');
      expect(updateStmt.run).toHaveBeenCalledWith('Publish failed', 2, 'pt-1');
    });

    it('throws when task not found', async () => {
      const getRetryStmt = { get: vi.fn().mockReturnValue(undefined) };
      mockDb.prepare.mockReturnValueOnce(getRetryStmt);

      await expect(repo.markFinalFailed('nonexistent', 'error')).rejects.toThrow(
        'PublishTask nonexistent not found'
      );
    });
  });

  describe('findById', () => {
    it('returns task when found', async () => {
      stmt.get.mockReturnValue(mockTask);

      const result = await repo.findById('pt-1');

      expect(result).toEqual(mockTask);
    });
  });

  describe('insert', () => {
    it('inserts new task', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockTask) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'pt-1',
        content_id: 'content-1',
        group_id: 'group-1',
        platform: 'douyin',
        account_id: 'acc-1',
        proxy_id: null,
        fingerprint_id: null,
        scheduled_at: null,
        publish_mode: 'client_direct',
        status: 'pending',
        result: null,
        error_message: null,
        retry_count: 0,
        max_retries: 3,
      });

      expect(result).toEqual(mockTask);
    });
  });
});
