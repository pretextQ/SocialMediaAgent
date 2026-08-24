<template>
  <div class="task-table">
    <!-- Group Mode -->
    <template v-if="mode === 'group'">
      <div class="task-table__header">
        <span class="task-table__count">
          本页 {{ taskStore.groupedTasks.length }} 个发布内容 / 共 {{ groupTotal }} 个发布内容
        </span>
      </div>
      <el-table :data="taskStore.groupedTasks" v-loading="taskStore.loading" stripe border
        @row-click="onGroupRowClick"
        @selection-change="onGroupSelectionChange"
        ref="tableRef">
        <el-table-column type="selection" width="45" />
        <el-table-column label="内容预览" min-width="240">
          <template #default="{ row }">
            <div class="task-table__content-cell">
              <div class="task-table__cover">
                <img
                  v-show="row.coverUrl"
                  :src="normalizeCoverUrl(row.coverUrl)"
                  class="task-table__cover-img"
                  @error="onImgError"
                />
                <el-icon v-show="!row.coverUrl" :size="20"><VideoCameraFilled /></el-icon>
              </div>
              <div class="task-table__content-info">
                <span class="task-table__title">{{ row.title }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发布账号" min-width="200">
          <template #default="{ row }">
            <div class="task-table__accounts">
              <span v-for="(acc, i) in row.accounts" :key="i" class="task-table__account-tag">
                <span class="task-table__platform-dot" :class="acc.platform"></span>
                <span class="task-table__platform-name">{{ platformLabel(acc.platform) }}</span>
                <span class="task-table__account-name">{{ acc.accountName || '-' }}</span>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">
            <span class="task-table__time">{{ formatTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending' || row.status === 'failed'"
              size="small" type="primary" link
              @click.stop="onGroupExecute(row)"
            >{{ row.status === 'failed' ? '重新执行' : '执行发布' }}</el-button>
            <el-button
              v-if="row.status === 'failed' || row.status === 'completed'"
              size="small" type="success" link
              @click.stop="handleRepublish(row.subTasks[0])"
            >重新发布</el-button>
            <el-button size="small" link @click.stop="onGroupRowClick(row)">详情</el-button>
            <el-button size="small" type="danger" link @click.stop="onGroupDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Task Mode (default) -->
    <template v-else>
      <div class="task-table__header">
        <span class="task-table__count">
          本页 {{ taskStore.tasks.length }} 个发布任务 / 共 {{ groupTotal }} 个发布任务
        </span>
      </div>
      <el-table :data="taskStore.tasks" v-loading="taskStore.loading" stripe border
        @row-click="onTaskRowClick"
        @selection-change="onTaskSelectionChange"
        ref="tableRef">
        <el-table-column type="selection" width="45" />
        <el-table-column label="平台" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'failed' ? 'danger' : ''">
              {{ platformLabel(row.platform) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="accountName" label="账号" width="110" show-overflow-tooltip />
        <el-table-column label="内容" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="task-table__content-title">{{ row.contentTitle || row.title || '无标题' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="错误信息" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.message" class="task-table__error">{{ row.message }}</span>
            <span v-else class="task-table__none">-</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="145">
          <template #default="{ row }">
            <span class="task-table__time">{{ formatTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending' || row.status === 'scheduled' || row.status === 'failed'"
              size="small" type="primary" link
              @click.stop="onTaskExecute(row)"
            >{{ row.status === 'failed' ? '重试' : '执行' }}</el-button>
            <el-button
              v-if="row.status === 'failed' || row.status === 'completed'"
              size="small" type="success" link
              @click.stop="handleRepublish(row)"
            >重新发布</el-button>
            <el-button size="small" link @click.stop="onTaskRowClick(row)">详情</el-button>
            <el-button
              v-if="row.status !== 'running'"
              size="small" type="danger" link
              @click.stop="onTaskDelete(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useTaskStore } from '@/renderer/stores/task';
import type { TaskStatus, GroupedTask, Task } from '@/renderer/stores/task';
import { ElMessageBox, ElMessage } from 'element-plus';
import { VideoCameraFilled } from '@element-plus/icons-vue';

const taskStore = useTaskStore();

const props = defineProps<{
  mode?: 'task' | 'group';
  groupTotal: number;
}>();

const emit = defineEmits<{
  (e: 'detail', task: Task): void;
  (e: 'execute', task: Task): void;
  (e: 'delete', task: Task): void;
}>();

const mode = props.mode ?? 'task';

// ── Task Mode ──
function onTaskRowClick(row: Task) {
  emit('detail', row);
}

function onTaskExecute(row: Task) {
  emit('execute', row);
}

function onTaskSelectionChange(rows: Task[]) {
  taskStore.clearSelection();
  for (const row of rows) {
    taskStore.toggleSelect(row.id);
  }
}

async function onTaskDelete(row: Task) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.contentTitle || row.title || '无标题'}」在「${row.accountName || row.platform}」的发布任务？`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', confirmButtonClass: 'el-button--danger' },
    );
    emit('delete', row);
  } catch {
    // cancelled
  }
}

async function handleRepublish(row: Task) {
  try {
    await taskStore.republishTask(row.id);
    ElMessage.success('重新发布任务已创建');
  } catch (e: any) {
    ElMessage.error(e?.message || '重新发布失败');
  }
}

// ── Group Mode ──
function onGroupRowClick(row: GroupedTask) {
  emit('detail', row as unknown as Task);
}

function onGroupExecute(row: GroupedTask) {
  const next = row.subTasks.find(t => t.status === 'pending' || t.status === 'failed');
  if (next) emit('execute', next);
}

function onGroupSelectionChange(rows: GroupedTask[]) {
  taskStore.clearSelection();
  for (const row of rows) {
    for (const sub of row.subTasks) {
      taskStore.toggleSelect(sub.id);
    }
  }
}

async function onGroupDelete(row: GroupedTask) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.title}」的所有发布任务？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', confirmButtonClass: 'el-button--danger' },
    );
    for (const sub of row.subTasks) {
      emit('delete', sub);
    }
  } catch {
    // cancelled
  }
}

// ── Helpers ──
function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

function normalizeCoverUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('local-file://')) return url;
  return `local-file://${url}`;
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    bilibili: 'B站',
    channels: '视频号',
    kuaishou: '快手',
  };
  return labels[platform] || platform;
}

function statusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    pending: '待执行',
    scheduled: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    skipped: '已跳过',
  };
  return labels[status] || status;
}

function statusTagType(status: TaskStatus): '' | 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<TaskStatus, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    pending: 'info',
    scheduled: 'info',
    running: 'warning',
    completed: 'success',
    failed: 'danger',
    cancelled: 'info',
    skipped: 'info',
  };
  return types[status] || '';
}

function formatTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style scoped>
.task-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-card);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.task-table__header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-light);
}

