import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { ContentRepository } from '@electron/data/repositories/ContentRepository';
import type { Content } from '@electron/data/types';

describe('ContentRepository', () => {
  let repo: ContentRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockContent: Content = {
    id: 'content-1',
    type: 'video',
    title: 'Test Video',
    description: 'A test video',
    file_path: '/tmp/video.mp4',
    thumbnail_path: null,
    duration: 120,
    size: 1024000,
    tags: 'test,video',
    metadata: '{}',
    status: 'ready',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new ContentRepository();
  });

  describe('constructor', () => {
    it('uses "contents" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('contents');
    });
  });

  describe('findByType', () => {
    it('returns paginated contents filtered by type', async () => {
      const contents: Content[] = [mockContent];
      const countStmt = { get: vi.fn().mockReturnValue({ total: 1 }) };
      const listStmt = { all: vi.fn().mockReturnValue(contents) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.findByType('video');

      expect(result).toEqual({
        data: contents,
        total: 1,
        page: 1,
        pageSize: 50,
      });
      expect(countStmt.get).toHaveBeenCalledWith('video');
      expect(listStmt.all).toHaveBeenCalledWith('video', 50, 0);
    });

    it('respects pagination options', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 10 }) };
      const listStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.findByType('video', { page: 2, pageSize: 5 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      expect(listStmt.all).toHaveBeenCalledWith('video', 5, 5);
    });
  });

  describe('findByStatus', () => {
    it('returns contents with given status', async () => {
      const contents: Content[] = [mockContent];
      stmt.all.mockReturnValue(contents);

      const result = await repo.findByStatus('ready');

      expect(result).toEqual(contents);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = @status')
      );
    });

    it('returns empty array when no matching contents', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByStatus('published');

      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('searches by keyword in title and description', async () => {
      const contents: Content[] = [mockContent];
      stmt.all.mockReturnValue(contents);

      const result = await repo.search('Test');

      expect(result).toEqual(contents);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE title LIKE ? OR description LIKE ?')
      );
      expect(stmt.all).toHaveBeenCalledWith('%Test%', '%Test%');
    });

    it('returns empty array for no matches', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.search('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns content when found', async () => {
      stmt.get.mockReturnValue(mockContent);

      const result = await repo.findById('content-1');

      expect(result).toEqual(mockContent);
    });
  });

  describe('insert', () => {
    it('inserts new content', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockContent) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'content-1',
        type: 'video',
        title: 'Test Video',
        description: 'A test video',
        file_path: '/tmp/video.mp4',
        thumbnail_path: null,
        duration: 120,
        size: 1024000,
        tags: 'test,video',
        metadata: '{}',
        status: 'ready',
      });

      expect(result).toEqual(mockContent);
    });
  });

  describe('deleteById', () => {
    it('deletes content by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('content-1');

      expect(result).toBe(true);
    });
  });
});
