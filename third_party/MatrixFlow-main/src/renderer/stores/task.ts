import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';

export type TaskStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface TaskFilter {
  status?: string[];
  platform?: string[];
  planId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TaskListResult {
  items: Task[];
  total: number;
  taskTotal?: number;
  statusBreakdown?: Record<string, number>;
}

export interface Task {
  id: string;
  type: 'publish' | 'check_cookie' | 'login';
  accountId: string;
  accountName?: string;
  contentId?: string;
  contentTitle?: string;
  platform: string;
  status: TaskStatus;
  progress: number;
  message?: string;
  errorCode?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  planName?: string;
  source?: string;
}

export interface AccountInfo {
  accountId: string;
  accountName: string;
  platform: string;
}

export interface GroupedTask {
  contentId: string;
  title: string;
  coverUrl?: string;
  description?: string;
  tags?: string[];
  accounts: AccountInfo[];
  status: TaskStatus;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  subTasks: Task[];
}

const STATUS_PRIORITY: Record<TaskStatus, number> = {
  failed: 0,
  running: 1,
  cancelled: 2,
  pending: 3,
  scheduled: 3,
  completed: 4,
  skipped: 5,
};

function timestampOf(value: string | Date | undefined): number {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([]);
  const total = ref(0);
  const taskTotal = ref(0);
  const loading = ref(false);
  const statusBreakdown = ref<Record<string, number>>({});
  const selectedIds = ref<Set<string>>(new Set());
  const filter = ref<TaskFilter>({
    status: [],
    platform: [],
    planId: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    limit: 20,
    offset: 0,
  });

  const runningTasks = computed(() => tasks.value.filter((t) => t.status === 'running'));
  const failedTasks = computed(() => tasks.value.filter((t) => t.status === 'failed'));
  const hasFailedTasks = computed(() => failedTasks.value.length > 0);
  const selectedCount = computed(() => selectedIds.value.size);
  const allSelectedOnPage = computed(() =>
    tasks.value.length > 0 && tasks.value.every((t) => selectedIds.value.has(t.id))
  );

  const stats = computed(() => {
    const sb = Object.keys(statusBreakdown.value).length > 0
      ? statusBreakdown.value
      : tasks.value.reduce<Record<string, number>>((counts, task) => {
          counts[task.status] = (counts[task.status] || 0) + 1;
          return counts;
        }, {});
    return {
      total: taskTotal.value > 0 ? taskTotal.value : total.value,
      pending: (sb['pending'] ?? 0) + (sb['scheduled'] ?? 0),
      running: sb['running'] ?? 0,
      completed: sb['completed'] ?? 0,
      failed: sb['failed'] ?? 0,
      skipped: sb['skipped'] ?? 0,
    };
  });

  const groupedTasks = computed<GroupedTask[]>(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks.value) {
      const key = t.contentId || t.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    const result: GroupedTask[] = [];
    for (const [, group] of map) {
      const first = group[0];
      const newestCreatedTask = group.reduce((latest, task) =>
        timestampOf(task.createdAt) > timestampOf(latest.createdAt) ? task : latest,
      first);
      const accounts: AccountInfo[] = [];
      const seen = new Set<string>();
      let worstStatus: TaskStatus = 'completed';

      for (const t of group) {
        const key = `${t.platform}:${t.accountId}`;
        if (!seen.has(key)) {
          seen.add(key);
          accounts.push({
            accountId: t.accountId,
            accountName: t.accountName || '',
            platform: t.platform,
          });
        }
        if (STATUS_PRIORITY[t.status] < STATUS_PRIORITY[worstStatus]) {
          worstStatus = t.status;
        }
      }

      const latestUpdatedTask = group.reduce((latest, task) =>
        timestampOf(task.updatedAt) > timestampOf(latest.updatedAt) ? task : latest,
      first);

      result.push({
        contentId: first.contentId || first.id,
        title: first.title || first.contentTitle || '无标题',
        coverUrl: first.coverUrl || undefined,
        description: first.description,
        tags: first.tags,
        accounts,
        status: worstStatus,
        scheduledAt: first.scheduledAt,
        createdAt: newestCreatedTask.createdAt,
        updatedAt: latestUpdatedTask.updatedAt,
        subTasks: group,
      });
    }

    result.sort((a, b) => timestampOf(b.createdAt) - timestampOf(a.createdAt));
    return result;
  });

  let fetchRequestId = 0;

  async function fetchTasks(f?: TaskFilter) {
    const requestId = ++fetchRequestId;
    loading.value = true;
    try {
      if (!window.matrixflow?.publish?.listTasks) {
        console.warn('[taskStore] listTasks API 不可用');
        return;
      }
      const f2 = f || JSON.parse(JSON.stringify(filter.value));
      const raw = await window.matrixflow.publish.listTasks(f2);
      if (requestId !== fetchRequestId) return;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const result = raw as unknown as TaskListResult;
        tasks.value = result.items || [];
        total.value = result.total || 0;
        taskTotal.value = result.taskTotal ?? result.total ?? 0;
        statusBreakdown.value = result.statusBreakdown || {};
      }
    } catch (e) {
      if (requestId !== fetchRequestId) return;
      console.error('[taskStore] fetchTasks 失败:', e);
      tasks.value = [];
      total.value = 0;
      taskTotal.value = 0;
    } finally {
      if (requestId === fetchRequestId) {
        loading.value = false;
      }
    }
  }

  async function createTask(data: Partial<Task>) {
    if (!window.matrixflow) return;
    return window.matrixflow.publish.createTask(data);
  }

  async function cancelTask(id: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.publish.cancelTask(id);
    const task = tasks.value.find((t) => t.id === id);
    if (task) task.status = 'cancelled';
  }

  async function retryTask(id: string) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.publish.retryTask(id);
    const payload = result?.data ?? result;
    if (result?.success === false || payload?.success === false) {
      updateTaskStatus(id, 'failed');
      throw new Error(result?.message || payload?.error || '发布任务执行失败');
    }
    updateTaskStatus(id, 'completed');
    scheduleRefresh();
    return result;
  }

  async function republishTask(id: string) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.publish.republishTask(id);
    const payload = result?.data ?? result;
    if (result?.success === false || payload?.success === false) {
      throw new Error(result?.message || payload?.error || '重新发布失败');
    }
    scheduleRefresh();
    return payload;
  }

  async function retryAllFailed() {
    const ids = failedTasks.value.map((t) => t.id);
    for (const id of ids) {
      await retryTask(id);
    }
  }

  function updateTaskProgress(taskId: string, progress: number, message?: string) {
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) {
      task.progress = progress;
      if (message) task.message = message;
    }
  }

  function updateTaskStatus(taskId: string, status: TaskStatus, data?: Partial<Task>) {
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      if (data) {
        Object.assign(task, data);
      }
    } else {
      scheduleRefresh();
    }
  }

  function toggleSelectAll() {
    if (allSelectedOnPage.value) {
      selectedIds.value.clear();
    } else {
      tasks.value.forEach((t) => selectedIds.value.add(t.id));
    }
  }

  function toggleSelect(taskId: string) {
    if (selectedIds.value.has(taskId)) {
      selectedIds.value.delete(taskId);
    } else {
      selectedIds.value.add(taskId);
    }
  }

  function clearSelection() {
    selectedIds.value.clear();
  }

  async function batchRetry() {
    if (!window.matrixflow) return;
    const ids = [...selectedIds.value];
    return window.matrixflow.publish.batchRetry(ids);
  }

  async function batchCancel() {
    if (!window.matrixflow) return;
    const ids = [...selectedIds.value];
    await window.matrixflow.publish.batchCancel(ids);
    clearSelection();
  }

  async function deleteTask(id: string) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.publish.deleteTask(id) as { success?: boolean; message?: string };
    if (result && result.success === false) {
      throw new Error(result.message || '删除失败');
    }
    tasks.value = tasks.value.filter((t) => t.id !== id);
    selectedIds.value.delete(id);
  }

  async function batchDelete() {
    if (!window.matrixflow) return;
    const ids = [...selectedIds.value];
    const result = await window.matrixflow.publish.batchDelete(ids) as { success?: boolean; message?: string };
    if (result && result.success === false) {
      throw new Error(result.message || '批量删除失败');
    }
    tasks.value = tasks.value.filter((t) => !selectedIds.value.has(t.id));
    clearSelection();
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      fetchTasks();
    }, 2000);
  }

  /** 监听主进程推送的任务事件 */
  function listenIpcEvents(): () => void {
    const cleanups: (() => void)[] = [];

    if (window.matrixflow?.onTaskProgress) {
      const off = window.matrixflow.onTaskProgress((taskId: string, progress: number, message?: string) => {
        updateTaskProgress(taskId, progress, message);
      });
      cleanups.push(off);
    }

    if (window.matrixflow?.onTaskStatusChange) {
      const off = window.matrixflow.onTaskStatusChange((taskId: string, status: string, data?: Partial<Task>) => {
        updateTaskStatus(taskId, status as TaskStatus, data);
      });
      cleanups.push(off);
    }

    if (window.matrixflow?.onPublishStatus) {
      const off = window.matrixflow.onPublishStatus((batch: unknown[]) => {
        const events = Array.isArray(batch) ? batch : [batch];
        for (const evt of events) {
          const e = evt as { type: string; taskId: string; message?: string; progress?: number };
          if (e.type === 'task_failed') {
            updateTaskStatus(e.taskId, 'failed');
            ElMessage.error(e.message || '任务执行失败');
          } else if (e.type === 'task_done') {
            updateTaskStatus(e.taskId, 'completed');
          } else if (e.type === 'task_start') {
            updateTaskStatus(e.taskId, 'running');
          } else if (e.type === 'task_progress') {
            updateTaskProgress(e.taskId, e.progress ?? 0, e.message);
          }
        }
      });
      cleanups.push(off);
    }

    if (window.matrixflow?.onWatchdogEvent) {
      const off = window.matrixflow.onWatchdogEvent((event: string, taskId: string, message: string) => {
        const labels: Record<string, string> = {
          'watchdog:warn': '⚠️ 任务长时间无响应',
          'watchdog:escalate': '⚠️ 任务已升级到人工审核',
          'watchdog:abandon': '🔴 任务已超时终止',
          'watchdog:retry': '🔄 任务超时重试中',
        };
        ElMessage.warning(`${labels[event] || event}: ${message}`);
        fetchTasks();
      });
      cleanups.push(off);
    }

    return () => cleanups.forEach((fn) => fn());
  }

  return {
    tasks, total, taskTotal, loading, statusBreakdown, selectedIds, filter, selectedCount, allSelectedOnPage,
    groupedTasks, runningTasks, failedTasks, hasFailedTasks, stats,
    fetchTasks, createTask, cancelTask, retryTask, republishTask, retryAllFailed,
    batchRetry, batchCancel, batchDelete, deleteTask,
    toggleSelectAll, toggleSelect, clearSelection,
    updateTaskProgress, updateTaskStatus, listenIpcEvents,
  };
});
