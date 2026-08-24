import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueueManager, generateId } from '@electron/core/QueueManager';
import type { ITask, TaskStatus } from '@electron/core/types/task';
import { EventBus } from '@electron/core/EventBus';
import { getDatabase } from '@electron/data/Database';

// Mock Database module
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

describe('QueueManager', () => {
  let queue: QueueManager;

  beforeEach(() => {
    // Reset singleton
    (QueueManager as any).instance = null;
    queue = QueueManager.getInstance();
  });

  afterEach(() => {
    queue.stopAutoPersist();
    queue.clear();
    (QueueManager as any).instance = null;
  });

  describe('getInstance', () => {
    it('返回单例实例', () => {
      const a = QueueManager.getInstance();
      const b = QueueManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('enqueue', () => {
    it('将任务加入队列', () => {
      const task = makeTask({ id: 't1' });
      queue.enqueue(task);

      expect(queue.size()).toBe(1);
      const peeked = queue.peek();
      expect(peeked).toBeDefined();
      expect(peeked!.id).toBe('t1');
    });

    it('跳过重复 id 的任务', () => {
      const task = makeTask({ id: 't1' });
      queue.enqueue(task);
      queue.enqueue(task);

      expect(queue.size()).toBe(1);
    });

    it('使用默认 status=queued 如果未提供', () => {
      const task = makeTask({ id: 't1', status: undefined as unknown as TaskStatus });
      queue.enqueue(task);

      const peeked = queue.peek();
      expect(peeked!.status).toBe('queued');
    });

    it('使用默认 createdAt 如果未提供', () => {
      const task = makeTask({ id: 't1', createdAt: undefined as unknown as string });
      queue.enqueue(task);

      const peeked = queue.peek();
      expect(peeked!.createdAt).toBeDefined();
    });

    it('发出 TASK_QUEUED 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on('task:queued', handler);

      const task = makeTask({ id: 't1' });
      queue.enqueue(task);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
      unsub();
    });

    it('支持多个不同 id 的任务', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.enqueue(makeTask({ id: 't2' }));
      queue.enqueue(makeTask({ id: 't3' }));

      expect(queue.size()).toBe(3);
    });
  });

  describe('dequeue', () => {
    it('返回 undefined 如果队列为空', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('按优先级顺序出队（高优先级先出）', () => {
      queue.enqueue(makeTask({ id: 'low', priority: 1 }));
      queue.enqueue(makeTask({ id: 'high', priority: 10 }));
      queue.enqueue(makeTask({ id: 'mid', priority: 5 }));

      const first = queue.dequeue();
      expect(first!.id).toBe('high');

      const second = queue.dequeue();
      expect(second!.id).toBe('mid');

      const third = queue.dequeue();
      expect(third!.id).toBe('low');
    });

    it('同优先级按 createdAt 先到先出', () => {
      queue.enqueue(makeTask({ id: 'first', priority: 5, createdAt: '2025-01-01T00:00:00.000Z' }));
      queue.enqueue(makeTask({ id: 'second', priority: 5, createdAt: '2025-01-01T00:01:00.000Z' }));

      expect(queue.dequeue()!.id).toBe('first');
      expect(queue.dequeue()!.id).toBe('second');
    });

    it('设置 status 为 running', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      const task = queue.dequeue()!;

      expect(task.status).toBe('uploading');
      expect(task.startedAt).toBeDefined();
    });

    it('跳过 cancelled 的任务', () => {
      queue.enqueue(makeTask({ id: 't1', priority: 10 }));
      queue.enqueue(makeTask({ id: 't2', priority: 5 }));

      // Cancel t1 (high priority)
      queue.updateStatus('t1', 'cancelled');

      const dequeued = queue.dequeue();
      expect(dequeued!.id).toBe('t2');
    });

    it('发出 TASK_UPLOADING 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on('task:uploading', handler);

      queue.enqueue(makeTask({ id: 't1' }));
      queue.dequeue();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', status: 'uploading' }));
      unsub();
    });
  });

  describe('peek', () => {
    it('返回最高优先级任务但不移除', () => {
      queue.enqueue(makeTask({ id: 't1', priority: 3 }));
      queue.enqueue(makeTask({ id: 't2', priority: 8 }));

      const peeked = queue.peek();
      expect(peeked!.id).toBe('t2');
      expect(queue.size()).toBe(2);
    });

    it('返回 undefined 如果队列为空', () => {
      expect(queue.peek()).toBeUndefined();
    });

    it('跳过 cancelled 任务', () => {
      queue.enqueue(makeTask({ id: 't1', priority: 10 }));
      queue.updateStatus('t1', 'cancelled');

      expect(queue.peek()).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('更新任务状态', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'success');

      const tasks = queue.getByStatus('success');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t1');
    });

    it('设置 completedAt 当状态为 success', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'success');

      const tasks = queue.getByStatus('success');
      expect(tasks[0].completedAt).toBeDefined();
    });

    it('设置 completedAt 当状态为 failed', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'failed');

      const tasks = queue.getByStatus('failed');
      expect(tasks[0].completedAt).toBeDefined();
    });

    it('设置 error 信息', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'failed', 'something went wrong');

      const tasks = queue.getByStatus('failed');
      expect(tasks[0].error).toBe('something went wrong');
    });

    it('对不存在的任务静默忽略', () => {
      expect(() => queue.updateStatus('nonexistent', 'success')).not.toThrow();
    });

    it('发出 success 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on('task:success', handler);

      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'success');

      expect(handler).toHaveBeenCalled();
      unsub();
    });

    it('发出 failed 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on('task:failed', handler);

      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'failed', 'error');

      expect(handler).toHaveBeenCalled();
      unsub();
    });

    it('发出 cancelled 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on('task:cancelled', handler);

      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'cancelled');

      expect(handler).toHaveBeenCalled();
      unsub();
    });

    it('发出 retry 事件', () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on('task:retry', handler);

      queue.enqueue(makeTask({ id: 't1' }));
      queue.updateStatus('t1', 'retry', 'retrying');

      expect(handler).toHaveBeenCalled();
      unsub();
    });
  });

  describe('getByStatus', () => {
    it('返回指定状态的任务列表', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.enqueue(makeTask({ id: 't2' }));
      queue.updateStatus('t1', 'success');

      const success = queue.getByStatus('success');
      const queued = queue.getByStatus('queued');

      expect(success).toHaveLength(1);
      expect(queued).toHaveLength(1);
    });

    it('返回空数组如果没有匹配', () => {
      expect(queue.getByStatus('failed')).toEqual([]);
    });

    it('返回副本，不影响内部状态', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      const tasks = queue.getByStatus('queued');
      tasks[0].status = 'success';

      // Original should be unaffected
      const original = queue.getByStatus('queued');
      expect(original).toHaveLength(1);
    });
  });

  describe('getByPlatform', () => {
    it('返回指定平台的任务列表', () => {
      queue.enqueue(makeTask({ id: 't1', platform: 'douyin' }));
      queue.enqueue(makeTask({ id: 't2', platform: 'xiaohongshu' }));
      queue.enqueue(makeTask({ id: 't3', platform: 'douyin' }));

      const douyinTasks = queue.getByPlatform('douyin');
      expect(douyinTasks).toHaveLength(2);
    });

    it('返回空数组如果没有匹配', () => {
      expect(queue.getByPlatform('nonexistent')).toEqual([]);
    });
  });

  describe('size', () => {
    it('返回队列中非 cancelled 的任务数', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.enqueue(makeTask({ id: 't2' }));
      queue.updateStatus('t1', 'cancelled');

      expect(queue.size()).toBe(1);
    });

    it('空队列返回 0', () => {
      expect(queue.size()).toBe(0);
    });
  });

  describe('clear', () => {
    it('清空所有任务', () => {
      queue.enqueue(makeTask({ id: 't1' }));
      queue.enqueue(makeTask({ id: 't2' }));
      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.peek()).toBeUndefined();
    });
  });

  describe('min-heap 优先级排序', () => {
    it('大量任务排序正确', () => {
      const priorities = [3, 7, 1, 9, 5, 2, 8, 4, 6, 0];
      for (let i = 0; i < priorities.length; i++) {
        queue.enqueue(makeTask({
          id: `t${i}`,
          priority: priorities[i],
          createdAt: new Date(Date.now() + i).toISOString(),
        }));
      }

      const order: number[] = [];
      while (queue.size() > 0) {
        const task = queue.dequeue()!;
        order.push(task.priority);
      }

      // High to low
      expect(order).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    });
  });

  describe('persist / restore', () => {
    it('persist 不抛出异常（数据库可用时）', async () => {
      queue.enqueue(makeTask({ id: 't1' }));
      await expect(queue.persist()).resolves.toBeUndefined();
    });

    it('restore 不抛出异常', async () => {
      await expect(queue.restore()).resolves.toBeUndefined();
    });

    it('restore 只恢复历史记录，不把旧 pending/queued 任务重新入队', async () => {
      const db = getDatabase() as any;
      const tableInfoStmt = {
        all: vi.fn(() => []),
      };
      const rowsStmt = {
        all: vi.fn(() => [
          {
            id: 'old-pending',
            type: 'publish',
            platform: 'kuaishou',
            accountId: 'account-1',
            priority: 10,
            payload: JSON.stringify({ publishTaskId: 'pt-old' }),
            status: 'pending',
            created_at: '2026-06-01T00:00:00.000Z',
            scheduled_at: null,
            started_at: null,
            completed_at: null,
            error: null,
            retry_count: 0,
            max_retries: 3,
          },
          {
            id: 'old-queued',
            type: 'publish',
            platform: 'kuaishou',
            accountId: 'account-1',
            priority: 9,
            payload: JSON.stringify({ publishTaskId: 'pt-old-2' }),
            status: 'queued',
            created_at: '2026-06-01T00:01:00.000Z',
            scheduled_at: null,
            started_at: null,
            completed_at: null,
            error: null,
            retry_count: 0,
            max_retries: 3,
          },
        ]),
      };
      const stmt = {
        run: vi.fn(),
        all: vi.fn(() => []),
        get: vi.fn(() => undefined),
      };

      db.prepare.mockImplementation((sql: string) => {
        if (sql === 'PRAGMA table_info(tasks)') return tableInfoStmt;
        if (sql.startsWith('SELECT * FROM tasks')) return rowsStmt;
        return stmt;
      });

      await queue.restore();

      expect(queue.size()).toBe(0);
      expect(queue.peek()).toBeUndefined();
      expect(queue.getByStatus('pending')).toHaveLength(1);
      expect(queue.getByStatus('queued')).toHaveLength(1);
    });

    it('persist 会补齐旧 tasks 表缺失的队列字段', async () => {
      const db = getDatabase() as any;
      const tableInfoStmt = {
        all: vi.fn(() => [
          { name: 'id' },
          { name: 'type' },
          { name: 'payload' },
          { name: 'status' },
          { name: 'priority' },
          { name: 'scheduled_at' },
          { name: 'started_at' },
          { name: 'completed_at' },
          { name: 'error_message' },
          { name: 'retry_count' },
          { name: 'max_retries' },
          { name: 'created_at' },
          { name: 'updated_at' },
        ]),
      };
      const stmt = {
        run: vi.fn(),
        all: vi.fn(() => []),
        get: vi.fn(() => undefined),
      };

      db.exec.mockClear();
      db.prepare.mockImplementation((sql: string) => {
        if (sql === 'PRAGMA table_info(tasks)') return tableInfoStmt;
        return stmt;
      });

      queue.enqueue(makeTask({ id: 't1' }));
      await expect(queue.persist()).resolves.toBeUndefined();

      expect(db.exec).toHaveBeenCalledWith("ALTER TABLE tasks ADD COLUMN platform TEXT NOT NULL DEFAULT ''");
      expect(db.exec).toHaveBeenCalledWith("ALTER TABLE tasks ADD COLUMN accountId TEXT NOT NULL DEFAULT ''");
      expect(db.exec).toHaveBeenCalledWith('ALTER TABLE tasks ADD COLUMN error TEXT');
      expect(db.exec).toHaveBeenCalledWith('UPDATE tasks SET error = error_message WHERE error IS NULL AND error_message IS NOT NULL');
    });
  });

  describe('startAutoPersist / stopAutoPersist', () => {
    it('定时触发 persist', () => {
      vi.useFakeTimers();
      const persistSpy = vi.spyOn(queue, 'persist').mockResolvedValue();

      queue.startAutoPersist();

      vi.advanceTimersByTime(5_000);
      expect(persistSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5_000);
      expect(persistSpy).toHaveBeenCalledTimes(2);

      queue.stopAutoPersist();
      vi.advanceTimersByTime(5_000);
      expect(persistSpy).toHaveBeenCalledTimes(2);

      persistSpy.mockRestore();
      vi.useRealTimers();
    });

    it('重复调用 startAutoPersist 不会创建多个 timer', () => {
      vi.useFakeTimers();
      const persistSpy = vi.spyOn(queue, 'persist').mockResolvedValue();

      queue.startAutoPersist();
      queue.startAutoPersist();

      vi.advanceTimersByTime(5_000);
      expect(persistSpy).toHaveBeenCalledTimes(1);

      queue.stopAutoPersist();
      persistSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('generateId', () => {
    it('生成 task_ 前缀的 id', () => {
      const id = generateId();
      expect(id).toMatch(/^task_\d+_[a-z0-9]+$/);
    });

    it('生成唯一 id', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
