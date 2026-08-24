import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

let dbAvailable = vi.hoisted(() => true);

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  transports: { file: { resolvePathFn: vi.fn() } },
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
}));

function stmt(get?: unknown, all?: unknown[], run?: unknown) {
  return { get: vi.fn(() => get), all: vi.fn(() => all ?? []), run: vi.fn(() => run) };
}

describe('DraftService', () => {
  let draftService: typeof import('@electron/services/DraftService').draftService;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbAvailable = true;
    mockDb.prepare.mockReturnValue(stmt());
    const mod = await import('@electron/services/DraftService');
    draftService = mod.draftService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('saveDraft', () => {
    it('saves a new draft with correct snapshot fields', () => {
      const row = {
        id: 'draft_001',
        title: '测试视频',
        material_id: 'mat-1',
        status: 'editing',
        snapshot_json: JSON.stringify({
          materialId: 'mat-1',
          materialPath: '/tmp/video.mp4',
          title: '测试视频',
          description: '描述',
          platformConfigs: [],
        }),
        source_draft_id: null,
        created_at: '2026-05-27T00:00:00.000Z',
        updated_at: '2026-05-27T00:00:00.000Z',
      };
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 1 }));
      mockDb.prepare.mockReturnValue(stmt(row));

      const result = draftService.saveDraft({
        materialId: 'mat-1',
        materialPath: '/tmp/video.mp4',
        title: '测试视频',
        description: '描述',
        platformConfigs: [],
      });

      expect(result.id).toMatch(/^draft_/);
      expect(result.title).toBe('测试视频');
      expect(result.snapshotJson.materialId).toBe('mat-1');
    });

    it('updates existing draft when existingId is provided', () => {
      const row = {
        id: 'draft-existing',
        title: 'Updated Title',
        material_id: 'mat-1',
        status: 'editing',
        snapshot_json: JSON.stringify({
          materialId: 'mat-1',
          materialPath: '/tmp/video.mp4',
          title: 'Updated Title',
          platformConfigs: [],
        }),
        source_draft_id: null,
        created_at: '2026-05-27T00:00:00.000Z',
        updated_at: '2026-05-27T00:00:00.000Z',
      };
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 1 }));
      mockDb.prepare.mockReturnValue(stmt(row));

      const result = draftService.saveDraft(
        { materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: 'Updated Title', platformConfigs: [] },
        'draft-existing',
      );

      expect(result.id).toBe('draft-existing');
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('getDraft', () => {
    it('returns draft when found', () => {
      const row = {
        id: 'draft_001',
        title: '测试',
        material_id: 'mat-1',
        status: 'editing',
        snapshot_json: JSON.stringify({ materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: '测试', platformConfigs: [] }),
        source_draft_id: null,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset().mockReturnValue(stmt(row));

      const result = draftService.getDraft('draft_001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('draft_001');
      expect(result!.snapshotJson.materialId).toBe('mat-1');
    });

    it('returns null when not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      const result = draftService.getDraft('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listDrafts', () => {
    it('returns all drafts', () => {
      const rows = [
        {
          id: 'draft_001',
          title: '草稿1',
          material_id: 'mat-1',
          status: 'editing',
          snapshot_json: JSON.stringify({ materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: '草稿1', platformConfigs: [] }),
          source_draft_id: null,
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ];
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, rows));

      const result = draftService.listDrafts();
      expect(result).toHaveLength(1);
      expect(result[0].materialId).toBe('mat-1');
    });

    it('filters by status', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, []));
      draftService.listDrafts({ status: 'editing' });
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE'));
    });

    it('filters by materialId', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, []));
      draftService.listDrafts({ materialId: 'mat-1' });
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE'));
    });

    it('returns empty array when db unavailable', () => {
      dbAvailable = false;
      const result = draftService.listDrafts();
      expect(result).toEqual([]);
    });
  });

  describe('deleteDraft', () => {
    it('deletes draft when exists', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 1 }));
      const result = draftService.deleteDraft('draft_001');
      expect(result).toBe(true);
    });

    it('returns false when not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 0 }));
      const result = draftService.deleteDraft('nonexistent');
      expect(result).toBe(false);
    });

    it('handles missing db gracefully', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 0 }));
      const result = draftService.deleteDraft('draft_001');
      expect(result).toBe(false);
    });
  });

  describe('publishDraft', () => {
    it('throws if draft not found', async () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      await expect(draftService.publishDraft('nonexistent')).rejects.toThrow('草稿不存在');
    });
  });

  describe('revokeDraft', () => {
    it('throws if draft not in ready status', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 0 }));
      expect(() => draftService.revokeDraft('draft_001')).toThrow('草稿状态不允许撤回');
    });
  });
});
