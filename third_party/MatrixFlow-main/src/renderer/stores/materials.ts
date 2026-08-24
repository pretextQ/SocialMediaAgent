import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Material {
  id: string;
  type: 'image' | 'video' | 'article';
  title: string;
  description?: string;
  filePath: string;
  fileSize: number;
  thumbnailPath?: string;
  platform?: string;
  groupId?: string;
  metadata?: Record<string, unknown>;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialGroup {
  id: string;
  name: string;
  color?: string;
  count: number;
  createdAt: string;
}

export interface UploadProgress {
  id: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
}

export const useMaterialsStore = defineStore('materials', () => {
  const materials = ref<Material[]>([]);
  const groups = ref<MaterialGroup[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedIds = ref<Set<string>>(new Set());
  const uploadQueue = ref<UploadProgress[]>([]);
  const currentGroupId = ref<string | null>(null);
  const searchQuery = ref('');

  const filteredMaterials = computed(() => {
    let result = materials.value;
    if (currentGroupId.value) {
      result = result.filter(m => m.groupId === currentGroupId.value);
    }
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(m =>
        m.title.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query)
      );
    }
    return result;
  });

  const selectedMaterials = computed(() =>
    materials.value.filter(m => selectedIds.value.has(m.id))
  );

  const totalSize = computed(() =>
    materials.value.length
  );

  async function fetchMaterials() {
    if (!window.matrixflow) return;
    loading.value = true;
    error.value = null;
    try {
      const result = await window.matrixflow.material.list();
      if (result.success && result.data) {
        materials.value = result.data.items as Material[];
      } else {
        error.value = result.message || '获取素材列表失败';
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchGroups() {
    if (!window.matrixflow) return;
    try {
      const result = await window.matrixflow.materialGroup.list();
      if (result.success && result.data) {
        groups.value = result.data as MaterialGroup[];
      }
    } catch (e) {
      console.error('Failed to fetch groups:', e);
    }
  }

  async function uploadMaterial(filePath: string, groupId?: string, title?: string, description?: string) {
    if (!window.matrixflow) return null;
    try {
      const result = await window.matrixflow.material.upload(filePath, groupId, title, description);
      if (result.success && result.data) {
        materials.value.unshift(result.data as Material);
        return result.data;
      }
      return null;
    } catch (e) {
      console.error('Upload failed:', e);
      return null;
    }
  }

  async function deleteMaterial(id: string) {
    if (!window.matrixflow) return false;
    try {
      const result = await window.matrixflow.material.delete(id);
      if (result.success) {
        materials.value = materials.value.filter(m => m.id !== id);
        selectedIds.value.delete(id);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Delete failed:', e);
      return false;
    }
  }

  async function batchDelete(ids: string[]) {
    if (!window.matrixflow) return { success: 0, failed: 0 };
    try {
      const result = await window.matrixflow.material.batchDelete(ids);
      if (result.success && result.data) {
        const { success, failed } = result.data;
        materials.value = materials.value.filter(m => !success.includes(m.id));
        success.forEach(id => selectedIds.value.delete(id));
        return { success: success.length, failed: failed.length };
      }
      return { success: 0, failed: ids.length };
    } catch (e) {
      console.error('Batch delete failed:', e);
      return { success: 0, failed: ids.length };
    }
  }

  async function downloadMaterials(ids: string[], targetDir: string) {
    if (!window.matrixflow) return false;
    try {
      const result = await window.matrixflow.material.download(ids, targetDir);
      return result.success;
    } catch (e) {
      console.error('Download failed:', e);
      return false;
    }
  }

  async function moveToGroup(ids: string[], groupId: string | null) {
    if (!window.matrixflow) return { success: 0, failed: 0 };
    try {
      const result = await window.matrixflow.material.moveToGroup(ids, groupId);
      if (result.success && result.data) {
        const { success, failed } = result.data;
        success.forEach((id: string) => {
          const material = materials.value.find(m => m.id === id);
          if (material) {
            material.groupId = groupId || undefined;
          }
        });
        return { success: success.length, failed: failed.length };
      }
      return { success: 0, failed: ids.length };
    } catch (e) {
      console.error('Move to group failed:', e);
      return { success: 0, failed: ids.length };
    }
  }

  async function createGroup(name: string, color?: string) {
    if (!window.matrixflow) return null;
    try {
      const result = await window.matrixflow.materialGroup.create(name, color);
      if (result.success && result.data) {
        groups.value.push(result.data as MaterialGroup);
        return result.data;
      }
      return null;
    } catch (e) {
      console.error('Create group failed:', e);
      return null;
    }
  }

  async function deleteGroup(id: string) {
    if (!window.matrixflow) return false;
    try {
      const result = await window.matrixflow.materialGroup.delete(id);
      if (result.success) {
        groups.value = groups.value.filter(g => g.id !== id);
        if (currentGroupId.value === id) {
          currentGroupId.value = null;
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error('Delete group failed:', e);
      return false;
    }
  }

  function selectMaterial(id: string, selected: boolean) {
    if (selected) {
      selectedIds.value.add(id);
    } else {
      selectedIds.value.delete(id);
    }
  }

  function selectAll() {
    filteredMaterials.value.forEach(m => selectedIds.value.add(m.id));
  }

  function clearSelection() {
    selectedIds.value.clear();
  }

  function setGroupFilter(groupId: string | null) {
    currentGroupId.value = groupId;
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query;
  }

  function setupUploadListener() {
    if (!window.matrixflow) return () => {};
    return window.matrixflow.on('material:upload-progress', (data: unknown) => {
      const { id, progress, status, error } = data as UploadProgress;
      const item = uploadQueue.value.find(u => u.id === id);
      if (item) {
        item.progress = progress;
        item.status = status;
        if (error) item.error = error;
      }
    });
  }

  return {
    materials,
    groups,
    loading,
    error,
    selectedIds,
    uploadQueue,
    currentGroupId,
    searchQuery,
    filteredMaterials,
    selectedMaterials,
    totalSize,
    fetchMaterials,
    fetchGroups,
    uploadMaterial,
    deleteMaterial,
    batchDelete,
    downloadMaterials,
    moveToGroup,
    createGroup,
    deleteGroup,
    selectMaterial,
    selectAll,
    clearSelection,
    setGroupFilter,
    setSearchQuery,
    setupUploadListener,
  };
});