.task-table__count {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.task-table__content-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.task-table__cover {
  width: 48px;
  height: 48px;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  color: var(--color-text-placeholder);
}

.task-table__cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-table__content-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.task-table__title {
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-table__content-title {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.task-table__accounts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.task-table__account-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  background: var(--color-bg-page);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-regular);
}

.task-table__platform-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-table__platform-dot.douyin { background: var(--color-plat-douyin); }
.task-table__platform-dot.xiaohongshu { background: var(--color-plat-xiaohongshu); }
.task-table__platform-dot.bilibili { background: var(--color-plat-bilibili); }
.task-table__platform-dot.channels { background: var(--color-plat-wechat); }
.task-table__platform-dot.kuaishou { background: var(--color-plat-kuaishou); }

.task-table__platform-name {
  color: var(--color-text-secondary);
}

.task-table__account-name {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.task-table__time {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.task-table__error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.task-table__none {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.task-table :deep(.el-table) {
  --el-table-border-color: var(--color-border);
  --el-table-header-bg-color: var(--color-bg-page);
  --el-table-row-hover-bg-color: var(--color-primary-lighter);
}

.task-table :deep(.el-table__header th) {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.task-table :deep(.el-table__row) {
  cursor: pointer;
}

.task-table :deep(.el-tag) {
  --el-tag-border-radius: var(--radius-full);
}

.task-table :deep(.el-tag--success) {
  --el-tag-bg-color: var(--color-success-light);
  --el-tag-text-color: var(--color-success);
  --el-tag-border-color: transparent;
}

.task-table :deep(.el-tag--warning) {
  --el-tag-bg-color: var(--color-warning-light);
  --el-tag-text-color: var(--color-warning);
  --el-tag-border-color: transparent;
}

.task-table :deep(.el-tag--danger) {
  --el-tag-bg-color: var(--color-danger-light);
  --el-tag-text-color: var(--color-danger);
  --el-tag-border-color: transparent;
}

.task-table :deep(.el-tag--info) {
  --el-tag-bg-color: var(--color-primary-lighter);
  --el-tag-text-color: var(--color-primary);
  --el-tag-border-color: transparent;
}
</style>
