import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type DraftStatus = 'editing' | 'ready' | 'published';

export interface Draft {
  id: string;
  title?: string;
  materialId: string;
  status: DraftStatus;
  snapshotJson: Record<string, unknown>;
  sourceDraftId?: string;
  createdAt: string;
  updatedAt: string;
}

export const useDraftStore = defineStore('draft', () => {
  const drafts = ref<Draft[]>([]);
  const loading = ref(false);
  const filter = ref<{ status?: string; platform?: string; search?: string }>({});
  const filterStatus = computed({
    get: () => filter.value.status || '',
    set: (status: string) => {
      filter.value.status = status || undefined;
    },
  });

  const editingDrafts = computed(() => drafts.value.filter((d) => d.status === 'editing'));
  const readyDrafts = computed(() => drafts.value.filter((d) => d.status === 'ready'));
  const publishedDrafts = computed(() => drafts.value.filter((d) => d.status === 'published'));

  async function fetchDrafts(f?: { status?: string; platform?: string; search?: string }) {
    if (!window.matrixflow) return;
    loading.value = true;
    try {
      const nextFilter = f || JSON.parse(JSON.stringify(filter.value));
      if (nextFilter.status === 'draft') {
        nextFilter.status = 'editing';
      }
      const result = await window.matrixflow.draft.list(nextFilter) as any;
      drafts.value = (result?.success ? result.data : result) || [];
    } finally {
      loading.value = false;
    }
  }

  async function loadDrafts() {
    return fetchDrafts();
  }

  async function getDraft(id: string): Promise<Draft | null> {
    if (!window.matrixflow) return null;
    const result = await window.matrixflow.draft.get(id) as any;
    if (!result) return null;
    return result.success ? result.data : result;
  }

  async function saveDraft(snapshot: Record<string, unknown>, existingId?: string): Promise<string | null> {
    if (!window.matrixflow) return null;
    const result = await window.matrixflow.draft.save(snapshot, existingId) as any;
    return result?.success && result?.data?.id ? result.data.id : null;
  }

  async function updateDraft(id: string, updates: Partial<Draft>): Promise<Draft | null> {
    if (!window.matrixflow) return null;
    const draft = drafts.value.find((d) => d.id === id) || await getDraft(id);
    if (!draft) return null;

    if (updates.status && updates.status !== draft.status) {
      const nextStatus = updates.status;
      if (nextStatus === 'ready') {
        const updated = { ...draft, status: 'ready' as DraftStatus, updatedAt: new Date().toISOString() };
        const index = drafts.value.findIndex((d) => d.id === id);
        if (index !== -1) drafts.value[index] = updated;
        return updated;
      }
    }

    const snapshot = {
      ...draft.snapshotJson,
      title: updates.title ?? draft.title,
    };
    const result = await window.matrixflow.draft.save(snapshot, id) as any;
    const saved = result?.success ? result.data : result;
    if (saved) {
      const index = drafts.value.findIndex((d) => d.id === id);
      if (index !== -1) drafts.value[index] = saved;
      return saved;
    }
    return null;
  }

  async function deleteDraft(id: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.draft.delete(id);
    drafts.value = drafts.value.filter((d) => d.id !== id);
  }

  async function publishDraft(id: string): Promise<{ taskIds: string[] } | null> {
    if (!window.matrixflow) return null;
    const result = await window.matrixflow.draft.publish(id);
    const draft = drafts.value.find((d) => d.id === id);
    if (draft) draft.status = 'ready';
    return result as unknown as { taskIds: string[] };
  }

  async function revokeDraft(id: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.draft.revoke(id);
    const draft = drafts.value.find((d) => d.id === id);
    if (draft) draft.status = 'editing';
  }

  async function duplicateDraft(id: string): Promise<Draft | null> {
    if (!window.matrixflow) return null;
    const draft = drafts.value.find((d) => d.id === id) || await getDraft(id);
    if (!draft) return null;
    const snapshot = JSON.parse(JSON.stringify(draft.snapshotJson || {})) as Record<string, unknown>;
    snapshot.title = `${draft.title || snapshot.title || '未命名草稿'} 副本`;
    const result = await window.matrixflow.draft.save(snapshot) as any;
    const duplicated = result?.success ? result.data : result;
    if (duplicated) {
      drafts.value.unshift(duplicated);
      return duplicated;
    }
    return null;
  }

  function getPlatformConfig(draftId: string, platform: string) {
    const draft = drafts.value.find((d) => d.id === draftId);
    const configs = draft?.snapshotJson?.platformConfigs;
    return Array.isArray(configs)
      ? configs.find((config: any) => config.platform === platform) ?? null
      : null;
  }

  return {
    drafts, loading, filter, filterStatus,
    editingDrafts, readyDrafts, publishedDrafts,
    fetchDrafts, loadDrafts, getDraft, saveDraft, updateDraft, deleteDraft,
    duplicateDraft, getPlatformConfig, publishDraft, revokeDraft,
  };
});
