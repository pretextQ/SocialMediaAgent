import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';
import type { ContentItem } from '@/renderer/stores/content';
import { useContentStore } from '@/renderer/stores/content';

function makeContent(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'content_1',
    title: '测试内容',
    type: 'video',
    status: 'draft',
    tags: ['测试'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useContentStore', () => {
  let mock: MatrixflowMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    mock = installMatrixflowMock();
  });

  afterEach(() => {
    removeMatrixflowMock();
  });

  describe('state', () => {
    it('initializes with empty contents, loading=false, empty filters', () => {
      const store = useContentStore();
      expect(store.contents).toEqual([]);
      expect(store.loading).toBe(false);
      expect(store.searchQuery).toBe('');
      expect(store.statusFilter).toBe('');
    });
  });

  describe('computed: filteredContents', () => {
    it('returns all contents when no filters applied', () => {
      const store = useContentStore();
      store.contents = [
        makeContent({ id: '1' }),
        makeContent({ id: '2' }),
      ];
      expect(store.filteredContents).toHaveLength(2);
    });

    it('returns empty array when contents is empty', () => {
      const store = useContentStore();
      expect(store.filteredContents).toEqual([]);
    });

    describe('statusFilter', () => {
      it('filters by draft status', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', status: 'draft' }),
          makeContent({ id: '2', status: 'published' }),
          makeContent({ id: '3', status: 'draft' }),
        ];
        store.statusFilter = 'draft';
        expect(store.filteredContents).toHaveLength(2);
        expect(store.filteredContents.every((c) => c.status === 'draft')).toBe(true);
      });

      it('filters by ready status', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', status: 'ready' }),
          makeContent({ id: '2', status: 'draft' }),
        ];
        store.statusFilter = 'ready';
        expect(store.filteredContents).toHaveLength(1);
        expect(store.filteredContents[0].status).toBe('ready');
      });

      it('returns all when statusFilter is empty string', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', status: 'draft' }),
          makeContent({ id: '2', status: 'published' }),
        ];
        store.statusFilter = '';
        expect(store.filteredContents).toHaveLength(2);
      });
    });

    describe('searchQuery', () => {
      it('filters by title (case insensitive)', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', title: 'Vue3 教程' }),
          makeContent({ id: '2', title: 'React 入门' }),
        ];
        store.searchQuery = 'vue3';
        expect(store.filteredContents).toHaveLength(1);
        expect(store.filteredContents[0].title).toBe('Vue3 教程');
      });

      it('filters by tag (case insensitive)', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', title: '内容A', tags: ['JavaScript'] }),
          makeContent({ id: '2', title: '内容B', tags: ['Python'] }),
        ];
        store.searchQuery = 'javascript';
        expect(store.filteredContents).toHaveLength(1);
        expect(store.filteredContents[0].id).toBe('1');
      });

      it('ignores whitespace-only searchQuery', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1' }),
          makeContent({ id: '2' }),
        ];
        store.searchQuery = '   ';
        expect(store.filteredContents).toHaveLength(2);
      });
    });

    describe('combined filters', () => {
      it('applies both statusFilter and searchQuery', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', title: 'Vue3 教程', status: 'draft', tags: [] }),
          makeContent({ id: '2', title: 'React 入门', status: 'draft', tags: [] }),
          makeContent({ id: '3', title: 'Vue3 进阶', status: 'published', tags: [] }),
        ];
        store.statusFilter = 'draft';
        store.searchQuery = 'vue3';
        expect(store.filteredContents).toHaveLength(1);
        expect(store.filteredContents[0].id).toBe('1');
      });

      it('returns empty when filters match nothing', () => {
        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', title: 'Vue3', status: 'draft' }),
        ];
        store.statusFilter = 'published';
        store.searchQuery = 'vue3';
        expect(store.filteredContents).toHaveLength(0);
      });
    });
  });

  describe('actions', () => {
    describe('fetchContents', () => {
      it('calls content.list and populates state', async () => {
        const items = [
          makeContent({ id: '1', title: 'A' }),
          makeContent({ id: '2', title: 'B' }),
        ];
        mock.content.list.mockResolvedValue(items);

        const store = useContentStore();
        await store.fetchContents();

        expect(mock.content.list).toHaveBeenCalledOnce();
        expect(store.contents).toEqual(items);
      });

      it('sets loading=true during fetch and loading=false after', async () => {
        let loadingDuringCall = false;
        mock.content.list.mockImplementation(async () => {
          const store = useContentStore();
          loadingDuringCall = store.loading;
          return [];
        });

        const store = useContentStore();
        await store.fetchContents();

        expect(loadingDuringCall).toBe(true);
        expect(store.loading).toBe(false);
      });

      it('resets loading to false even on error', async () => {
        mock.content.list.mockRejectedValue(new Error('IPC fail'));

        const store = useContentStore();
        await expect(store.fetchContents()).rejects.toThrow('IPC fail');

        expect(store.loading).toBe(false);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useContentStore();
        await store.fetchContents();

        expect(store.contents).toEqual([]);
      });
    });

    describe('createContent', () => {
      it('calls content.create and prepends to state', async () => {
        const newItem = makeContent({ id: 'new_1', title: '新内容' });
        mock.content.create.mockResolvedValue(newItem);

        const store = useContentStore();
        store.contents = [makeContent({ id: 'old_1' })];
        const result = await store.createContent({ title: '新内容', type: 'video' });

        expect(mock.content.create).toHaveBeenCalledWith({ title: '新内容', type: 'video' });
        expect(store.contents).toHaveLength(2);
        expect(store.contents[0]).toEqual(newItem);
        expect(result).toEqual(newItem);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useContentStore();
        const result = await store.createContent({ title: 'test' });

        expect(result).toBeUndefined();
        expect(store.contents).toEqual([]);
      });
    });

    describe('updateContent', () => {
      it('calls content.update and replaces in state', async () => {
        const updated = makeContent({ id: '1', title: '更新后' });
        mock.content.update.mockResolvedValue(updated);

        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1', title: '更新前' }),
          makeContent({ id: '2', title: '其他' }),
        ];
        const result = await store.updateContent('1', { title: '更新后' });

        expect(mock.content.update).toHaveBeenCalledWith('1', { title: '更新后' });
        expect(store.contents[0].title).toBe('更新后');
        expect(result).toEqual(updated);
      });

      it('does not modify state when content.update returns falsy', async () => {
        mock.content.update.mockResolvedValue(null);

        const store = useContentStore();
        store.contents = [makeContent({ id: '1', title: '原始' })];
        const result = await store.updateContent('1', { title: '新标题' });

        expect(store.contents[0].title).toBe('原始');
        expect(result).toBeNull();
      });

      it('handles update for non-existent id in state gracefully', async () => {
        const updated = makeContent({ id: '99', title: '不存在' });
        mock.content.update.mockResolvedValue(updated);

        const store = useContentStore();
        store.contents = [makeContent({ id: '1' })];
        const result = await store.updateContent('99', { title: '不存在' });

        expect(store.contents).toHaveLength(1);
        expect(result).toEqual(updated);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useContentStore();
        const result = await store.updateContent('1', { title: 'test' });

        expect(result).toBeUndefined();
      });
    });

    describe('deleteContent', () => {
      it('calls content.delete and removes from state', async () => {
        mock.content.delete.mockResolvedValue({ success: true });

        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1' }),
          makeContent({ id: '2' }),
        ];
        await store.deleteContent('1');

        expect(mock.content.delete).toHaveBeenCalledWith('1');
        expect(store.contents).toHaveLength(1);
        expect(store.contents[0].id).toBe('2');
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useContentStore();
        store.contents = [makeContent({ id: '1' })];
        await store.deleteContent('1');

        expect(store.contents).toHaveLength(1);
      });
    });

    describe('batchDelete', () => {
      it('deletes multiple items by id', async () => {
        mock.content.delete.mockResolvedValue({ success: true });

        const store = useContentStore();
        store.contents = [
          makeContent({ id: '1' }),
          makeContent({ id: '2' }),
          makeContent({ id: '3' }),
        ];
        await store.batchDelete(['1', '3']);

        expect(mock.content.delete).toHaveBeenCalledTimes(2);
        expect(mock.content.delete).toHaveBeenCalledWith('1');
        expect(mock.content.delete).toHaveBeenCalledWith('3');
        expect(store.contents).toHaveLength(1);
        expect(store.contents[0].id).toBe('2');
      });

      it('handles empty array', async () => {
        const store = useContentStore();
        store.contents = [makeContent({ id: '1' })];
        await store.batchDelete([]);

        expect(mock.content.delete).not.toHaveBeenCalled();
        expect(store.contents).toHaveLength(1);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useContentStore();
        store.contents = [makeContent({ id: '1' })];
        await store.batchDelete(['1']);

        expect(store.contents).toHaveLength(1);
      });
    });

    describe('uploadVideo', () => {
      it('calls content.uploadVideo and returns result', async () => {
        const uploadResult = { success: true, data: { id: 'vid_1' } };
        mock.content.uploadVideo.mockResolvedValue(uploadResult);

        const store = useContentStore();
        const result = await store.uploadVideo({ filePath: '/path/to/video.mp4', title: '视频' });

        expect(mock.content.uploadVideo).toHaveBeenCalledWith({ filePath: '/path/to/video.mp4', title: '视频' });
        expect(result).toEqual(uploadResult);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useContentStore();
        const result = await store.uploadVideo({ filePath: '/path', title: 'test' });

        expect(result).toBeUndefined();
      });
    });
  });
});
