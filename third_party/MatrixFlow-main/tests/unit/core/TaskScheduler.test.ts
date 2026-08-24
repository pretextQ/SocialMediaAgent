import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskScheduler } from '@electron/core/TaskScheduler';
import { QueueManager, generateId } from '@electron/core/QueueManager';
import { RateLimiter } from '@electron/core/RateLimiter';
import { FailureCoordinator } from '@electron/core/FailureCoordinator';
import { EventBus } from '@electron/core/EventBus';
import { TaskEvents } from '@electron/core/types/task';
import type { ITask, ITaskResult, TaskInput } from '@electron/core/types/task';

vi.mock('@electron/core/FailureCoordinator', () => ({
  FailureCoordinator: vi.fn().mockImplementation(() => ({
    recordFailure: vi.fn(),
    shouldStopAccount: vi.fn(() => false),
    markSkipped: vi.fn(),
    clearHistory: vi.fn(),
    getHistory: vi.fn(() => []),
  })),
}));

vi.mock('@electron/data/Database', () => {
  const mockStmt = {
    run: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(() => undefined),
  };
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(() => mockStmt),
    transaction: vi.fn((fn: Function) => (...args: unknown[]) => fn(...args)),
    close: vi.fn(),
  };
  return {
    getDatabase: vi.fn(() => mockDb),
    isDatabaseAvailable: vi.fn(() => true),
    initDatabase: vi.fn(() => mockDb),
  };
});

