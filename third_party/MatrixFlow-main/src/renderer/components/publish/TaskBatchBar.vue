<template>
  <div v-if="taskStore.selectedCount > 0" class="task-batch-bar">
    <span class="selected-text">已选 {{ taskStore.selectedCount }} 项</span>
    <div class="batch-actions">
      <el-button size="small" @click="handleBatchRetry" :loading="loading">
        批量重试
      </el-button>
      <el-button size="small" type="danger" @click="handleBatchCancel" :loading="loading">
        批量取消
      </el-button>
      <el-button size="small" @click="handleBatchSkip" :loading="loading">
        批量跳过
      </el-button>
      <el-button size="small" type="danger" @click="handleBatchDelete" :loading="loading">
        批量删除
      </el-button>
      <el-button size="small" @click="taskStore.clearSelection">
        清除选择
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useTaskStore } from '@/renderer/stores/task';

const taskStore = useTaskStore();
const loading = ref(false);

async function handleBatchRetry() {
  loading.value = true;
  try {
    await taskStore.batchRetry();
    ElMessage.success('批量重试已提交');
  } catch {
    ElMessage.error('批量重试失败');
  } finally {
    loading.value = false;
  }
}

async function handleBatchCancel() {
  loading.value = true;
  try {
    await taskStore.batchCancel();
    ElMessage.success('批量取消成功');
  } catch {
    ElMessage.error('批量取消失败');
  } finally {
    loading.value = false;
  }
}

async function handleBatchSkip() {
  loading.value = true;
  try {
    const ids = [...taskStore.selectedIds];
    for (const id of ids) {
      await taskStore.cancelTask(id);
    }
    taskStore.clearSelection();
    ElMessage.success('批量跳过成功');
  } catch {
    ElMessage.error('批量跳过失败');
  } finally {
    loading.value = false;
  }
}

async function handleBatchDelete() {
  loading.value = true;
  try {
    await ElMessageBox.confirm(
      `确定删除已选的 ${taskStore.selectedCount} 项任务？此操作不可恢复。`,
      '批量删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', confirmButtonClass: 'el-button--danger' },
    );
    await taskStore.batchDelete();
    ElMessage.success('批量删除成功');
    await taskStore.fetchTasks();
  } catch (e: any) {
    if (e !== 'cancel' && e?.toString() !== 'cancel') {
      ElMessage.error('批量删除失败');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.task-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--color-primary-lighter);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-primary-light);
}

.selected-text {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.batch-actions {
  display: flex;
  gap: var(--space-2);
}

:deep(.el-button) {
  --el-button-border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
}

:deep(.el-button--small) {
  font-size: var(--font-size-sm);
  padding: var(--space-1) var(--space-3);
}
</style>