import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { PublishRecordRepository } from '@electron/data/repositories/PublishRecordRepository';
import type { PublishRecord } from '@electron/data/types';

describe('PublishRecordRepository', () => {
  let repo: PublishRecordRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockRecord: PublishRecord = {
    id: 'pr-1',
    video_id: 'video-1',
    account_id: 'acc-1',
    platform: 'douyin',
    status: 'pending',
    started_at: null,
    completed_at: null,
    duration_ms: null,
    error_message: null,
    retry_count: 0,
    created_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new PublishRecordRepository();
  });

  describe('constructor', () => {
    it('uses "publish_records" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('publish_records');
    });
  });

  describe('findByVideoId', () => {
    it('returns records for given video', async () => {
      const records: PublishRecord[] = [mockRecord];
      stmt.all.mockReturnValue(records);

      const result = await repo.findByVideoId('video-1');

      expect(result).toEqual(records);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE video_id = @video_id')
      );
    });

    it('returns empty array when no records found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByVideoId('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByAccountId', () => {
    it('returns records for given account', async () => {
      stmt.all.mockReturnValue([mockRecord]);

      const result = await repo.findByAccountId('acc-1');

      expect(result).toEqual([mockRecord]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE account_id = @account_id')
      );
    });
  });

  describe('findByStatus', () => {
    it('returns records with given status', async () => {
      stmt.all.mockReturnValue([mockRecord]);

      const result = await repo.findByStatus('pending');

      expect(result).toEqual([mockRecord]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = @status')
      );
    });
  });

  describe('markStarted', () => {
    it('updates status to running with started_at timestamp', async () => {
      const updated = { ...mockRecord, status: 'running', started_at: '2025-06-01T00:00:00.000Z' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markStarted('pr-1');

      expect(result.status).toBe('running');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', id: 'pr-1' })
      );
    });
  });

  describe('markCompleted', () => {
    it('updates status to completed with duration', async () => {
      const updated = { ...mockRecord, status: 'completed', duration_ms: 5000 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markCompleted('pr-1', 5000);

      expect(result.status).toBe('completed');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', duration_ms: 5000, id: 'pr-1' })
      );
    });
  });

  describe('markFailed', () => {
    it('updates status to failed with error message', async () => {
      const updated = { ...mockRecord, status: 'failed', error_message: 'Timeout' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.markFailed('pr-1', 'Timeout');

      expect(result.status).toBe('failed');
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error_message: 'Timeout', id: 'pr-1' })
      );
    });
  });

  describe('findById', () => {
    it('returns record when found', async () => {
      stmt.get.mockReturnValue(mockRecord);

      const result = await repo.findById('pr-1');

      expect(result).toEqual(mockRecord);
    });
  });

  describe('insert', () => {
    it('inserts new record', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockRecord) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'pr-1',
        video_id: 'video-1',
        account_id: 'acc-1',
        platform: 'douyin',
        status: 'pending',
        started_at: null,
        completed_at: null,
        duration_ms: null,
        error_message: null,
        retry_count: 0,
      });

      expect(result).toEqual(mockRecord);
    });
  });

  describe('deleteById', () => {
    it('deletes record by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('pr-1');

      expect(result).toBe(true);
    });
  });
});
