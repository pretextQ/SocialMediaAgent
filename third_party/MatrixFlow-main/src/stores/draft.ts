import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface Draft {
  id: string;
  type: 'video' | 'image';
  title: string;
  description?: string;
  coverPath?: string;
  filePath?: string;
  platformConfigs: Record<string, unknown>;
  status: 'draft' | 'ready';
  createdAt: Date;
  updatedAt: Date;
}

function toSnapshot(data: Partial<Draft>) {
  return {
    materialId: data.filePath || data.title || `draft_${Date.now()}`,
    materialPath: data.filePath || '',
    coverPath: data.coverPath || '',
    title: data.title || '',
    description: data.description || '',
    platformConfigs: Array.isArray(data.platformConfigs) ? data.platformConfigs : [],
  };
}

export const useDraftStore = defineStore('draft', () => {
  const drafts = ref<Draft[]>([]);
  const loading = ref(false);
  const filterStatus = ref<'draft' | 'ready' | ''>('');

  async function loadDrafts() {
    loading.value = true;
    try {
      const result = await window.matrixflow.draft.list(filterStatus.value || undefined);
      if (result.success && result.data) {
        drafts.value = result.data;
      }
    } finally {
      loading.value = false;
    }
  }

  async function createDraft(data: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'>): Promise<Draft | null> {
    const result = await window.matrixflow.draft.save(toSnapshot(data));
    if (result.success && result.data) {
      drafts.value.unshift(result.data);
      return result.data;
    }
    return null;
  }

  async function updateDraft(id: string, updates: Partial<Draft>): Promise<Draft | null> {
    const current = drafts.value.find((d) => d.id === id);
    const result = await window.matrixflow.draft.save(toSnapshot({ ...current, ...updates }), id);
    if (result.success && result.data) {
      const index = drafts.value.findIndex((d) => d.id === id);
      if (index !== -1) {
        drafts.value[index] = result.data;
      }
      return result.data;
    }
    return null;
  }

  async function deleteDraft(id: string): Promise<boolean> {
    const result = await window.matrixflow.draft.delete(id);
    if (result.success) {
      drafts.value = drafts.value.filter((d) => d.id !== id);
      return true;
    }
    return false;
  }

  async function duplicateDraft(id: string): Promise<Draft | null> {
    const current = drafts.value.find((d) => d.id === id);
    if (!current) return null;
    const result = await window.matrixflow.draft.save(toSnapshot({
      ...current,
      title: `${current.title} 副本`,
    }));
    if (result.success && result.data) {
      drafts.value.unshift(result.data);
      return result.data;
    }
    return null;
  }

  function getPlatformConfig(draftId: string, platform: string) {
    const draft = drafts.value.find((d) => d.id === draftId);
    return draft?.platformConfigs[platform] ?? null;
  }

  return {
    drafts,
    loading,
    filterStatus,
    loadDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
    duplicateDraft,
    getPlatformConfig,
  };
});
