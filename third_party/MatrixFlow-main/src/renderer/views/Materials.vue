<template>
  <div class="page-materials">
    <div class="page-materials__split">
      <GroupSidebar
        :groups="store.groups"
        :current-group-id="store.currentGroupId"
        :total-count="store.materials.length"
        @select="handleGroupSelect"
        @create="handleGroupCreate"
        @delete="handleGroupDelete"
      />

      <div class="page-materials__main">
        <div class="page-materials__toolbar">
          <div class="page-materials__filter-bar">
            <el-input
              v-model="searchQuery"
              placeholder="搜索素材..."
              prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
              @input="handleSearch"
            />
            <el-radio-group v-model="typeFilter" size="small">
              <el-radio-button value="">全部</el-radio-button>
              <el-radio-button value="image">图片</el-radio-button>
              <el-radio-button value="video">视频</el-radio-button>
            </el-radio-group>
          </div>

          <div class="page-materials__toolbar-actions">
            <el-button type="primary" size="small" @click="uploadDialogVisible = true">
              <el-icon><Upload /></el-icon>
              上传素材
            </el-button>
          </div>
        </div>

        <div class="page-materials__content">
          <Loading v-if="store.loading" />
          <Empty
            v-else-if="filteredMaterials.length === 0"
            text="暂无素材"
            action-label="上传素材"
            @action="uploadDialogVisible = true"
          />
          <div v-else class="page-materials__grid">
            <MaterialCard
              v-for="material in filteredMaterials"
              :key="material.id"
              :material="material"
              :selected="store.selectedIds.has(material.id)"
              @select="handleSelect"
              @preview="handlePreview"
              @delete="handleDelete"
            />
          </div>
        </div>
      </div>
    </div>

    <BatchActionBar
      :selected-count="store.selectedIds.size"
      :groups="store.groups"
      @clear-selection="store.clearSelection"
      @download="handleBatchDownload"
      @move="handleBatchMove"
      @delete="handleBatchDelete"
    />

    <UploadDialog
      v-model="uploadDialogVisible"
      :groups="store.groups"
      :current-group-id="store.currentGroupId"
      @upload="handleUpload"
    />

    <MaterialPreviewDialog
      v-model:visible="previewVisible"
      :material="previewMaterial"
      :materials="filteredMaterials"
      :current-index="previewIndex"
      @error="handlePreviewError"
      @navigate="handleNavigate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload } from '@element-plus/icons-vue';
import { useMaterialsStore } from '../stores/materials';
import GroupSidebar from '../components/materials/GroupSidebar.vue';
import MaterialCard from '../components/materials/MaterialCard.vue';
import MaterialPreviewDialog from '../components/materials/MaterialPreviewDialog.vue';
import BatchActionBar from '../components/materials/BatchActionBar.vue';
import UploadDialog from '../components/materials/UploadDialog.vue';
import Loading from '../components/common/Loading.vue';
import Empty from '../components/common/Empty.vue';
import type { Material } from '../stores/materials';

const store = useMaterialsStore();

const searchQuery = ref('');
const typeFilter = ref('');
const uploadDialogVisible = ref(false);
const previewVisible = ref(false);
const previewMaterial = ref<Material | null>(null);
const previewIndex = ref(0);

const filteredMaterials = computed(() => {
  let result = store.filteredMaterials;
  if (typeFilter.value) {
    result = result.filter(m => m.type === typeFilter.value);
  }
  return result;
});

function handleGroupSelect(groupId: string | null) {
  store.setGroupFilter(groupId);
}

async function handleGroupCreate(name: string, color?: string) {
  const result = await store.createGroup(name, color);
  if (result) {
    ElMessage.success('分组创建成功');
  }
}

async function handleGroupDelete(id: string) {
  const success = await store.deleteGroup(id);
  if (success) {
    ElMessage.success('分组删除成功');
  }
}

function handleSearch(query: string) {
  store.setSearchQuery(query);
}

function handleSelect(id: string, selected: boolean) {
  store.selectMaterial(id, selected);
}

function handlePreview(material: Material) {
  previewMaterial.value = material;
  previewIndex.value = filteredMaterials.value.findIndex(m => m.id === material.id);
  previewVisible.value = true;
}

function handleNavigate(index: number) {
  const target = filteredMaterials.value[index];
  if (target) {
    previewMaterial.value = target;
    previewIndex.value = index;
  }
}

function handlePreviewError() {
  ElMessage.error('无法加载素材文件，请检查文件是否存在');
}

async function handleDelete(id: string) {
  const success = await store.deleteMaterial(id);
  if (success) {
    ElMessage.success('删除成功');
  }
}

async function handleUpload(payload: { filePath: string; groupId?: string; title?: string; description?: string }) {
  const result = await store.uploadMaterial(payload.filePath, payload.groupId, payload.title, payload.description);
  if (result) {
    ElMessage.success('上传成功');
    await store.fetchMaterials();
    await store.fetchGroups();
  }
}

async function handleBatchDownload() {
  ElMessage.info('批量下载功能开发中');
}

async function handleBatchMove(groupId: string | null) {
  const ids = Array.from(store.selectedIds);
  const result = await store.moveToGroup(ids, groupId);
  ElMessage.success(`成功移动 ${result.success} 个素材${result.failed > 0 ? `，${result.failed} 个失败` : ''}`);
  store.clearSelection();
  await store.fetchGroups();
}

async function handleBatchDelete() {
  const ids = Array.from(store.selectedIds);
  const result = await store.batchDelete(ids);
  ElMessage.success(`成功删除 ${result.success} 个素材${result.failed > 0 ? `，${result.failed} 个失败` : ''}`);
  store.clearSelection();
}

onMounted(async () => {
  await Promise.all([
    store.fetchMaterials(),
    store.fetchGroups(),
  ]);
});

onUnmounted(() => {
  store.clearSelection();
});
</script>

<style scoped>
.page-materials {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-materials__split {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.page-materials__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-materials__toolbar {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
}

.page-materials__filter-bar {
  display: flex;
  gap: 16px;
  align-items: center;
}

.search-input {
  width: 240px;
}

.page-materials__content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.page-materials__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
</style>