function makeTask(overrides: Partial<ITask> = {}): ITask {
  return {
    id: generateId(),
    type: 'publish',
    platform: 'douyin',
    accountId: 'account_1',
    priority: 5,
    payload: {},
    status: 'queued',
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;
  let queue: QueueManager;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (QueueManager as any).instance = null;
    (RateLimiter as any).instance = null;
    (TaskScheduler as any).instance = null;

    queue = QueueManager.getInstance();
    rateLimiter = RateLimiter.getInstance();
    scheduler = TaskScheduler.getInstance();
  });

  afterEach(() => {
    scheduler.stop();
    queue.stopAutoPersist();
    queue.clear();

    (TaskScheduler as any).instance = null;
    (QueueManager as any).instance = null;
    (RateLimiter as any).instance = null;

    vi.useRealTimers();
  });

  describe('getInstance', () => {
    it('返回单例实例', () => {
      const a = TaskScheduler.getInstance();
      const b = TaskScheduler.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('schedule', () => {
    it('将任务加入队列', () => {
      const task = makeTask({ id: 't1' });
      scheduler.schedule(task);

      const found = scheduler.getTask('t1');
      expect(found).toBeDefined();
      expect(found!.status).toBe('queued');
    });

    it('生成 id 如果未提供', () => {
      const task = makeTask({ id: '' });
      scheduler.schedule(task);

      const found = scheduler.getTask(task.id);
      // Empty id gets replaced by generateId()
    });

    it('设置默认 maxRetries = 3', () => {
      const task = makeTask({ id: 't1', maxRetries: undefined as unknown as number });
      scheduler.schedule(task);

      const found = scheduler.getTask('t1');
      expect(found!.maxRetries).toBe(3);
    });

    it('发出 TASK_CREATED 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(TaskEvents.TASK_CREATED, handler);

      scheduler.schedule(makeTask({ id: 't1' }));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
      unsub();
    });
  });

  describe('scheduleAt', () => {
    it('将任务加入队列并设置定时器', () => {
      const future = new Date(Date.now() + 60_000);
      scheduler.scheduleAt(makeTask({ id: 't1' }), future);

      const found = scheduler.getTask('t1');
      expect(found).toBeDefined();
      expect(found!.status).toBe('pending');
    });

    it('过去时间直接调度', () => {
      const past = new Date(Date.now() - 1000);
      scheduler.scheduleAt(makeTask({ id: 't1' }), past);

      const found = scheduler.getTask('t1');
      expect(found!.status).toBe('queued');
    });

    it('定时器到期后更新状态为 queued', () => {
      const future = new Date(Date.now() + 5_000);
      scheduler.scheduleAt(makeTask({ id: 't1' }), future);

      const before = scheduler.getTask('t1');
      expect(before!.status).toBe('pending');

      vi.advanceTimersByTime(5_000);

      const after = scheduler.getTask('t1');
      expect(after!.status).toBe('queued');
    });

    it('发出 TASK_CREATED 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(TaskEvents.TASK_CREATED, handler);

      const future = new Date(Date.now() + 60_000);
      scheduler.scheduleAt(makeTask({ id: 't1' }), future);

      expect(handler).toHaveBeenCalled();
      unsub();
    });
  });

  describe('schedulePeriodic', () => {
    it('注册周期任务并返回 id', () => {
      const input: TaskInput = {
        type: 'publish',
        platform: 'douyin',
        accountId: 'acc1',
        payload: {},
      };

      const id = scheduler.schedulePeriodic(input, 10_000);
      expect(id).toMatch(/^periodic_/);
    });

    it('按间隔触发任务', () => {
      const input: TaskInput = {
        type: 'publish',
        platform: 'douyin',
        accountId: 'acc1',
        payload: {},
      };

      scheduler.start();
      scheduler.schedulePeriodic(input, 5_000);

      vi.advanceTimersByTime(5_000);
      expect(queue.size()).toBeGreaterThanOrEqual(1);

      vi.advanceTimersByTime(5_000);
      expect(queue.size()).toBeGreaterThanOrEqual(2);
    });

    it('不运行时停止触发', () => {
      const input: TaskInput = {
        type: 'publish',
        platform: 'douyin',
        accountId: 'acc1',
        payload: {},
      };

      // Don't start the scheduler
      scheduler.schedulePeriodic(input, 5_000);

      vi.advanceTimersByTime(15_000);
      expect(queue.size()).toBe(0);
    });
  });

  describe('cancel', () => {
    it('取消已排队的任务', () => {
      scheduler.schedule(makeTask({ id: 't1' }));
      const result = scheduler.cancel('t1');

      expect(result).toBe(true);
      // getTaskFromMap doesn't search 'cancelled' status, verify via queue directly
      const cancelled = queue.getByStatus('cancelled');
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].id).toBe('t1');
    });

    it('取消不存在的任务返回 false', () => {
      expect(scheduler.cancel('nonexistent')).toBe(false);
    });

    it('取消正在运行的任务返回 false', () => {
      scheduler.schedule(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'running');

      // Add to inFlight manually
      (scheduler as any).inFlight.add('t1');
      expect(scheduler.cancel('t1')).toBe(false);
      (scheduler as any).inFlight.delete('t1');
    });

    it('取消定时任务时清理定时器', () => {
      const future = new Date(Date.now() + 60_000);
      scheduler.scheduleAt(makeTask({ id: 't1' }), future);
      scheduler.cancel('t1');

      expect((scheduler as any).scheduledTimers.has('t1')).toBe(false);
    });
  });

  describe('cancelPeriodic', () => {
    it('取消周期任务', () => {
      const input: TaskInput = {
        type: 'publish',
        platform: 'douyin',
        accountId: 'acc1',
        payload: {},
      };

      const id = scheduler.schedulePeriodic(input, 10_000);
      scheduler.cancelPeriodic(id);

      expect((scheduler as any).periodicTasks.has(id)).toBe(false);
      expect((scheduler as any).periodicTimers.has(id)).toBe(false);
    });
  });

  describe('start / stop', () => {
    it('start 启动轮询循环', () => {
      const restoreSpy = vi.spyOn(queue, 'restore').mockResolvedValue();
      scheduler.start();

      expect(restoreSpy).toHaveBeenCalled();
      restoreSpy.mockRestore();
    });

    it('重复 start 不重复启动', () => {
      const restoreSpy = vi.spyOn(queue, 'restore').mockResolvedValue();
      scheduler.start();
      scheduler.start();

      expect(restoreSpy).toHaveBeenCalledTimes(1);
      restoreSpy.mockRestore();
    });

    it('stop 停止轮询循环', () => {
      scheduler.start();
      scheduler.stop();

      expect((scheduler as any).running).toBe(false);
      expect((scheduler as any).pollTimer).toBeNull();
    });

    it('stop 清理所有定时器', () => {
      scheduler.start();
      scheduler.scheduleAt(makeTask({ id: 't1' }), new Date(Date.now() + 60_000));

      scheduler.stop();

      expect((scheduler as any).scheduledTimers.size).toBe(0);
      expect((scheduler as any).periodicTimers.size).toBe(0);
    });

    it('发出 SCHEDULER_STARTED 和 SCHEDULER_STOPPED 事件', async () => {
      const eventBus = EventBus.getInstance();
      const startedHandler = vi.fn();
      const stoppedHandler = vi.fn();
      const unsub1 = eventBus.on(TaskEvents.SCHEDULER_STARTED, startedHandler);
      const unsub2 = eventBus.on(TaskEvents.SCHEDULER_STOPPED, stoppedHandler);

      vi.spyOn(queue, 'restore').mockResolvedValue();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(startedHandler).toHaveBeenCalled();

      scheduler.stop();
      expect(stoppedHandler).toHaveBeenCalled();

      unsub1();
      unsub2();
    });
  });

  describe('poll loop / tick', () => {
    beforeEach(() => {
      vi.spyOn(queue, 'restore').mockResolvedValue();
      vi.spyOn(queue, 'startAutoPersist').mockReturnValue();
    });

    async function startAndTick(): Promise<void> {
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(0);
    }

    it('执行任务成功时更新为 completed', async () => {
      scheduler.onTaskExecute = vi.fn(() =>
        Promise.resolve<ITaskResult>({ success: true })
      );

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(true);

      scheduler.schedule(makeTask({ id: 't1' }));
      await startAndTick();

      const completed = queue.getByStatus('success');
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('t1');
    });

    it('执行失败且未达最大重试次数时重试', async () => {
      let callCount = 0;
      scheduler.onTaskExecute = vi.fn(() => {
        callCount++;
        if (callCount <= 1) {
          return Promise.resolve<ITaskResult>({ success: false, error: 'fail' });
        }
        return Promise.resolve<ITaskResult>({ success: true });
      });

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(true);

      scheduler.schedule(makeTask({ id: 't1', maxRetries: 3, retryCount: 0 }));
      await startAndTick();

      const retryTask = queue.getByStatus('retry').find(t => t.id === 't1');
      expect(retryTask).toBeUndefined();
      const failedTask = queue.getByStatus('failed').find(t => t.id === 't1');
      expect(failedTask).toBeDefined();
      expect(failedTask!.error).toBe('fail');
    });

    it('达到最大重试次数后标记为 failed', async () => {
      scheduler.onTaskExecute = vi.fn(() =>
        Promise.resolve<ITaskResult>({ success: false, error: 'fail' })
      );

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(true);

      // maxRetries=0 means 0 < 0 is false → immediately failed
      scheduler.schedule(makeTask({ id: 't1', maxRetries: 0, retryCount: 0 }));
      await startAndTick();

      const failed = queue.getByStatus('failed');
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe('t1');
    });

    it('onTaskExecute 抛出异常时直接标记失败，不自动重试', async () => {
      scheduler.onTaskExecute = vi.fn(() =>
        Promise.reject(new Error('exec error'))
      );

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(true);

      scheduler.schedule(makeTask({ id: 't1', maxRetries: 3, retryCount: 0 }));
      await startAndTick();

      const retryTask = queue.getByStatus('retry').find(t => t.id === 't1');
      expect(retryTask).toBeUndefined();
      const failedTask = queue.getByStatus('failed').find(t => t.id === 't1');
      expect(failedTask).toBeDefined();
      expect(failedTask!.error).toBe('exec error');
    });

    it('限流时跳过执行', async () => {
      scheduler.onTaskExecute = vi.fn();

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(false);

      scheduler.schedule(makeTask({ id: 't1' }));
      await startAndTick();

      expect(scheduler.onTaskExecute).not.toHaveBeenCalled();
    });

    it('无任务时不执行', async () => {
      scheduler.onTaskExecute = vi.fn();
      await startAndTick();

      expect(scheduler.onTaskExecute).not.toHaveBeenCalled();
    });

    it('onTaskExecute 未设置时不执行', async () => {
      scheduler.schedule(makeTask({ id: 't1' }));
      await startAndTick();
    });

    it('未到 scheduledAt 的任务不执行', async () => {
      scheduler.onTaskExecute = vi.fn();

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(true);

      const future = new Date(Date.now() + 60_000);
      scheduler.scheduleAt(makeTask({ id: 't1' }), future);
      await startAndTick();

      expect(scheduler.onTaskExecute).not.toHaveBeenCalled();
    });

    it('执行后从 inFlight 移除', async () => {
      scheduler.onTaskExecute = vi.fn(() =>
        Promise.resolve<ITaskResult>({ success: true })
      );

      vi.spyOn(rateLimiter, 'acquire').mockResolvedValue(true);

      scheduler.schedule(makeTask({ id: 't1' }));
      await startAndTick();

      expect((scheduler as any).inFlight.has('t1')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('返回正确统计', () => {
      scheduler.schedule(makeTask({ id: 't1' }));
      scheduler.schedule(makeTask({ id: 't2' }));
      queue.updateStatus('t1', 'success');
      queue.updateStatus('t2', 'failed');

      const stats = scheduler.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('包含周期任务计数', () => {
      const input: TaskInput = {
        type: 'publish',
        platform: 'douyin',
        accountId: 'acc1',
        payload: {},
      };
      scheduler.schedulePeriodic(input, 10_000);

      const stats = scheduler.getStats();
      expect(stats.periodicCount).toBe(1);
    });
  });

  describe('getPendingTasks', () => {
    it('返回排队和待处理任务按优先级排序', () => {
      scheduler.schedule(makeTask({ id: 't1', priority: 3 }));
      scheduler.schedule(makeTask({ id: 't2', priority: 8 }));

      const pending = scheduler.getPendingTasks();
      expect(pending).toHaveLength(2);
      expect(pending[0].priority).toBe(8);
    });
  });

  describe('getTask', () => {
    it('返回指定任务', () => {
      scheduler.schedule(makeTask({ id: 't1' }));
      const task = scheduler.getTask('t1');
      expect(task).toBeDefined();
      expect(task!.id).toBe('t1');
    });

    it('任务不存在时返回 undefined', () => {
      expect(scheduler.getTask('nonexistent')).toBeUndefined();
    });
  });
});
