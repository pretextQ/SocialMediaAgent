import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import { useTaskStore } from '@/renderer/stores/task';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';
import type { Task, TaskListResult, TaskStatus } from '@/renderer/stores/task';

let mock: MatrixflowMock;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'publish',
    accountId: 'acc-1',
    accountName: 'TestUser',
    contentId: 'content-1',
    contentTitle: 'Test Content',
    platform: 'douyin',
    status: 'pending',
    progress: 0,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

describe('useTaskStore', () => {
  describe('initial state', () => {
    it('starts with empty tasks', () => {
      const store = useTaskStore();
      expect(store.tasks).toEqual([]);
    });

    it('starts with loading=false', () => {
      const store = useTaskStore();
      expect(store.loading).toBe(false);
    });
  });

  describe('computed', () => {
    it('runningTasks filters by running status', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'running' }),
        makeTask({ id: '2', status: 'pending' }),
        makeTask({ id: '3', status: 'running' }),
      ];
      expect(store.runningTasks).toHaveLength(2);
    });

    it('failedTasks filters by failed status', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'failed' }),
        makeTask({ id: '2', status: 'completed' }),
      ];
      expect(store.failedTasks).toHaveLength(1);
    });

    it('hasFailedTasks is true when there are failed tasks', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ status: 'failed' })];
      expect(store.hasFailedTasks).toBe(true);
    });

    it('hasFailedTasks is false when no failed tasks', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ status: 'completed' })];
      expect(store.hasFailedTasks).toBe(false);
    });

    it('stats computes correct counts', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'pending' }),
        makeTask({ id: '2', status: 'running' }),
        makeTask({ id: '3', status: 'completed' }),
        makeTask({ id: '4', status: 'failed' }),
        makeTask({ id: '5', status: 'skipped' }),
      ];
      store.total = 5;
      const s = store.stats;
      expect(s.total).toBe(5);
      expect(s.pending).toBe(1);
      expect(s.running).toBe(1);
      expect(s.completed).toBe(1);
      expect(s.failed).toBe(1);
      expect(s.skipped).toBe(1);
    });

    it('stats returns zeros for empty tasks', () => {
      const store = useTaskStore();
      const s = store.stats;
      expect(s.total).toBe(0);
      expect(s.pending).toBe(0);
      expect(s.running).toBe(0);
    });

    it('sorts newly created content first when IPC returns Date objects', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({
          id: 'older',
          contentId: 'older-content',
          createdAt: new Date('2026-06-07T10:00:00Z') as unknown as string,
        }),
        makeTask({
          id: 'newer',
          contentId: 'newer-content',
          createdAt: new Date('2026-06-08T10:00:00Z') as unknown as string,
        }),
      ];

      expect(store.groupedTasks.map((task) => task.contentId)).toEqual([
        'newer-content',
        'older-content',
      ]);
    });
  });

  describe('fetchTasks', () => {
    it('fetches tasks from IPC and populates state', async () => {
      const tasks = [makeTask({ id: '1' }), makeTask({ id: '2' })];
      mock.publish.listTasks.mockResolvedValue({ items: tasks, total: 2, taskTotal: 4 });

      const store = useTaskStore();
      await store.fetchTasks();

      expect(store.tasks).toEqual(tasks);
      expect(store.total).toBe(2);
      expect(store.taskTotal).toBe(4);
      expect(mock.publish.listTasks).toHaveBeenCalledWith(expect.objectContaining({
        groupByContent: true,
        limit: 20,
        offset: 0,
      }));
    });

    it('passes filter to IPC', async () => {
      mock.publish.listTasks.mockResolvedValue({ items: [], total: 0 });

      const store = useTaskStore();
      await store.fetchTasks({ contentId: 'c-1' });

      expect(mock.publish.listTasks).toHaveBeenCalledWith({ contentId: 'c-1' });
    });

    it('manages loading state', async () => {
      let loadingDuringCall = false;
      mock.publish.listTasks.mockImplementation(async () => {
        loadingDuringCall = useTaskStore().loading;
        return { items: [], total: 0 };
      });

      const store = useTaskStore();
      await store.fetchTasks();

      expect(loadingDuringCall).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('resets loading on error', async () => {
      mock.publish.listTasks.mockRejectedValue(new Error('IPC fail'));

      const store = useTaskStore();
      await store.fetchTasks();
      expect(store.loading).toBe(false);
      expect(store.tasks).toEqual([]);
      expect(store.total).toBe(0);
    });

    it('handles null result gracefully', async () => {
      mock.publish.listTasks.mockResolvedValue(null);

      const store = useTaskStore();
      await store.fetchTasks();

      expect(store.tasks).toEqual([]);
      expect(store.total).toBe(0);
    });

    it('keeps the newest page when an older request resolves later', async () => {
      let resolveFirst: ((value: TaskListResult) => void) | undefined;
      mock.publish.listTasks
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveFirst = resolve;
        }))
        .mockResolvedValueOnce({
          items: [makeTask({ id: 'page-2' })],
          total: 40,
          taskTotal: 40,
        });

      const store = useTaskStore();
      const first = store.fetchTasks({ limit: 20, offset: 0, groupByContent: true });
      const second = store.fetchTasks({ limit: 20, offset: 20, groupByContent: true });
      await second;
      resolveFirst?.({
        items: [makeTask({ id: 'page-1' })],
        total: 40,
        taskTotal: 40,
      });
      await first;

      expect(store.tasks.map((task) => task.id)).toEqual(['page-2']);
      expect(store.loading).toBe(false);
    });
  });

  describe('createTask', () => {
    it('calls IPC createTask with data', async () => {
      mock.publish.createTask.mockResolvedValue({ success: true, data: { id: 'new-task' } });

      const store = useTaskStore();
      const result = await store.createTask({
        contentId: 'mat-1',
        accountId: 'acc-1',
        platform: 'douyin',
        publishMode: 'client',
        metadata: { title: 'Test' },
      });

      expect(mock.publish.createTask).toHaveBeenCalled();
    });
  });

  describe('cancelTask', () => {
    it('cancels task and updates status', async () => {
      mock.publish.cancelTask.mockResolvedValue({ success: true });

      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', status: 'running' })];
      await store.cancelTask('t-1');

      expect(store.tasks[0].status).toBe('cancelled');
      expect(mock.publish.cancelTask).toHaveBeenCalledWith('t-1');
    });
  });

  describe('retryTask', () => {
    it('calls IPC retryTask', async () => {
      mock.publish.retryTask.mockResolvedValue({ success: true });

      const store = useTaskStore();
      await store.retryTask('t-1');

      expect(mock.publish.retryTask).toHaveBeenCalledWith('t-1');
    });

    it('throws when IPC retryTask reports publish failure', async () => {
      mock.publish.retryTask.mockResolvedValue({
        success: false,
        message: '视频发布失败',
        data: { success: false, error: '视频发布失败' },
      });

      const store = useTaskStore();
      await expect(store.retryTask('t-1')).rejects.toThrow('视频发布失败');
    });
  });

  describe('retryAllFailed', () => {
    it('retries all failed tasks', async () => {
      mock.publish.retryTask.mockResolvedValue({ success: true });

      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'failed' }),
        makeTask({ id: '2', status: 'failed' }),
        makeTask({ id: '3', status: 'completed' }),
      ];
      await store.retryAllFailed();

      expect(mock.publish.retryTask).toHaveBeenCalledTimes(2);
      expect(mock.publish.retryTask).toHaveBeenCalledWith('1');
      expect(mock.publish.retryTask).toHaveBeenCalledWith('2');
    });
  });

  describe('updateTaskProgress', () => {
    it('updates progress and message for matching task', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', progress: 0 })];
      store.updateTaskProgress('t-1', 50, 'Uploading...');

      expect(store.tasks[0].progress).toBe(50);
      expect(store.tasks[0].message).toBe('Uploading...');
    });

    it('does nothing for non-existent task', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', progress: 0 })];
      store.updateTaskProgress('t-999', 50, 'Nope');

      expect(store.tasks[0].progress).toBe(0);
    });
  });

  describe('updateTaskStatus', () => {
    it('updates status for matching task', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', status: 'pending' })];
      store.updateTaskStatus('t-1', 'completed');

      expect(store.tasks[0].status).toBe('completed');
    });

    it('merges additional data', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', status: 'pending', errorCode: undefined })];
      store.updateTaskStatus('t-1', 'failed', { errorCode: 'TIMEOUT' });

      expect(store.tasks[0].status).toBe('failed');
      expect(store.tasks[0].errorCode).toBe('TIMEOUT');
    });
  });

  describe('selection', () => {
    it('toggleSelect toggles task selection', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1' }), makeTask({ id: 't-2' })];
      store.toggleSelect('t-1');
      expect(store.selectedIds.has('t-1')).toBe(true);
      store.toggleSelect('t-1');
      expect(store.selectedIds.has('t-1')).toBe(false);
    });

    it('toggleSelectAll selects/deselects all', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1' }), makeTask({ id: 't-2' })];
      store.toggleSelectAll();
      expect(store.selectedCount).toBe(2);
      store.toggleSelectAll();
      expect(store.selectedCount).toBe(0);
    });

    it('clearSelection clears all', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1' })];
      store.toggleSelect('t-1');
      store.clearSelection();
      expect(store.selectedCount).toBe(0);
    });
  });

  describe('listenIpcEvents', () => {
    it('returns unsubscribe function', () => {
      mock.on.onTaskProgress = () => {};
      mock.on.onTaskStatusChange = () => {};

      const store = useTaskStore();
      const unsub = store.listenIpcEvents();

      expect(typeof unsub).toBe('function');
    });
  });
});
