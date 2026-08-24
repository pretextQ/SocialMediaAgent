import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentService } from '@electron/services/ContentService';
import type { ContentRow } from '@electron/services/types/content';

const { eventBusEmit, mockDb, mockFs, mockSpawn } = vi.hoisted(() => {
  const emit = vi.fn();
  const db = {
    exec: vi.fn(),
    prepare: vi.fn(),
    transaction: vi.fn((fn: Function) => (...args: unknown[]) => fn(...args)),
  };
  const createReadStream = vi.fn(() => {
    const listeners: Record<string, Function[]> = {};
    const stream = {
      on: (event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return stream;
      },
    };
    setTimeout(() => {
      listeners.data?.forEach((cb) => cb(Buffer.from('chunk')));
      listeners.end?.forEach((cb) => cb());
    }, 0);
    return stream;
  });
  const fs = {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isFile: () => true, size: 1024 }),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('file-content'),
    createReadStream,
    unlinkSync: vi.fn(),
  };
  const spawn = vi.fn();
  return { eventBusEmit: emit, mockDb: db, mockFs: fs, mockSpawn: spawn };
});

let dbAvailable = true;

vi.mock('@electron/core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emit: eventBusEmit,
      on: vi.fn(),
      off: vi.fn(),
    }),
  },
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
  initDatabase: () => mockDb,
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomBytes: () => Buffer.alloc(4, 'a'),
    createHash: () => ({
      update: vi.fn().mockReturnThis(),
      digest: () => 'fakehash' + '0'.repeat(52),
    }),
  };
});

