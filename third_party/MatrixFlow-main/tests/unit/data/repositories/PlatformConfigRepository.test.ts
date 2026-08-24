import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { PlatformConfigRepository } from '@electron/data/repositories/PlatformConfigRepository';
import type { PlatformConfig } from '@electron/data/types';

describe('PlatformConfigRepository', () => {
  let repo: PlatformConfigRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockConfig: PlatformConfig = {
    id: 'pc-1',
    platform: 'douyin',
    config_key: 'max_daily_posts',
    config_value: '10',
    description: 'Maximum daily posts',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new PlatformConfigRepository();
  });

  describe('constructor', () => {
    it('uses "platform_configs" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('platform_configs');
    });
  });

  describe('findByPlatform', () => {
    it('returns configs for given platform', async () => {
      stmt.all.mockReturnValue([mockConfig]);

      const result = await repo.findByPlatform('douyin');

      expect(result).toEqual([mockConfig]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform')
      );
    });

    it('returns empty array when no configs found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByPlatform('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByKey', () => {
    it('returns config for given platform and key', async () => {
      stmt.get.mockReturnValue(mockConfig);

      const result = await repo.findByKey('douyin', 'max_daily_posts');

      expect(result).toEqual(mockConfig);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform AND config_key = @config_key')
      );
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findByKey('douyin', 'nonexistent_key');

      expect(result).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('updates existing config when found', async () => {
      stmt.get.mockReturnValue(mockConfig);
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue({ ...mockConfig, config_value: '20' }) };
      mockDb.prepare
        .mockReturnValueOnce(stmt)
        .mockReturnValueOnce(runStmt)
        .mockReturnValueOnce(getStmt);

      const result = await repo.upsert('douyin', 'max_daily_posts', '20');

      expect(result.config_value).toBe('20');
      expect(runStmt.run).toHaveBeenCalled();
    });

    it('updates description when provided', async () => {
      stmt.get.mockReturnValue(mockConfig);
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue({ ...mockConfig, description: 'New desc' }) };
      mockDb.prepare
        .mockReturnValueOnce(stmt)
        .mockReturnValueOnce(runStmt)
        .mockReturnValueOnce(getStmt);

      await repo.upsert('douyin', 'max_daily_posts', '20', 'New desc');

      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'New desc' })
      );
    });

    it('inserts new config when not found', async () => {
      stmt.get.mockReturnValue(undefined);
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue({ ...mockConfig, config_value: '5' }) };
      mockDb.prepare
        .mockReturnValueOnce(stmt)
        .mockReturnValueOnce(runStmt)
        .mockReturnValueOnce(getStmt);

      const result = await repo.upsert('douyin', 'new_key', '5');

      expect(runStmt.run).toHaveBeenCalled();
    });

    it('inserts with empty description when not provided', async () => {
      stmt.get.mockReturnValue(undefined);
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockConfig) };
      mockDb.prepare
        .mockReturnValueOnce(stmt)
        .mockReturnValueOnce(runStmt)
        .mockReturnValueOnce(getStmt);

      await repo.upsert('douyin', 'new_key', '5');

      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ description: '' })
      );
    });
  });

  describe('findById', () => {
    it('returns config when found', async () => {
      stmt.get.mockReturnValue(mockConfig);

      const result = await repo.findById('pc-1');

      expect(result).toEqual(mockConfig);
    });
  });

  describe('insert', () => {
    it('inserts new config', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockConfig) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'pc-1',
        platform: 'douyin',
        config_key: 'max_daily_posts',
        config_value: '10',
        description: 'Maximum daily posts',
      });

      expect(result).toEqual(mockConfig);
    });
  });

  describe('deleteById', () => {
    it('deletes config by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('pc-1');

      expect(result).toBe(true);
    });
  });
});
