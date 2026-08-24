<template>
  <transition name="slide-up">
    <div v-if="selectedCount > 0" class="batch-action-bar">
      <div class="batch-action-bar__info">
        <el-checkbox :model-value="true" @change="handleClearSelection" />
        <span>已选择 {{ selectedCount }} 项</span>
      </div>

      <div class="batch-action-bar__actions">
        <el-button size="small" @click="handleDownload">
          <el-icon><Download /></el-icon>
          下载
        </el-button>
        <el-button size="small" @click="handleMove">
          <el-icon><FolderOpened /></el-icon>
          移动
        </el-button>
        <el-button type="danger" size="small" @click="handleDelete">
          <el-icon><Delete /></el-icon>
          删除
        </el-button>
      </div>

      <el-dialog v-model="showMoveDialog" title="移动到分组" width="400px">
        <el-select v-model="targetGroupId" placeholder="选择目标分组" style="width: 100%">
          <el-option label="不分组" value="" />
          <el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
        <template #footer>
          <el-button @click="showMoveDialog = false">取消</el-button>
          <el-button type="primary" @click="confirmMove">确定</el-button>
        </template>
      </el-dialog>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, FolderOpened, Delete } from '@element-plus/icons-vue';
import type { MaterialGroup } from '../../stores/materials';

const props = defineProps<{
  selectedCount: number;
  groups: MaterialGroup[];
}>();

const emit = defineEmits<{
  clearSelection: [];
  download: [];
  move: [groupId: string | null];
  delete: [];
}>();

const showMoveDialog = ref(false);
const targetGroupId = ref('');

function handleClearSelection() {
  emit('clearSelection');
}

function handleDownload() {
  emit('download');
}

function handleMove() {
  showMoveDialog.value = true;
}

function confirmMove() {
  emit('move', targetGroupId.value || null);
  showMoveDialog.value = false;
  targetGroupId.value = '';
}

function handleDelete() {
  ElMessageBox.confirm(
    `确定删除选中的 ${props.selectedCount} 个素材吗？`,
    '批量删除',
    { type: 'warning' }
  ).then(() => {
    emit('delete');
  }).catch(() => {});
}
</script>

<style scoped>
.batch-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.batch-action-bar__info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.batch-action-bar__actions {
  display: flex;
  gap: 8px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