function createContentRow(overrides?: Partial<ContentRow>): ContentRow {
  return {
    id: 'cnt_001',
    type: 'video',
    title: '测试视频',
    description: null,
    file_path: '/tmp/video.mp4',
    thumbnail_path: null,
    duration: null,
    size: 1024,
    tags: '[]',
    metadata: '{}',
    file_hash: 'abc123',
    status: 'ready',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stmt(get?: unknown, all?: unknown[], run?: unknown) {
  return { get: vi.fn(() => get), all: vi.fn(() => all ?? []), run: vi.fn(() => run) };
}

function resetSingleton(): void {
  try {
    (ContentService as unknown as { instance: ContentService | null }).instance = null;
  } catch {
    // ignore
  }
}

function resetInitialized(svc: ContentService): void {
  try {
    (svc as unknown as { initialized: boolean }).initialized = false;
  } catch {
    // ignore
  }
}

describe('ContentService', () => {
  let service: ContentService;

  beforeEach(() => {
    resetSingleton();
    vi.clearAllMocks();
    dbAvailable = true;
    mockDb.prepare.mockReturnValue(stmt());
    service = ContentService.getInstance();
    resetInitialized(service);
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const a = ContentService.getInstance();
      const b = ContentService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('creates thumbnails directory when missing', () => {
      mockFs.existsSync.mockReturnValueOnce(false);
      service.initialize();
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('thumbnails'),
        { recursive: true },
      );
    });

    it('is idempotent', async () => {
      await service.initialize();
      const callCount = mockFs.mkdirSync.mock.calls.length;
      await service.initialize();
      expect(mockFs.mkdirSync.mock.calls.length).toBe(callCount);
    });

    it('skips mkdir when thumbnails dir exists', async () => {
      await service.initialize();
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('importContent', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('imports a video file', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => true, size: 2048 });

      const updateStmt = stmt();
      mockDb.prepare
        .mockReturnValueOnce(stmt()) // INSERT
        .mockReturnValueOnce(stmt(undefined)) // findByHash: no dup
        .mockReturnValueOnce(updateStmt) // UPDATE (metadata)
        .mockReturnValueOnce(updateStmt) // UPDATE (status=ready)
        .mockReturnValueOnce(stmt(null)); // final getContentRow

      mockSpawn.mockImplementation(() => {
        const proc = {
          stdout: {
            on: (event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from(JSON.stringify({
                  format: { duration: '60.5' },
                  streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
                }))), 0);
              }
            },
          },
          stderr: { on: vi.fn() },
          on: (event: string, cb: (code: number) => void) => {
            if (event === 'close') setTimeout(() => cb(0), 5);
          },
        };
        return proc as unknown as ReturnType<typeof import('child_process').spawn>;
      });

      const content = await service.importContent('/tmp/video.mp4');
      expect(content).not.toBeNull();
      expect(content.type).toBe('video');
    });

    it('throws when file does not exist', async () => {
      mockFs.existsSync.mockReturnValueOnce(false);
      await expect(service.importContent('/nonexistent.mp4')).rejects.toThrow('文件不存在');
    });

    it('throws when path is not a file', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => false, size: 0 });
      await expect(service.importContent('/tmp/dir')).rejects.toThrow('不是文件');
    });

    it('throws for unsupported file format', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => true, size: 100 });
      await expect(service.importContent('/tmp/file.xyz')).rejects.toThrow('不支持的文件格式');
    });

    it('throws when file hash already exists', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => true, size: 100 });
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(createContentRow({ title: '已存在视频' })));

      await expect(service.importContent('/tmp/video.mp4')).rejects.toThrow('文件已存在');
    });

    it('imports an image file', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => true, size: 500 });

      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(undefined)) // findByHash: no dup
        .mockReturnValueOnce(stmt()) // INSERT
        .mockReturnValueOnce(stmt()); // UPDATE status=ready

      const content = await service.importContent('/tmp/photo.jpg');
      expect(content.type).toBe('image');
    });
  });

  describe('importBatch', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('continues on individual file failure', async () => {
      mockFs.existsSync.mockReturnValueOnce(false).mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => true, size: 500 });

      mockDb.prepare
        .mockReturnValueOnce(stmt()) // INSERT (fails early via validateFile)
        .mockReturnValueOnce(stmt()) // INSERT
        .mockReturnValueOnce(stmt(undefined)) // findByHash
        .mockReturnValueOnce(stmt()); // UPDATE

      const results = await service.importBatch(['/tmp/nonexistent.jpg', '/tmp/b.png']);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('updateMetadata', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('updates title, description and tags', async () => {
      const row = createContentRow();
      const s = stmt(row);
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(s) // getContentRow
        .mockReturnValueOnce(s); // updateRow

      await service.updateMetadata('cnt_001', { title: '新标题', description: '新描述', tags: ['tag1'] });
      expect(s.run).toHaveBeenCalled();
      expect(eventBusEmit).toHaveBeenCalledWith(
        'content:metadata-updated',
        expect.objectContaining({ contentId: 'cnt_001' }),
      );
    });

    it('throws when content does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(null));
      await expect(service.updateMetadata('nonexistent', { title: 'x' })).rejects.toThrow('内容不存在');
    });
  });

  describe('setTitle / setDescription / setTags', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('setTitle delegates to updateMetadata', async () => {
      const s = stmt(createContentRow());
      mockDb.prepare.mockReset().mockReturnValueOnce(s).mockReturnValueOnce(s);
      await service.setTitle('cnt_001', '新标题');
      expect(s.run).toHaveBeenCalled();
    });

    it('setDescription delegates to updateMetadata', async () => {
      const s = stmt(createContentRow());
      mockDb.prepare.mockReset().mockReturnValueOnce(s).mockReturnValueOnce(s);
      await service.setDescription('cnt_001', '新描述');
      expect(s.run).toHaveBeenCalled();
    });

    it('setTags delegates to updateMetadata', async () => {
      const s = stmt(createContentRow());
      mockDb.prepare.mockReset().mockReturnValueOnce(s).mockReturnValueOnce(s);
      await service.setTags('cnt_001', ['t1', 't2']);
      expect(s.run).toHaveBeenCalled();
    });
  });

  describe('markAsReady', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('transitions status to ready', async () => {
      const row = createContentRow({ status: 'importing' });
      const s = stmt(row);
      mockDb.prepare.mockReset().mockReturnValueOnce(s).mockReturnValueOnce(s);

      await service.markAsReady('cnt_001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        'content:status-changed',
        expect.objectContaining({ oldStatus: 'importing', newStatus: 'ready' }),
      );
    });

    it('throws when content does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(null));
      await expect(service.markAsReady('nonexistent')).rejects.toThrow('内容不存在');
    });
  });

  describe('markAsPublished', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('transitions status to published', async () => {
      const row = createContentRow({ status: 'ready' });
      const s = stmt(row);
      mockDb.prepare.mockReset().mockReturnValueOnce(s).mockReturnValueOnce(s);

      await service.markAsPublished('cnt_001', 'douyin', 'vid123');
      expect(s.run).toHaveBeenCalled();
    });
  });

  describe('getContent', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('returns null when not found', async () => {
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(null));
      const result = await service.getContent('nonexistent');
      expect(result).toBeNull();
    });

    it('returns Content with published records', async () => {
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(createContentRow())) // getContentRow
        .mockReturnValueOnce(stmt(undefined, [])); // fetchPublishedRecords

      const result = await service.getContent('cnt_001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('cnt_001');
      expect(result!.publishedTo).toEqual([]);
    });
  });

  describe('getAllContents', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('returns all contents', async () => {
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(undefined, [createContentRow()])) // SELECT all
        .mockReturnValueOnce(stmt(undefined, [])); // fetchPublishedRecords

      const result = await service.getAllContents();
      expect(result).toHaveLength(1);
    });

    it('returns empty array when db unavailable', async () => {
      dbAvailable = false;
      const result = await service.getAllContents();
      expect(result).toEqual([]);
    });
  });

  describe('getReadyContents', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('returns ready contents', async () => {
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(undefined, [createContentRow({ status: 'ready' })]))
        .mockReturnValueOnce(stmt(undefined, []));

      const result = await service.getReadyContents();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('ready');
    });
  });

  describe('searchContents', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('searches by query', async () => {
      const s = stmt(undefined, [createContentRow({ title: '美食探店' })]);
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(s) // search query
        .mockReturnValueOnce(stmt(undefined, [])); // published

      const result = await service.searchContents('美食');
      expect(result).toHaveLength(1);
      expect(s.all).toHaveBeenCalledWith('%美食%', '%美食%', '%美食%');
    });
  });

  describe('updateContent', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('updates specified fields', async () => {
      const row = createContentRow();
      const updatedRow = { ...row, title: '更新后' };
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(row)) // getContentRow
        .mockReturnValueOnce(stmt()) // UPDATE
        .mockReturnValueOnce(stmt(updatedRow)); // final getContentRow

      const result = await service.updateContent('cnt_001', { title: '更新后' });
      expect(result).not.toBeNull();
      expect(eventBusEmit).toHaveBeenCalledWith(
        'content:updated',
        expect.objectContaining({ contentId: 'cnt_001' }),
      );
    });

    it('returns existing row when no fields to update', async () => {
      const row = createContentRow();
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(row));

      const result = await service.updateContent('cnt_001', {});
      expect(result).toEqual(row);
    });

    it('throws when content does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(null));
      await expect(service.updateContent('nonexistent', { title: 'x' })).rejects.toThrow('内容不存在');
    });

    it('throws when database unavailable', async () => {
      dbAvailable = false;
      await expect(service.updateContent('cnt_001', { title: 'x' })).rejects.toThrow();
    });
  });

  describe('deleteContent', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('deletes content', async () => {
      const selectStmt = stmt(createContentRow({ thumbnail_path: null }));
      const deleteStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt) // getContentRow SELECT
        .mockReturnValueOnce(deleteStmt); // DELETE

      await service.deleteContent('cnt_001');
      expect(deleteStmt.run).toHaveBeenCalledWith('cnt_001');
      expect(eventBusEmit).toHaveBeenCalledWith(
        'content:deleted',
        expect.objectContaining({ contentId: 'cnt_001' }),
      );
    });

    it('deletes thumbnail file when it exists', async () => {
      const selectStmt = stmt(createContentRow({ thumbnail_path: '/tmp/thumb.jpg' }));
      const deleteStmt = stmt();
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(selectStmt)
        .mockReturnValueOnce(deleteStmt);
      mockFs.existsSync.mockReturnValue(true);

      await service.deleteContent('cnt_001');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/thumb.jpg');
    });

    it('throws when content does not exist', async () => {
      mockDb.prepare.mockReset().mockReturnValueOnce(stmt(null));
      await expect(service.deleteContent('nonexistent')).rejects.toThrow('内容不存在');
    });
  });

  describe('rowToContent mapping', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('parses metadata JSON correctly', async () => {
      const row = createContentRow({
        metadata: JSON.stringify({ width: 1920, height: 1080 }),
        duration: 60.5,
        tags: JSON.stringify(['tag1', 'tag2']),
        description: '描述文字',
        thumbnail_path: '/tmp/thumb.jpg',
      });
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(row))
        .mockReturnValueOnce(stmt(undefined, []));

      const content = await service.getContent('cnt_001');
      expect(content!.width).toBe(1920);
      expect(content!.height).toBe(1080);
      expect(content!.duration).toBe(60.5);
      expect(content!.tags).toEqual(['tag1', 'tag2']);
      expect(content!.description).toBe('描述文字');
    });

    it('handles empty metadata', async () => {
      const row = createContentRow({ metadata: '' });
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(row))
        .mockReturnValueOnce(stmt(undefined, []));

      const content = await service.getContent('cnt_001');
      expect(content!.width).toBeUndefined();
      expect(content!.height).toBeUndefined();
    });

    it('maps published records from database', async () => {
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(createContentRow()))
        .mockReturnValueOnce(stmt(undefined, [
          { platform: 'douyin', platform_video_id: 'v123', completed_at: '2026-05-01T00:00:00.000Z' },
        ]));

      const content = await service.getContent('cnt_001');
      expect(content!.publishedTo).toHaveLength(1);
      expect(content!.publishedTo[0].platform).toBe('douyin');
      expect(content!.publishedTo[0].videoId).toBe('v123');
    });
  });
});
