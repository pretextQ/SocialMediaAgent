import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { CommentTemplateRepository } from '@electron/data/repositories/CommentTemplateRepository';
import type { CommentTemplate } from '@electron/data/types';

describe('CommentTemplateRepository', () => {
  let repo: CommentTemplateRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockTemplate: CommentTemplate = {
    id: 'ct-1',
    name: 'Great Video',
    content: 'This is a great video!',
    category: 'praise',
    platform: 'douyin',
    usage_count: 5,
    enabled: 1,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new CommentTemplateRepository();
  });

  describe('constructor', () => {
    it('uses "comment_templates" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('comment_templates');
    });
  });

  describe('findByCategory', () => {
    it('returns templates for given category', async () => {
      stmt.all.mockReturnValue([mockTemplate]);

      const result = await repo.findByCategory('praise');

      expect(result).toEqual([mockTemplate]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category = @category')
      );
    });

    it('returns empty array when no templates found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByCategory('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByPlatform', () => {
    it('returns templates for given platform', async () => {
      stmt.all.mockReturnValue([mockTemplate]);

      const result = await repo.findByPlatform('douyin');

      expect(result).toEqual([mockTemplate]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform')
      );
    });
  });

  describe('findEnabled', () => {
    it('returns all enabled templates', async () => {
      stmt.all.mockReturnValue([mockTemplate]);

      const result = await repo.findEnabled();

      expect(result).toEqual([mockTemplate]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE enabled = @enabled')
      );
    });
  });

  describe('findEnabledByPlatform', () => {
    it('returns enabled templates for given platform', async () => {
      stmt.all.mockReturnValue([mockTemplate]);

      const result = await repo.findEnabledByPlatform('douyin');

      expect(result).toEqual([mockTemplate]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM comment_templates WHERE platform = ? AND enabled = 1'
      );
      expect(stmt.all).toHaveBeenCalledWith('douyin');
    });

    it('returns empty array when no enabled templates for platform', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findEnabledByPlatform('xiaohongshu');

      expect(result).toEqual([]);
    });
  });

  describe('incrementUsage', () => {
    it('increments usage_count by 1', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      await repo.incrementUsage('ct-1');

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('usage_count = usage_count + 1')
      );
      expect(stmt.run).toHaveBeenCalledWith('ct-1');
    });
  });

  describe('getRandomEnabled', () => {
    it('returns random enabled template for given platform', async () => {
      stmt.get.mockReturnValue(mockTemplate);

      const result = await repo.getRandomEnabled('douyin');

      expect(result).toEqual(mockTemplate);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("enabled = 1 AND (platform = ? OR platform = '') ORDER BY RANDOM() LIMIT 1")
      );
      expect(stmt.get).toHaveBeenCalledWith('douyin');
    });

    it('returns random enabled template without platform filter', async () => {
      stmt.get.mockReturnValue(mockTemplate);

      const result = await repo.getRandomEnabled();

      expect(result).toEqual(mockTemplate);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1')
      );
    });

    it('returns undefined when no enabled templates exist', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.getRandomEnabled('douyin');

      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns template when found', async () => {
      stmt.get.mockReturnValue(mockTemplate);

      const result = await repo.findById('ct-1');

      expect(result).toEqual(mockTemplate);
    });
  });

  describe('insert', () => {
    it('inserts new template', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockTemplate) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'ct-1',
        name: 'Great Video',
        content: 'This is a great video!',
        category: 'praise',
        platform: 'douyin',
        usage_count: 5,
        enabled: 1,
      });

      expect(result).toEqual(mockTemplate);
    });
  });

  describe('update', () => {
    it('updates template fields', async () => {
      const updated = { ...mockTemplate, content: 'Updated content' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.update('ct-1', { content: 'Updated content' });

      expect(result.content).toBe('Updated content');
    });
  });

  describe('deleteById', () => {
    it('deletes template by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('ct-1');

      expect(result).toBe(true);
    });
  });
});
