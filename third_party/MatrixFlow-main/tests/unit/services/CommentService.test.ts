import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { commentService, CommentTemplate, CommentTask } from '@electron/services/CommentService';

const mockDb = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

let dbAvailable = vi.hoisted(() => true);

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}));

vi.mock('electron-log', () => ({
  default: mockLog,
  info: mockLog.info,
  error: mockLog.error,
  warn: mockLog.warn,
  transports: { file: { resolvePathFn: vi.fn() } },
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
}));

vi.mock('@electron/platform/base/PlatformRegistry', () => ({
  PlatformRegistry: {
    getInstance: () => ({
      getPlatform: vi.fn(),
    }),
  },
}));

vi.mock('@electron/platform/douyin/comment', () => ({
  postCommentFull: vi.fn(),
}));

vi.mock('@electron/platform/xiaohongshu/comment', () => ({
  postCommentFull: vi.fn(),
}));

vi.mock('@electron/platform/channels/comment', () => ({
  postCommentFull: vi.fn(),
}));

vi.mock('@electron/platform/kuaishou/comment', () => ({
  postCommentFull: vi.fn(),
}));

function stmt(get?: unknown, all?: unknown[], run?: unknown) {
  return { get: vi.fn(() => get), all: vi.fn(() => all ?? []), run: vi.fn(() => run) };
}

function resetSingleton(): void {
  // Service is a singleton export, no reset needed
}

function createTemplateRow(overrides?: Partial<CommentTemplate>): CommentTemplate {
  return {
    id: 'ctpl_001',
    platform: 'douyin',
    name: '测试模板',
    content: '感谢观看！',
    triggerCondition: 'after_publish',
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    ...overrides,
  };
}

describe('CommentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbAvailable = true;
    mockDb.prepare.mockReturnValue(stmt());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createTemplate', () => {
    it('creates and saves a template', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt());

      const template = commentService.createTemplate({
        platform: 'douyin',
        name: '感谢评论',
        content: '感谢支持！',
        triggerCondition: 'after_publish',
      });

      expect(template.id).toMatch(/^ctpl_/);
      expect(template.platform).toBe('douyin');
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('getTemplate', () => {
    it('returns template when found', () => {
      const row = {
        id: 'ctpl_001',
        platform: 'douyin',
        name: '测试',
        content: '内容',
        trigger_condition: 'after_publish',
        threshold: null,
        delay: null,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset().mockReturnValue(stmt(row));

      const result = commentService.getTemplate('ctpl_001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ctpl_001');
    });

    it('returns null when not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      const result = commentService.getTemplate('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when db unavailable', () => {
      dbAvailable = false;
      const result = commentService.getTemplate('ctpl_001');
      expect(result).toBeNull();
    });
  });

  describe('listTemplates', () => {
    it('returns all templates', () => {
      const rows = [
        {
          id: 'ctpl_001',
          platform: 'douyin',
          name: '模板1',
          content: '内容1',
          trigger_condition: 'after_publish',
          threshold: null,
          delay: null,
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ];
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, rows));

      const result = commentService.listTemplates();
      expect(result).toHaveLength(1);
    });

    it('filters by platform', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, []));
      commentService.listTemplates('douyin');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE platform = ?'));
    });

    it('returns empty array when db unavailable', () => {
      dbAvailable = false;
      const result = commentService.listTemplates();
      expect(result).toEqual([]);
    });
  });

  describe('updateTemplate', () => {
    it('updates template fields', () => {
      const existing = {
        id: 'ctpl_001',
        platform: 'douyin',
        name: '旧名称',
        content: '旧内容',
        trigger_condition: 'after_publish',
        threshold: null,
        delay: null,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(existing))
        .mockReturnValueOnce(stmt());

      const result = commentService.updateTemplate('ctpl_001', { name: '新名称' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('新名称');
    });

    it('returns null when template not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(null));
      const result = commentService.updateTemplate('nonexistent', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('deletes template', () => {
      const deleteStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
      mockDb.prepare.mockReset().mockReturnValue(deleteStmt);
      const result = commentService.deleteTemplate('ctpl_001');
      expect(result).toBe(true);
    });

    it('returns false when template not found', () => {
      const deleteStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 0 })) };
      mockDb.prepare.mockReset().mockReturnValue(deleteStmt);
      const result = commentService.deleteTemplate('nonexistent');
      expect(result).toBe(false);
    });
  });
});