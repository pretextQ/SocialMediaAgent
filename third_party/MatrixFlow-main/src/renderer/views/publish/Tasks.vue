<template>
  <div class="page-tasks">
    <!-- 发布子导航 -->
    <nav class="page-tasks__tabs">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="page-tasks__tab"
        :class="{ 'page-tasks__tab--active': isActive(item.path) }"
      >
        <el-icon :size="15"><component :is="item.icon" /></el-icon>
        {{ item.label }}
      </router-link>
    </nav>

    <!-- 工具栏：筛选 + 操作 -->
    <div class="page-tasks__toolbar">
      <TaskFilterBar :plans="plans" @change="onFilterChange" />
    </div>

    <!-- 批量操作栏 -->
    <TaskBatchBar v-if="taskStore.selectedCount > 0" />

    <!-- 统计概览 -->
    <div v-if="taskStore.taskTotal > 0" class="page-tasks__stats">
      <div class="page-tasks__stat-chip">
        <span class="page-tasks__stat-label">任务总数</span>
        <span class="page-tasks__stat-value">{{ taskStore.taskTotal }}</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--pending">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.pending }}</span>
        <span class="page-tasks__stat-label">待执行</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--running">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.running }}</span>
        <span class="page-tasks__stat-label">执行中</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--completed">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.completed }}</span>
        <span class="page-tasks__stat-label">已完成</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--failed">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.failed }}</span>
        <span class="page-tasks__stat-label">失败</span>
      </div>
    </div>

    <!-- 列表区域 -->
    <div class="page-tasks__list">
      <TaskTable
        mode="task"
        :group-total="taskStore.total"
        @detail="onShowDetail"
        @execute="onExecuteTask"
        @delete="onDeleteTask"
      />

      <!-- 空状态 -->
      <div v-if="!taskStore.loading && taskStore.tasks.length === 0" class="page-tasks__empty">
        <el-empty description="暂无发布任务">
          <el-button type="primary" size="small" @click="$router.push('/publish/video')">
            去发布
          </el-button>
        </el-empty>
      </div>

      <!-- 分页 -->
      <div v-if="taskStore.total > 0" class="page-tasks__pagination">
        <span class="page-tasks__pagination-info">
          共 {{ taskStore.total }} 个发布任务
        </span>
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :total="taskStore.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next, jumper"
          background
          small
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </div>

    <TaskDetailDrawer v-model="drawerVisible" :task="selectedTask" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  List, Calendar, Document, VideoCamera,
} from '@element-plus/icons-vue';
import { useTaskStore } from '@/renderer/stores/task';
import type { Task } from '@/renderer/stores/task';
import TaskFilterBar from '@/renderer/components/publish/TaskFilterBar.vue';
import TaskTable from '@/renderer/components/publish/TaskTable.vue';
import TaskDetailDrawer from '@/renderer/components/publish/TaskDetailDrawer.vue';
import TaskBatchBar from '@/renderer/components/publish/TaskBatchBar.vue';

const route = useRoute();
const taskStore = useTaskStore();

const navItems = [
  { path: '/publish/tasks', label: '任务列表', icon: List },
  { path: '/publish/drafts', label: '草稿', icon: Document },
  { path: '/publish/video', label: '视频发布', icon: VideoCamera },
];

function isActive(path: string) {
  return route.path === path;
}

const drawerVisible = ref(false);
const selectedTask = ref<Task | null>(null);
const PAGE_SIZE_KEY = 'matrixflow.publishTasks.pageSize';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function getInitialPageSize(): number {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    if (PAGE_SIZE_OPTIONS.includes(stored)) return stored;
  } catch {
    // localStorage may be unavailable in restricted renderer contexts.
  }
  return taskStore.filter.limit && PAGE_SIZE_OPTIONS.includes(taskStore.filter.limit)
    ? taskStore.filter.limit
    : 20;
}

const pageSize = ref(getInitialPageSize());
const currentPage = ref(
  Math.floor((taskStore.filter.offset || 0) / pageSize.value) + 1,
);
const plans = ref<{ id: string; name: string }[]>([]);

let unlisten: (() => void) | null = null;

