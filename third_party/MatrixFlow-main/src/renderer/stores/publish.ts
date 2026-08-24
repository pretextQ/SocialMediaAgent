import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAccountStore } from '@/renderer/stores/account';

export type PublishStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type PublishMode = 'server' | 'client';

export interface PublishTask {
  id: string;
  contentId: string;
  contentTitle: string;
  groupId: string | null;
  platform: string;
  accountId: string;
  accountName: string;
  publishMode: PublishMode;
  status: PublishStatus;
  scheduledAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  dryRun?: boolean;
  coverRatio?: string;
}

export interface HealthCheckResult {
  accountId: string;
  accountName: string;
  healthy: boolean;
  message?: string;
}

export interface PublishHistoryItem {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  contentTitle: string;
  status: PublishStatus;
  scheduledAt: string;
  completedAt?: string;
  dryRun?: boolean;
}

export interface PublishHistoryFilters {
  platform?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export const usePublishStore = defineStore('publish', () => {
  const tasks = ref<PublishTask[]>([]);
  const loading = ref(false);
  const dryRun = ref(false);
  const prePublishCheck = ref(true);
  const healthCheckResults = ref<HealthCheckResult[]>([]);
  const publishHistory = ref<PublishHistoryItem[]>([]);
  const publishHistoryTotal = ref(0);
  const publishHistoryLoading = ref(false);
  const availableCoverRatios = ref<string[]>([]);

  // scheduledAt 按日期分组：'YYYY-MM-DD' -> PublishTask[]
  const tasksByDate = computed(() => {
    const map = new Map<string, PublishTask[]>();
    for (const task of tasks.value) {
      const dateKey = task.scheduledAt.slice(0, 10);
      const list = map.get(dateKey) || [];
      list.push(task);
      map.set(dateKey, list);
    }
    return map;
  });

  const pendingCount = computed(() => tasks.value.filter((t) => t.status === 'pending').length);
  const scheduledCount = computed(() => tasks.value.filter((t) => t.status === 'scheduled').length);

  async function fetchTasks() {
    if (!window.matrixflow) return;
    loading.value = true;
    try {
      const result = await window.matrixflow.publish.listTasks();
      tasks.value = (result as PublishTask[]) ?? [];
    } finally {
      loading.value = false;
    }
  }

  async function createTask(data: {
    contentId: string;
    accountIds: string[];
    scheduledAt: string | null;
    publishMode: PublishMode;
    dryRun?: boolean;
    coverRatio?: string;
  }) {
    if (!window.matrixflow) return;
    const accountStore = useAccountStore();
    const results: PublishTask[] = [];
    for (const accountId of data.accountIds) {
      const account = accountStore.accounts.find((a) => a.id === accountId);
      if (!account) {
        console.warn(`[publishStore] 账号不存在: ${accountId}`);
        continue;
      }
      try {
        const response = await window.matrixflow.publish.createTask({
          contentId: data.contentId,
          accountId,
          platform: account.platform,
          scheduledAt: data.scheduledAt,
          publishMode: data.publishMode,
          metadata: {
            dryRun: data.dryRun,
            coverRatio: data.coverRatio,
          },
        });
        if (response?.success && response.data) {
          results.push(response.data as PublishTask);
        } else if (response && !response.success) {
          console.warn(`[publishStore] 创建任务失败: accountId=${accountId} message=${response.message}`);
        }
      } catch (err) {
        console.error(`[publishStore] 创建任务异常: accountId=${accountId}`, err);
      }
    }
    if (results.length > 0) {
      tasks.value.push(...results);
    }
    return results;
  }

  async function updateTaskSchedule(taskId: string, scheduledAt: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.publish.updateTask(taskId, { scheduledAt });
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) {
      task.scheduledAt = scheduledAt;
      task.updatedAt = new Date().toISOString();
    }
  }

  async function deleteTask(taskId: string) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.publish.deleteTask(taskId) as { success?: boolean; message?: string };
    if (result && result.success === false) {
      throw new Error(result.message || '删除失败');
    }
    tasks.value = tasks.value.filter((t) => t.id !== taskId);
  }

  async function cancelTask(taskId: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.publish.cancelTask(taskId);
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) task.status = 'cancelled';
  }

  async function retryTask(taskId: string) {
    if (!window.matrixflow) return;
    return window.matrixflow.publish.retryTask(taskId);
  }

  async function confirmPendingTasks() {
    const pending = tasks.value.filter(
      (t) => t.status === 'pending' || t.status === 'scheduled',
    );
    for (const task of pending) {
      if (!window.matrixflow) continue;
      await window.matrixflow.publish.updateTask(task.id, { status: 'scheduled' });
      task.status = 'scheduled';
    }
  }

  async function runPrePublishCheck(accountIds: string[]) {
    if (!window.matrixflow) return;
    try {
      const results = await window.matrixflow.publish.preCheck({ accountIds });
      healthCheckResults.value = (results.data as HealthCheckResult[]) ?? [];
    } catch {
      healthCheckResults.value = [];
    }
  }

  async function fetchPublishHistory(filters?: PublishHistoryFilters) {
    if (!window.matrixflow) return;
    publishHistoryLoading.value = true;
    try {
      const result = await window.matrixflow.publish.history(filters ?? {});
      const payload = result.data as { items?: PublishHistoryItem[]; total?: number };
      publishHistory.value = payload?.items ?? [];
      publishHistoryTotal.value = payload?.total ?? 0;
    } catch {
      publishHistory.value = [];
      publishHistoryTotal.value = 0;
    } finally {
      publishHistoryLoading.value = false;
    }
  }

  async function fetchCoverRatios(platformId: string) {
    if (!window.matrixflow) return;
    try {
      const ratios = await window.matrixflow.platform.coverRatios(platformId);
      availableCoverRatios.value = (ratios.data as string[]) ?? [];
    } catch {
      availableCoverRatios.value = [];
    }
  }

  return {
    tasks,
    loading,
    dryRun,
    prePublishCheck,
    healthCheckResults,
    publishHistory,
    publishHistoryTotal,
    publishHistoryLoading,
    availableCoverRatios,
    tasksByDate,
    pendingCount,
    scheduledCount,
    fetchTasks,
    createTask,
    updateTaskSchedule,
    deleteTask,
    cancelTask,
    retryTask,
    confirmPendingTasks,
    runPrePublishCheck,
    fetchPublishHistory,
    fetchCoverRatios,
  };
});
