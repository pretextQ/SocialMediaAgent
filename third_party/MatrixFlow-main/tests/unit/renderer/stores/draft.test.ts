import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import { useDraftStore } from '@/renderer/stores/draft';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';

let mock: MatrixflowMock;

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    title: 'Test Draft',
    materialId: 'mat-1',
    status: 'editing',
    snapshot: {
      materialId: 'mat-1',
      materialPath: '/tmp/video.mp4',
      title: 'Test Draft',
      description: '',
      platformConfigs: [],
    },
    sourceDraftId: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

describe('useDraftStore', () => {
  describe('initial state', () => {
    it('starts with empty drafts', () => {
      const store = useDraftStore();
      expect(store.drafts).toEqual([]);
    });

    it('starts with loading=false', () => {
      const store = useDraftStore();
      expect(store.loading).toBe(false);
    });

    it('starts with empty filter', () => {
      const store = useDraftStore();
      expect(store.filter).toEqual({});
    });
  });

  describe('fetchDrafts', () => {
    it('loads drafts from IPC and populates state', async () => {
      const drafts = [makeDraft({ id: 'd-1' }), makeDraft({ id: 'd-2' })];
      mock.draft.list.mockResolvedValue({ success: true, data: drafts });

      const store = useDraftStore();
      await store.fetchDrafts();

      expect(store.drafts).toEqual(drafts);
      expect(mock.draft.list).toHaveBeenCalled();
    });

    it('manages loading state', async () => {
      let loadingDuringCall = false;
      mock.draft.list.mockImplementation(async () => {
        loadingDuringCall = useDraftStore().loading;
        return { success: true, data: [] };
      });

      const store = useDraftStore();
      await store.fetchDrafts();

      expect(loadingDuringCall).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('resets loading on error', async () => {
      mock.draft.list.mockRejectedValue(new Error('IPC fail'));

      const store = useDraftStore();
      await expect(store.fetchDrafts()).rejects.toThrow('IPC fail');
      expect(store.loading).toBe(false);
    });

    it('handles non-IpcResult response gracefully', async () => {
      const drafts = [makeDraft({ id: 'd-1' })];
      mock.draft.list.mockResolvedValue(drafts);

      const store = useDraftStore();
      await store.fetchDrafts();

      expect(store.drafts).toEqual(drafts);
    });
  });

  describe('saveDraft', () => {
    it('saves snapshot and returns draft id', async () => {
      mock.draft.save.mockResolvedValue({ success: true, data: { id: 'draft-new' } });

      const store = useDraftStore();
      const snapshot = { materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: 'New' };
      const id = await store.saveDraft(snapshot);

      expect(id).toBe('draft-new');
      expect(mock.draft.save).toHaveBeenCalledWith(snapshot, undefined);
    });

    it('passes existingId for update', async () => {
      mock.draft.save.mockResolvedValue({ success: true, data: { id: 'draft-1' } });

      const store = useDraftStore();
      const snapshot = { materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: 'Updated' };
      const id = await store.saveDraft(snapshot, 'draft-1');

      expect(id).toBe('draft-1');
      expect(mock.draft.save).toHaveBeenCalledWith(snapshot, 'draft-1');
    });

    it('returns null when IPC returns unsuccessful result', async () => {
      mock.draft.save.mockResolvedValue({ success: false, message: 'fail' });

      const store = useDraftStore();
      const id = await store.saveDraft({ title: 'Fail' });

      expect(id).toBeNull();
    });

    it('returns null when window.matrixflow is unavailable', async () => {
      removeMatrixflowMock();
      (globalThis as any).window = {};

      const store = useDraftStore();
      const id = await store.saveDraft({ title: 'No IPC' });

      expect(id).toBeNull();
    });
  });

  describe('getDraft', () => {
    it('calls IPC getDraft', async () => {
      mock.draft.get.mockResolvedValue({ success: true, data: { id: 'd-1' } });

      const store = useDraftStore();
      await store.getDraft('d-1');

      expect(mock.draft.get).toHaveBeenCalledWith('d-1');
    });
  });

  describe('deleteDraft', () => {
    it('deletes draft from list', async () => {
      mock.draft.delete.mockResolvedValue({ success: true });

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1' }), makeDraft({ id: 'd-2' })] as any;
      await store.deleteDraft('d-1');

      expect(store.drafts).toHaveLength(1);
      expect(store.drafts[0].id).toBe('d-2');
    });
  });

  describe('publishDraft', () => {
    it('publishes draft and updates status', async () => {
      mock.draft.publish.mockResolvedValue({ success: true, data: null });

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1', status: 'editing' })] as any;
      const result = await store.publishDraft('d-1');

      expect(store.drafts[0].status).toBe('ready');
    });
  });

  describe('revokeDraft', () => {
    it('revokes draft and updates status', async () => {
      mock.draft.revoke.mockResolvedValue({ success: true, data: null });

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1', status: 'ready' })] as any;
      await store.revokeDraft('d-1');

      expect(store.drafts[0].status).toBe('editing');
    });
  });

  describe('computed', () => {
    it('editingDrafts filters by editing status', () => {
      const store = useDraftStore();
      store.drafts = [
        makeDraft({ id: '1', status: 'editing' }),
        makeDraft({ id: '2', status: 'ready' }),
      ] as any;
      expect(store.editingDrafts).toHaveLength(1);
    });

    it('readyDrafts filters by ready status', () => {
      const store = useDraftStore();
      store.drafts = [
        makeDraft({ id: '1', status: 'editing' }),
        makeDraft({ id: '2', status: 'ready' }),
      ] as any;
      expect(store.readyDrafts).toHaveLength(1);
    });
  });
});
