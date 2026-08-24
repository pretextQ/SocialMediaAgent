<template>
  <el-drawer v-model="visible" title="发布详情" direction="rtl" size="460px"
    :before-close="onClose">
    <div v-if="task" class="drawer-body">
      <div class="drawer-cover" v-if="task.coverUrl">
        <img :src="normalizeCoverUrl(task.coverUrl)" class="drawer-cover__img" @error="onImgError" />
      </div>

      <div class="drawer-section">
        <h4 class="drawer-section__title">任务信息</h4>
        <div class="drawer-row">
          <span class="label">内容</span>
          <span class="value">{{ task.contentTitle || task.title || '无标题' }}</span>
        </div>
        <div v-if="task.description" class="drawer-row">
          <span class="label">描述</span>
          <span class="value">{{ task.description }}</span>
        </div>
        <div v-if="task.tags?.length" class="drawer-row">
          <span class="label">标签</span>
          <span class="value">{{ task.tags.join('、') }}</span>
        </div>
        <div class="drawer-row">
          <span class="label">平台</span>
          <span class="value">
            <span class="drawer-subtask__platform-dot" :class="task.platform" style="display:inline-block"></span>
            {{ platformLabel(task.platform) }}
          </span>
        </div>
        <div class="drawer-row">
          <span class="label">账号</span>
          <span class="value">{{ task.accountName || task.accountId }}</span>
        </div>
        <div class="drawer-row">
          <span class="label">状态</span>
          <span class="value">
            <el-tag size="small" :type="statusTagType(task.status)">{{ statusLabel(task.status) }}</el-tag>
          </span>
        </div>
        <div class="drawer-row">
          <span class="label">创建时间</span>
          <span class="value">{{ formatTime(task.createdAt) }}</span>
        </div>
        <div v-if="task.scheduledAt" class="drawer-row">
          <span class="label">定时时间</span>
          <span class="value">{{ formatTime(task.scheduledAt) }}</span>
        </div>
        <div v-if="task.startedAt" class="drawer-row">
          <span class="label">开始时间</span>
          <span class="value">{{ formatTime(task.startedAt) }}</span>
        </div>
        <div v-if="task.completedAt" class="drawer-row">
          <span class="label">完成时间</span>
          <span class="value">{{ formatTime(task.completedAt) }}</span>
        </div>
        <div v-if="task.durationMs" class="drawer-row">
          <span class="label">耗时</span>
          <span class="value">{{ formatDuration(task.durationMs) }}</span>
        </div>
        <div class="drawer-row">
          <span class="label">重试次数</span>
          <span class="value">{{ task.retryCount }}</span>
        </div>
        <div v-if="task.errorCode" class="drawer-row">
          <span class="label">错误码</span>
          <span class="value">{{ task.errorCode }}</span>
        </div>
      </div>

      <div v-if="task.status === 'failed' && task.message" class="drawer-section">
        <h4 class="drawer-section__title">错误信息</h4>
        <div class="drawer-error">{{ task.message }}</div>
      </div>

      <div class="drawer-section">
        <el-button
          v-if="task.status === 'pending' || task.status === 'scheduled' || task.status === 'failed'"
          type="primary"
          @click="onExecute(task.id)"
        >{{ task.status === 'failed' ? '重试' : '立即执行' }}</el-button>
        <el-button
          v-if="task.status === 'running'"
          type="danger"
          @click="onCancel(task.id)"
        >取消任务</el-button>
      </div>
    </div>
    <el-empty v-else description="无数据" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useTaskStore } from '@/renderer/stores/task';
import type { Task, TaskStatus } from '@/renderer/stores/task';

const taskStore = useTaskStore();

const props = defineProps<{
  modelValue: boolean;
  task: Task | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

function onClose(done: () => void) {
  done();
}

function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

function normalizeCoverUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('local-file://')) return url;
  return `local-file://${url}`;
}

async function onExecute(taskId: string) {
  try {
    await taskStore.retryTask(taskId);
    ElMessage.success('已提交执行');
    setTimeout(() => taskStore.fetchTasks(), 1000);
  } catch {
    ElMessage.error('执行失败');
  }
}

async function onCancel(taskId: string) {
  try {
    await ElMessageBox.confirm('确定取消该任务？', '取消确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await taskStore.cancelTask(taskId);
    ElMessage.success('任务已取消');
  } catch {
    // cancelled
  }
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms} 毫秒`;
  return `${(ms / 1000).toFixed(1)} 秒`;
}
</script>

<style scoped>
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

.drawer-cover {
  margin-bottom: var(--space-4);
  border-radius: var(--radius-lg);
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: var(--color-bg-page);
}

.drawer-cover__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drawer-section {
  margin-bottom: var(--space-6);
}

.drawer-section__title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-placeholder);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.drawer-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--color-border-light);
}

.drawer-row .label {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.drawer-row .value {
  font-weight: var(--font-weight-medium);
  text-align: right;
  word-break: break-all;
}

.drawer-subtask__platform-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.drawer-subtask__platform-dot.douyin { background: var(--color-plat-douyin); }
.drawer-subtask__platform-dot.xiaohongshu { background: var(--color-plat-xiaohongshu); }
.drawer-subtask__platform-dot.bilibili { background: var(--color-plat-bilibili); }
.drawer-subtask__platform-dot.channels { background: var(--color-plat-wechat); }
.drawer-subtask__platform-dot.kuaishou { background: var(--color-plat-kuaishou); }

.drawer-error {
  padding: var(--space-3);
  background: var(--color-danger-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  font-family: var(--font-family-mono);
  word-break: break-all;
  white-space: pre-wrap;
}

:deep(.el-tag) {
  --el-tag-border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-base);
}

:deep(.el-tag--success) {
  --el-tag-bg-color: var(--color-success-light);
  --el-tag-text-color: var(--color-success);
}

:deep(.el-tag--warning) {
  --el-tag-bg-color: var(--color-warning-light);
  --el-tag-text-color: var(--color-warning);
}

:deep(.el-tag--danger) {
  --el-tag-bg-color: var(--color-danger-light);
  --el-tag-text-color: var(--color-danger);
}

:deep(.el-tag--info) {
  --el-tag-bg-color: var(--color-primary-lighter);
  --el-tag-text-color: var(--color-primary);
}
</style>