onMounted(async () => {
  await fetchCurrentPage();
  unlisten = taskStore.listenIpcEvents();
  await loadPlans();
});

onUnmounted(() => {
  unlisten?.();
});

async function loadPlans() {
  try {
    if (window.matrixflow?.publish?.listPlans) {
      const result = await window.matrixflow.publish.listPlans() as { items: { id: string; name: string }[] };
      if (result?.items) {
        plans.value = result.items;
      }
    }
  } catch {
    plans.value = [];
  }
}

async function fetchCurrentPage() {
  taskStore.filter.limit = pageSize.value;
  taskStore.filter.offset = (currentPage.value - 1) * pageSize.value;
  await taskStore.fetchTasks();

  const lastPage = Math.max(1, Math.ceil(taskStore.total / pageSize.value));
  if (currentPage.value > lastPage) {
    currentPage.value = lastPage;
    taskStore.filter.offset = (lastPage - 1) * pageSize.value;
    await taskStore.fetchTasks();
  }
}

async function onPageChange(page: number) {
  currentPage.value = page;
  taskStore.clearSelection();
  await fetchCurrentPage();
}

async function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  taskStore.clearSelection();
  try {
    window.localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    // Ignore persistence failures; pagination still works for this session.
  }
  await fetchCurrentPage();
}

async function onFilterChange() {
  currentPage.value = 1;
  taskStore.clearSelection();
  await fetchCurrentPage();
}

function onShowDetail(task: Task) {
  selectedTask.value = task;
  drawerVisible.value = true;
}

async function onExecuteTask(task: Task) {
  if (task.status !== 'pending' && task.status !== 'failed') {
    ElMessage.info('当前状态不允许执行');
    return;
  }
  try {
    await taskStore.retryTask(task.id);
    ElMessage.success(`发布成功: ${task.accountName || task.platform}`);
  } catch (error) {
    console.error('执行发布任务失败:', error);
    const message = error instanceof Error ? error.message : '执行发布任务失败';
    ElMessage.error(message);
  }
}

async function onDeleteTask(task: Task) {
  try {
    await taskStore.deleteTask(task.id);
    ElMessage.success('删除成功');
    await fetchCurrentPage();
  } catch {
    ElMessage.error('删除失败（可能正在执行中）');
  }
}

</script>

<style scoped>
.page-tasks {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-page);
}

/* ── 子导航 tab 栏 ── */
.page-tasks__tabs {
  display: flex;
  gap: 0;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-6);
}

.page-tasks__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.page-tasks__tab:hover {
  color: var(--color-primary);
}

.page-tasks__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

/* ── 工具栏 ── */
.page-tasks__toolbar {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
}

/* ── 统计概览 ── */
.page-tasks__stats {
  display: flex;
  gap: var(--space-4);
  padding: 0 var(--space-6) var(--space-3);
}

.page-tasks__stat-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.page-tasks__stat-value {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.page-tasks__stat-label {
  color: var(--color-text-secondary);
}

.page-tasks__stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.page-tasks__stat-chip--pending .page-tasks__stat-dot {
  background: var(--color-info);
}

.page-tasks__stat-chip--running .page-tasks__stat-dot {
  background: var(--color-warning);
}

.page-tasks__stat-chip--completed .page-tasks__stat-dot {
  background: var(--color-success);
}

.page-tasks__stat-chip--failed .page-tasks__stat-dot {
  background: var(--color-danger);
}

/* ── 列表区域 ── */
.page-tasks__list {
  flex: 1;
  min-height: 0;
  padding: 0 var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── 空状态 ── */
.page-tasks__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) 0;
}

/* ── 分页 ── */
.page-tasks__pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-xs);
}

.page-tasks__pagination-info {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.page-tasks__pagination :deep(.el-pagination) {
  --el-pagination-button-bg-color: var(--color-bg-card);
  --el-pagination-button-color: var(--color-text-secondary);
  --el-pagination-hover-color: var(--color-primary);
}

.page-tasks__pagination :deep(.el-pagination.is-background .el-pager li:not(.is-disabled).is-active) {
  background: var(--color-primary);
}

@media (max-width: 960px) {
  .page-tasks__pagination {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
  }
}
</style>
