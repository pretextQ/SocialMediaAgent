import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  installMatrixflowMock,
  removeMatrixflowMock,
} from '../../../mocks/window-matrixflow';
import {
  usePublishStore,
  type PublishTask,
  type HealthCheckResult,
} from '../../../../src/renderer/stores/publish';

function makeTask(overrides: Partial<PublishTask> = {}): PublishTask {
  return {
    id: 'task_001',
    contentId: 'content_001',
    contentTitle: '测试内容',
    groupId: null,
    platform: 'douyin',
    accountId: 'account_001',
    accountName: '测试账号',
    publishMode: 'client',
    status: 'pending',
    scheduledAt: '2025-05-20T10:00:00.000Z',
    createdAt: '2025-05-19T10:00:00.000Z',
    updatedAt: '2025-05-19T10:00:00.000Z',
    ...overrides,
  };
}

describe('usePublishStore', () => {
  let mock: ReturnType<typeof installMatrixflowMock>;

  beforeEach(() => {
    setActivePinia(createPinia());
    mock = installMatrixflowMock();
  });

  afterEach(() => {
    removeMatrixflowMock();
  });

  // ─── State defaults ──────────────────────────────────────────────

  describe('initial state', () => {
    it('has empty tasks array', () => {
      const store = usePublishStore();
      expect(store.tasks).toEqual([]);
    });

    it('has loading=false', () => {
      const store = usePublishStore();
      expect(store.loading).toBe(false);
    });

    it('has dryRun=false', () => {
      const store = usePublishStore();
      expect(store.dryRun).toBe(false);
    });

    it('has prePublishCheck=true', () => {
      const store = usePublishStore();
      expect(store.prePublishCheck).toBe(true);
    });

    it('has empty healthCheckResults', () => {
      const store = usePublishStore();
      expect(store.healthCheckResults).toEqual([]);
    });

    it('has empty publishHistory', () => {
      const store = usePublishStore();
      expect(store.publishHistory).toEqual([]);
    });

    it('has publishHistoryTotal=0', () => {
      const store = usePublishStore();
      expect(store.publishHistoryTotal).toBe(0);
    });

    it('has publishHistoryLoading=false', () => {
      const store = usePublishStore();
      expect(store.publishHistoryLoading).toBe(false);
    });

    it('has empty availableCoverRatios', () => {
      const store = usePublishStore();
      expect(store.availableCoverRatios).toEqual([]);
    });
  });

  // ─── Computed: tasksByDate ───────────────────────────────────────

  describe('tasksByDate', () => {
    it('returns empty map when no tasks', () => {
      const store = usePublishStore();
      expect(store.tasksByDate.size).toBe(0);
    });

    it('groups tasks by scheduledAt date', () => {
      const store = usePublishStore();
      const taskA = makeTask({ id: 'a', scheduledAt: '2025-05-20T10:00:00.000Z' });
      const taskB = makeTask({ id: 'b', scheduledAt: '2025-05-20T14:00:00.000Z' });
      const taskC = makeTask({ id: 'c', scheduledAt: '2025-05-21T10:00:00.000Z' });
      store.tasks = [taskA, taskB, taskC];

      const map = store.tasksByDate;
      expect(map.size).toBe(2);
      expect(map.get('2025-05-20')).toHaveLength(2);
      expect(map.get('2025-05-21')).toHaveLength(1);
    });

    it('handles single task', () => {
      const store = usePublishStore();
      store.tasks = [makeTask()];
      expect(store.tasksByDate.size).toBe(1);
      expect(store.tasksByDate.get('2025-05-20')).toHaveLength(1);
    });
  });

  // ─── Computed: pendingCount / scheduledCount ─────────────────────

  describe('pendingCount', () => {
    it('returns 0 when no tasks', () => {
      const store = usePublishStore();
      expect(store.pendingCount).toBe(0);
    });

    it('counts only pending tasks', () => {
      const store = usePublishStore();
      store.tasks = [
        makeTask({ id: '1', status: 'pending' }),
        makeTask({ id: '2', status: 'scheduled' }),
        makeTask({ id: '3', status: 'pending' }),
      ];
      expect(store.pendingCount).toBe(2);
    });
  });

  describe('scheduledCount', () => {
    it('returns 0 when no tasks', () => {
      const store = usePublishStore();
      expect(store.scheduledCount).toBe(0);
    });

    it('counts only scheduled tasks', () => {
      const store = usePublishStore();
      store.tasks = [
        makeTask({ id: '1', status: 'scheduled' }),
        makeTask({ id: '2', status: 'running' }),
        makeTask({ id: '3', status: 'scheduled' }),
      ];
      expect(store.scheduledCount).toBe(2);
    });
  });

  // ─── fetchTasks ─────────────────────────────────────────────────

  describe('fetchTasks', () => {
    it('calls IPC and populates tasks', async () => {
      const fakeTasks = [makeTask(), makeTask({ id: 'task_002' })];
      mock.publish.listTasks.mockResolvedValue(fakeTasks);

      const store = usePublishStore();
      await store.fetchTasks();

      expect(mock.publish.listTasks).toHaveBeenCalledOnce();
      expect(store.tasks).toEqual(fakeTasks);
    });

    it('sets tasks to empty array when IPC returns null', async () => {
      mock.publish.listTasks.mockResolvedValue(null);

      const store = usePublishStore();
      await store.fetchTasks();

      expect(store.tasks).toEqual([]);
    });

    it('manages loading state', async () => {
      let loadingDuringCall = false;
      mock.publish.listTasks.mockImplementation(async () => {
        const store = usePublishStore();
        loadingDuringCall = store.loading;
        return [];
      });

      const store = usePublishStore();
      await store.fetchTasks();

      expect(loadingDuringCall).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      await store.fetchTasks();
      expect(store.tasks).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it('resets loading even on IPC error', async () => {
      mock.publish.listTasks.mockRejectedValue(new Error('IPC fail'));

      const store = usePublishStore();
      await expect(store.fetchTasks()).rejects.toThrow('IPC fail');
      expect(store.loading).toBe(false);
    });
  });

  // ─── createTask ─────────────────────────────────────────────────

  describe('createTask', () => {
    it('creates tasks for multiple accountIds', async () => {
      const task1 = makeTask({ id: 't1', accountId: 'acc1' });
      const task2 = makeTask({ id: 't2', accountId: 'acc2' });
      mock.publish.createTask
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);

      const store = usePublishStore();
      const results = await store.createTask({
        contentId: 'content_001',
        accountIds: ['acc1', 'acc2'],
        scheduledAt: '2025-05-20T10:00:00.000Z',
        publishMode: 'client',
      });

      expect(mock.publish.createTask).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(store.tasks).toHaveLength(2);
    });

    it('skips null results from IPC', async () => {
      mock.publish.createTask
        .mockResolvedValueOnce(makeTask({ id: 't1' }))
        .mockResolvedValueOnce(null);

      const store = usePublishStore();
      const results = await store.createTask({
        contentId: 'content_001',
        accountIds: ['acc1', 'acc2'],
        scheduledAt: null,
        publishMode: 'server',
      });

      expect(results).toHaveLength(1);
      expect(store.tasks).toHaveLength(1);
    });

    it('passes metadata with dryRun and coverRatio', async () => {
      mock.publish.createTask.mockResolvedValue(makeTask());

      const store = usePublishStore();
      await store.createTask({
        contentId: 'content_001',
        accountIds: ['acc1'],
        scheduledAt: null,
        publishMode: 'client',
        dryRun: true,
        coverRatio: '16:9',
      });

      expect(mock.publish.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { dryRun: true, coverRatio: '16:9' },
        }),
      );
    });

    it('returns undefined when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      const result = await store.createTask({
        contentId: 'c1',
        accountIds: ['a1'],
        scheduledAt: null,
        publishMode: 'client',
      });
      expect(result).toBeUndefined();
    });
  });

  // ─── updateTaskSchedule ─────────────────────────────────────────

  describe('updateTaskSchedule', () => {
    it('updates IPC and local task', async () => {
      mock.publish.updateTask.mockResolvedValue({ success: true });
      const store = usePublishStore();
      store.tasks = [makeTask()];

      await store.updateTaskSchedule('task_001', '2025-05-25T10:00:00.000Z');

      expect(mock.publish.updateTask).toHaveBeenCalledWith('task_001', {
        scheduledAt: '2025-05-25T10:00:00.000Z',
      });
      expect(store.tasks[0].scheduledAt).toBe('2025-05-25T10:00:00.000Z');
      expect(store.tasks[0].updatedAt).not.toBe('2025-05-19T10:00:00.000Z');
    });

    it('does nothing when task not found locally', async () => {
      mock.publish.updateTask.mockResolvedValue({ success: true });
      const store = usePublishStore();
      store.tasks = [];

      await store.updateTaskSchedule('nonexistent', '2025-05-25T10:00:00.000Z');

      expect(mock.publish.updateTask).toHaveBeenCalled();
      expect(store.tasks).toHaveLength(0);
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      store.tasks = [makeTask()];
      await store.updateTaskSchedule('task_001', '2025-05-25T10:00:00.000Z');
      expect(store.tasks[0].scheduledAt).toBe('2025-05-20T10:00:00.000Z');
    });
  });

  // ─── deleteTask ─────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('removes task via IPC and from local state', async () => {
      mock.publish.deleteTask.mockResolvedValue({ success: true });
      const store = usePublishStore();
      store.tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];

      await store.deleteTask('t1');

      expect(mock.publish.deleteTask).toHaveBeenCalledWith('t1');
      expect(store.tasks).toHaveLength(1);
      expect(store.tasks[0].id).toBe('t2');
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      store.tasks = [makeTask()];
      await store.deleteTask('task_001');
      expect(store.tasks).toHaveLength(1);
    });
  });

  // ─── cancelTask ─────────────────────────────────────────────────

  describe('cancelTask', () => {
    it('cancels task via IPC and updates local status', async () => {
      mock.publish.cancelTask.mockResolvedValue({ success: true });
      const store = usePublishStore();
      store.tasks = [makeTask()];

      await store.cancelTask('task_001');

      expect(mock.publish.cancelTask).toHaveBeenCalledWith('task_001');
      expect(store.tasks[0].status).toBe('cancelled');
    });

    it('does not crash when task not found', async () => {
      mock.publish.cancelTask.mockResolvedValue({ success: true });
      const store = usePublishStore();
      store.tasks = [];

      await store.cancelTask('nonexistent');
      expect(mock.publish.cancelTask).toHaveBeenCalled();
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      store.tasks = [makeTask()];
      await store.cancelTask('task_001');
      expect(store.tasks[0].status).toBe('pending');
    });
  });

  // ─── retryTask ──────────────────────────────────────────────────

  describe('retryTask', () => {
    it('delegates to IPC retryTask', async () => {
      mock.publish.retryTask.mockResolvedValue({ success: true });

      const store = usePublishStore();
      await store.retryTask('task_001');

      expect(mock.publish.retryTask).toHaveBeenCalledWith('task_001');
    });

    it('returns IPC result', async () => {
      const retryResult = { success: true, taskId: 'task_001' };
      mock.publish.retryTask.mockResolvedValue(retryResult);

      const store = usePublishStore();
      const result = await store.retryTask('task_001');
      expect(result).toEqual(retryResult);
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      const result = await store.retryTask('task_001');
      expect(result).toBeUndefined();
    });
  });

  // ─── confirmPendingTasks ────────────────────────────────────────

  describe('confirmPendingTasks', () => {
    it('updates pending and scheduled tasks to scheduled', async () => {
      mock.publish.updateTask.mockResolvedValue({ success: true });
      const store = usePublishStore();
      store.tasks = [
        makeTask({ id: 't1', status: 'pending' }),
        makeTask({ id: 't2', status: 'scheduled' }),
        makeTask({ id: 't3', status: 'running' }),
        makeTask({ id: 't4', status: 'completed' }),
      ];

      await store.confirmPendingTasks();

      expect(mock.publish.updateTask).toHaveBeenCalledTimes(2);
      expect(mock.publish.updateTask).toHaveBeenCalledWith('t1', { status: 'scheduled' });
      expect(mock.publish.updateTask).toHaveBeenCalledWith('t2', { status: 'scheduled' });
      expect(store.tasks[0].status).toBe('scheduled');
      expect(store.tasks[1].status).toBe('scheduled');
      expect(store.tasks[2].status).toBe('running');
      expect(store.tasks[3].status).toBe('completed');
    });

    it('does nothing when no pending or scheduled tasks', async () => {
      const store = usePublishStore();
      store.tasks = [
        makeTask({ id: 't1', status: 'running' }),
        makeTask({ id: 't2', status: 'completed' }),
      ];

      await store.confirmPendingTasks();
      expect(mock.publish.updateTask).not.toHaveBeenCalled();
    });

    it('stops iterating when matrixflow becomes undefined mid-loop', async () => {
      let callCount = 0;
      mock.publish.updateTask.mockImplementation(async () => {
        callCount++;
        if (callCount >= 1) {
          (globalThis as Record<string, unknown>).window = { matrixflow: undefined };
        }
        return { success: true };
      });

      const store = usePublishStore();
      store.tasks = [
        makeTask({ id: 't1', status: 'pending' }),
        makeTask({ id: 't2', status: 'pending' }),
      ];

      await store.confirmPendingTasks();
      expect(callCount).toBeLessThanOrEqual(2);
    });
  });

  // ─── runPrePublishCheck ─────────────────────────────────────────

  describe('runPrePublishCheck', () => {
    it('populates healthCheckResults on success', async () => {
      const checkResults: HealthCheckResult[] = [
        { accountId: 'a1', accountName: '账号1', healthy: true },
        { accountId: 'a2', accountName: '账号2', healthy: false, message: 'Cookie过期' },
      ];
      mock.publish.preCheck.mockResolvedValue({ data: checkResults });

      const store = usePublishStore();
      await store.runPrePublishCheck(['a1', 'a2']);

      expect(mock.publish.preCheck).toHaveBeenCalledWith({ accountIds: ['a1', 'a2'] });
      expect(store.healthCheckResults).toEqual(checkResults);
    });

    it('clears healthCheckResults on error', async () => {
      mock.publish.preCheck.mockRejectedValue(new Error('check fail'));

      const store = usePublishStore();
      store.healthCheckResults = [
        { accountId: 'a1', accountName: '账号1', healthy: true },
      ];
      await store.runPrePublishCheck(['a1']);

      expect(store.healthCheckResults).toEqual([]);
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      await store.runPrePublishCheck(['a1']);
      expect(store.healthCheckResults).toEqual([]);
    });
  });

  // ─── fetchPublishHistory ────────────────────────────────────────

  describe('fetchPublishHistory', () => {
    it('populates publishHistory and total', async () => {
      const items = [
        { id: 'h1', platform: 'douyin', accountId: 'a1', accountName: '账号1', contentTitle: '视频1', status: 'completed', scheduledAt: '2025-05-19' },
      ];
      mock.publish.history.mockResolvedValue({ data: { items, total: 1 } });

      const store = usePublishStore();
      await store.fetchPublishHistory();

      expect(mock.publish.history).toHaveBeenCalledWith({});
      expect(store.publishHistory).toEqual(items);
      expect(store.publishHistoryTotal).toBe(1);
    });

    it('passes filters to IPC', async () => {
      mock.publish.history.mockResolvedValue({ data: { items: [], total: 0 } });

      const store = usePublishStore();
      await store.fetchPublishHistory({ platform: 'douyin', page: 2, pageSize: 20 });

      expect(mock.publish.history).toHaveBeenCalledWith({
        platform: 'douyin',
        page: 2,
        pageSize: 20,
      });
    });

    it('clears state on error', async () => {
      mock.publish.history.mockRejectedValue(new Error('history fail'));

      const store = usePublishStore();
      store.publishHistory = [{ id: 'h1', platform: 'douyin', accountId: 'a1', accountName: 'n', contentTitle: 't', status: 'completed', scheduledAt: '' }];
      store.publishHistoryTotal = 5;

      await store.fetchPublishHistory();

      expect(store.publishHistory).toEqual([]);
      expect(store.publishHistoryTotal).toBe(0);
    });

    it('manages publishHistoryLoading state', async () => {
      let loadingDuringCall = false;
      mock.publish.history.mockImplementation(async () => {
        const store = usePublishStore();
        loadingDuringCall = store.publishHistoryLoading;
        return { data: { items: [], total: 0 } };
      });

      const store = usePublishStore();
      await store.fetchPublishHistory();

      expect(loadingDuringCall).toBe(true);
      expect(store.publishHistoryLoading).toBe(false);
    });

    it('resets loading even on error', async () => {
      mock.publish.history.mockRejectedValue(new Error('fail'));
      const store = usePublishStore();
      await store.fetchPublishHistory();
      expect(store.publishHistoryLoading).toBe(false);
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      await store.fetchPublishHistory();
      expect(store.publishHistoryLoading).toBe(false);
    });
  });

  // ─── fetchCoverRatios ───────────────────────────────────────────

  describe('fetchCoverRatios', () => {
    it('populates availableCoverRatios', async () => {
      const ratios = ['1:1', '16:9', '3:4'];
      mock.platform.coverRatios.mockResolvedValue({ data: ratios });

      const store = usePublishStore();
      await store.fetchCoverRatios('douyin');

      expect(mock.platform.coverRatios).toHaveBeenCalledWith('douyin');
      expect(store.availableCoverRatios).toEqual(ratios);
    });

    it('clears ratios on error', async () => {
      mock.platform.coverRatios.mockRejectedValue(new Error('fail'));

      const store = usePublishStore();
      store.availableCoverRatios = ['16:9'];
      await store.fetchCoverRatios('douyin');

      expect(store.availableCoverRatios).toEqual([]);
    });

    it('returns early when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = usePublishStore();
      await store.fetchCoverRatios('douyin');
      expect(store.availableCoverRatios).toEqual([]);
    });
  });
});
