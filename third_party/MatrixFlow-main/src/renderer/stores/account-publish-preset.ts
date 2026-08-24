import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PublishPreset {
  accountId: string;
  platform: string;
  defaultTopics: string[];
  platformOptions: Record<string, unknown>;
  enabled: boolean;
  updatedAt?: string;
}

export interface SavePublishPresetInput {
  accountId: string;
  platform: string;
  defaultTopics: string[];
  platformOptions: Record<string, unknown>;
  enabled: boolean;
}

function unwrap<T>(res: any): T {
  if (res && typeof res === 'object' && 'success' in res) {
    if (!res.success) throw new Error(res.message || 'IPC 调用失败');
    return res.data as T;
  }
  return res as T;
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useAccountPublishPresetStore = defineStore('accountPublishPreset', () => {
  const loading = ref(false);

  async function getPreset(accountId: string, platform: string): Promise<PublishPreset | null> {
    if (!window.matrixflow?.accountPublishPreset) return null;
    const res = await window.matrixflow.accountPublishPreset.get(accountId, platform);
    return unwrap<PublishPreset | null>(res);
  }

  async function listPresets(accountId: string): Promise<PublishPreset[]> {
    if (!window.matrixflow?.accountPublishPreset) return [];
    const res = await window.matrixflow.accountPublishPreset.list(accountId);
    return unwrap<PublishPreset[]>(res) || [];
  }

  async function savePreset(input: SavePublishPresetInput): Promise<PublishPreset> {
    if (!window.matrixflow?.accountPublishPreset) {
      throw new Error('IPC 不可用');
    }
    loading.value = true;
    try {
      const res = await window.matrixflow.accountPublishPreset.save(toPlain(input));
      return unwrap<PublishPreset>(res);
    } finally {
      loading.value = false;
    }
  }

  async function removePreset(accountId: string, platform: string): Promise<boolean> {
    if (!window.matrixflow?.accountPublishPreset) return false;
    const res = await window.matrixflow.accountPublishPreset.remove(accountId, platform);
    const data = unwrap<boolean>(res);
    return Boolean(data);
  }

  return {
    loading,
    getPreset,
    listPresets,
    savePreset,
    removePreset,
  };
});
