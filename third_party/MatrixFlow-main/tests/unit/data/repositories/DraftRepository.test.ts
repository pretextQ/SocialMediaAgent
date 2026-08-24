import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { DraftRepository } from '@electron/data/repositories/DraftRepository';
import type { Draft } from '@electron/data/types';

describe('DraftRepository', () => {
  let repo: DraftRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockDraft: Draft = {
    id: 'draft-1',
    content_id: 'content-1',
    platform: 'douyin',
    title: 'Draft Title',
    description: 'Draft description',
    tags: 'test',
    cover_path: null,
    extra_data: '{}',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new DraftRepository();
  });

  describe('constructor', () => {
    it('uses "drafts" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('drafts');
    });
  });

  describe('findByPlatform', () => {
    it('returns drafts for given platform', async () => {
      const drafts: Draft[] = [mockDraft];
      stmt.all.mockReturnValue(drafts);

      const result = await repo.findByPlatform('douyin');

      expect(result).toEqual(drafts);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform')
      );
    });

    it('returns empty array when no drafts found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByPlatform('xiaohongshu');

      expect(result).toEqual([]);
    });
  });

  describe('findByContentId', () => {
    it('returns drafts for given content', async () => {
      stmt.all.mockReturnValue([mockDraft]);

      const result = await repo.findByContentId('content-1');

      expect(result).toEqual([mockDraft]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE content_id = @content_id')
      );
    });

    it('returns empty array when no matching content', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByContentId('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns draft when found', async () => {
      stmt.get.mockReturnValue(mockDraft);

      const result = await repo.findById('draft-1');

      expect(result).toEqual(mockDraft);
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('insert', () => {
    it('inserts new draft', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockDraft) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'draft-1',
        content_id: 'content-1',
        platform: 'douyin',
        title: 'Draft Title',
        description: 'Draft description',
        tags: 'test',
        cover_path: null,
        extra_data: '{}',
      });

      expect(result).toEqual(mockDraft);
    });
  });

  describe('update', () => {
    it('updates draft', async () => {
      const updated = { ...mockDraft, title: 'Updated Title' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.update('draft-1', { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
    });
  });

  describe('deleteById', () => {
    it('deletes draft by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('draft-1');

      expect(result).toBe(true);
    });

    it('returns false when draft not found', async () => {
      stmt.run.mockReturnValue({ changes: 0 });

      const result = await repo.deleteById('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('findAll', () => {
    it('returns paginated results', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 1 }) };
      const listStmt = { all: vi.fn().mockReturnValue([mockDraft]) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.findAll();

      expect(result).toEqual({
        data: [mockDraft],
        total: 1,
        page: 1,
        pageSize: 50,
      });
    });
  });
});
