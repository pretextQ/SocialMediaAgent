import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { VideoStatRepository } from '@electron/data/repositories/VideoStatRepository';
import type { VideoStat } from '@electron/data/types';

describe('VideoStatRepository', () => {
  let repo: VideoStatRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockStat: VideoStat = {
    id: 'vs-1',
    task_item_id: 'ti-1',
    platform: 'douyin',
    platform_video_id: 'pvid-1',
    play_count: 1000,
    like_count: 100,
    comment_count: 10,
    share_count: 5,
    collect_count: 20,
    fetch_time: '2025-01-01T00:00:00.000Z',
    created_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new VideoStatRepository();
  });

  describe('constructor', () => {
    it('uses "video_stats" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('video_stats');
    });
  });

  describe('findByPlatformVideoId', () => {
    it('returns stats for given platform video id', async () => {
      stmt.all.mockReturnValue([mockStat]);

      const result = await repo.findByPlatformVideoId('pvid-1');

      expect(result).toEqual([mockStat]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform_video_id = @platform_video_id')
      );
    });

    it('returns empty array when no stats found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByPlatformVideoId('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByTaskItemId', () => {
    it('returns stats for given task item', async () => {
      stmt.all.mockReturnValue([mockStat]);

      const result = await repo.findByTaskItemId('ti-1');

      expect(result).toEqual([mockStat]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE task_item_id = @task_item_id')
      );
    });
  });

  describe('getLatestByPlatformVideoId', () => {
    it('returns most recent stat for platform video', async () => {
      stmt.get.mockReturnValue(mockStat);

      const result = await repo.getLatestByPlatformVideoId('pvid-1');

      expect(result).toEqual(mockStat);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY fetch_time DESC LIMIT 1')
      );
      expect(stmt.get).toHaveBeenCalledWith('pvid-1');
    });

    it('returns undefined when no stats found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.getLatestByPlatformVideoId('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getStatsHistory', () => {
    it('returns paginated stats history', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 5 }) };
      const listStmt = { all: vi.fn().mockReturnValue([mockStat]) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.getStatsHistory('pvid-1');

      expect(result).toEqual({
        data: [mockStat],
        total: 5,
        page: 1,
        pageSize: 30,
      });
      expect(countStmt.get).toHaveBeenCalledWith('pvid-1');
      expect(listStmt.all).toHaveBeenCalledWith('pvid-1', 30, 0);
    });

    it('respects custom pagination options', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 20 }) };
      const listStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.getStatsHistory('pvid-1', { page: 2, pageSize: 10 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(listStmt.all).toHaveBeenCalledWith('pvid-1', 10, 10);
    });
  });

  describe('findById', () => {
    it('returns stat when found', async () => {
      stmt.get.mockReturnValue(mockStat);

      const result = await repo.findById('vs-1');

      expect(result).toEqual(mockStat);
    });
  });

  describe('insert', () => {
    it('inserts new stat', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockStat) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'vs-1',
        task_item_id: 'ti-1',
        platform: 'douyin',
        platform_video_id: 'pvid-1',
        play_count: 1000,
        like_count: 100,
        comment_count: 10,
        share_count: 5,
        collect_count: 20,
        fetch_time: '2025-01-01T00:00:00.000Z',
      });

      expect(result).toEqual(mockStat);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      stmt.get.mockReturnValue({ total: 42 });

      const result = await repo.count();

      expect(result).toBe(42);
    });
  });
});
