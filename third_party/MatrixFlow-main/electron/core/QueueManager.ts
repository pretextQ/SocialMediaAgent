import { Logger } from './Logger';
import { EventBus } from './EventBus';
import { getDatabase, isDatabaseAvailable, initDatabase } from '../data/Database';
import { TaskEvents } from './types/task';
import type { IQueueManager, ITask, TaskStatus } from './types/task';

// ============================================================
// Task Status UI Mappings - v0.3.1 8态状态机
// ============================================================

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: '排队中',
  pending: '等待中',
  uploading: '上传中',
  publishing: '发布中',
  audit: '审核中',
  success: '已发布',
  failed: '失败',
  cancelled: '已取消',
  retry: '重试中',
  skipped: '已跳过',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, { bg: string; fg: string }> = {
  queued: { bg: '#FEF3C7', fg: '#D97706' },
  pending: { bg: '#F3F4F6', fg: '#6B7280' },
  uploading: { bg: '#DBEAFE', fg: '#2563EB' },
  publishing: { bg: '#F3E8FF', fg: '#7C3AED' },
  audit: { bg: '#FEF3C7', fg: '#D97706' },
  success: { bg: '#D1FAE5', fg: '#059669' },
  failed: { bg: '#FEE2E2', fg: '#DC2626' },
  cancelled: { bg: '#F3F4F6', fg: '#6B7280' },
  retry: { bg: '#FFEDD5', fg: '#EA580C' },
  skipped: { bg: '#F3F4F6', fg: '#9CA3AF' },
};

export const VALID_STATE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['pending', 'cancelled'],
  pending: ['uploading', 'cancelled'],
  uploading: ['publishing', 'failed', 'cancelled'],
  publishing: ['audit', 'failed', 'cancelled'],
  audit: ['success', 'failed'],
  success: [],
  failed: ['retry', 'queued'],
  cancelled: [],
  retry: ['queued'],
  skipped: [],
};

const logger = new Logger('QueueManager');

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  accountId TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3
);
`;

const INSERT_SQL = `
INSERT OR REPLACE INTO tasks (id, type, platform, accountId, priority, payload, status, created_at, scheduled_at, started_at, completed_at, error, retry_count, max_retries)
VALUES (@id, @type, @platform, @accountId, @priority, @payload, @status, @created_at, @scheduled_at, @started_at, @completed_at, @error, @retry_count, @max_retries);
`;

const UPDATE_STATUS_SQL = `
UPDATE tasks SET status = @status, error = @error, started_at = @started_at, completed_at = @completed_at, retry_count = @retry_count
WHERE id = @id;
`;

const REQUIRED_TASK_COLUMNS: Record<string, string> = {
  platform: "ALTER TABLE tasks ADD COLUMN platform TEXT NOT NULL DEFAULT ''",
  accountId: "ALTER TABLE tasks ADD COLUMN accountId TEXT NOT NULL DEFAULT ''",
  error: 'ALTER TABLE tasks ADD COLUMN error TEXT',
};

function ensureTasksSchema(db: any): void {
  const rows = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
  const columns = new Set(rows.map((row) => row.name));
  const applied: string[] = [];

  for (const [column, sql] of Object.entries(REQUIRED_TASK_COLUMNS)) {
    if (!columns.has(column)) {
      db.exec(sql);
      columns.add(column);
      applied.push(column);
    }
  }

  if (columns.has('error') && columns.has('error_message')) {
    db.exec('UPDATE tasks SET error = error_message WHERE error IS NULL AND error_message IS NOT NULL');
  }

  if (applied.length > 0) {
    logger.info(`Schema fix: added missing task column(s): ${applied.join(', ')}`);
  }
}

function parsePayload(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return raw;
  }
}

function payloadField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : undefined;
}

export class QueueManager implements IQueueManager {
  private static instance: QueueManager;

  private heap: ITask[] = [];
  private taskMap = new Map<string, ITask>();
  private eventBus: EventBus;
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  private static readonly PERSIST_INTERVAL_MS = 5_000;

  private constructor() {
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  enqueue(task: ITask): void {
    if (this.taskMap.has(task.id)) {
      logger.warn(`任务已存在，跳过入队: ${task.id}`);
      return;
    }

    const enriched: ITask = {
      ...task,
      status: task.status || 'queued',
      createdAt: task.createdAt || new Date().toISOString(),
    };

    this.taskMap.set(enriched.id, enriched);
    this.heapPush(enriched);
    this.dirty = true;

    logger.info(`任务入队: ${enriched.id} type=${enriched.type} platform=${enriched.platform} priority=${enriched.priority}`);
    this.eventBus.emit(TaskEvents.TASK_QUEUED, enriched);
  }

  dequeue(): ITask | undefined {
    if (this.heap.length === 0) return undefined;

    const task = this.heapPop()!;
    if (task.status === 'cancelled') {
      return this.dequeue();
    }

    task.status = 'uploading';
    task.startedAt = new Date().toISOString();
    this.taskMap.set(task.id, task);
    this.dirty = true;

    logger.info(`任务出队: ${task.id} type=${task.type}`);
    this.eventBus.emit(TaskEvents.TASK_UPLOADING, task);
    return task;
  }

  peek(): ITask | undefined {
    while (this.heap.length > 0 && this.heap[0].status === 'cancelled') {
      this.heapPop();
    }
    return this.heap[0];
  }

  updateStatus(taskId: string, status: TaskStatus, error?: string): void {
    const task = this.taskMap.get(taskId);
    if (!task) {
      logger.warn(`更新状态失败，任务不存在: ${taskId}`);
      return;
    }

    const prevStatus = task.status;
    task.status = status;
    task.error = error;

    if (status === 'success' || status === 'failed' || status === 'cancelled') {
      task.completedAt = new Date().toISOString();
    }

    this.taskMap.set(taskId, task);
    this.dirty = true;

    logger.info(`任务状态变更: ${taskId} ${prevStatus} -> ${status}${error ? ` error=${error}` : ''}`);

    const eventMap: Record<string, string> = {
      success: TaskEvents.TASK_SUCCESS,
      failed: TaskEvents.TASK_FAILED,
      cancelled: TaskEvents.TASK_CANCELLED,
      retry: TaskEvents.TASK_RETRY,
      uploading: TaskEvents.TASK_UPLOADING,
      publishing: TaskEvents.TASK_PUBLISHING,
      audit: TaskEvents.TASK_AUDIT,
    };
    const event = eventMap[status];
    if (event) {
      this.eventBus.emit(event, task);
    }
  }

  getByStatus(status: TaskStatus): ITask[] {
    const result: ITask[] = [];
    for (const task of this.taskMap.values()) {
      if (task.status === status) result.push({ ...task });
    }
    return result;
  }

  getByPlatform(platform: string): ITask[] {
    const result: ITask[] = [];
    for (const task of this.taskMap.values()) {
      if (task.platform === platform) result.push({ ...task });
    }
    return result;
  }

  size(): number {
    return this.heap.filter((t) => t.status !== 'cancelled').length;
  }

  async persist(): Promise<void> {
    if (!this.dirty) return;

    const db = this.getDb();
    if (!db) {
      logger.warn('数据库不可用，跳过持久化');
      return;
    }

    try {
      db.exec(CREATE_TABLE_SQL);
      ensureTasksSchema(db);
      const insertStmt = db.prepare(INSERT_SQL);
      const updateStmt = db.prepare(UPDATE_STATUS_SQL);

      const batch = db.transaction((tasks: ITask[]) => {
        for (const task of tasks) {
          const row = {
            id: task.id,
            type: task.type,
            platform: task.platform,
            accountId: task.accountId,
            priority: task.priority,
            payload: JSON.stringify(task.payload),
            status: task.status,
            created_at: task.createdAt,
            scheduled_at: task.scheduledAt ?? null,
            started_at: task.startedAt ?? null,
            completed_at: task.completedAt ?? null,
            error: task.error ?? null,
            retry_count: task.retryCount,
            max_retries: task.maxRetries,
          };

          if (task.status === 'uploading' || task.status === 'publishing' || task.status === 'audit') {
            updateStmt.run({
              id: task.id,
              status: task.status,
              error: task.error ?? null,
              started_at: task.startedAt,
              completed_at: task.completedAt ?? null,
              retry_count: task.retryCount,
            });
          } else {
            insertStmt.run(row);
          }
        }
      });

      const allTasks = Array.from(this.taskMap.values());
      batch(allTasks);
      this.dirty = false;

      logger.info(`已持久化 ${allTasks.length} 个任务到数据库`);
      this.eventBus.emit(TaskEvents.QUEUE_PERSISTED, { count: allTasks.length });
    } catch (err) {
      logger.error('任务持久化失败:', err);
    }
  }

  async restore(): Promise<void> {
    const db = this.getDb();
    if (!db) {
      logger.warn('数据库不可用，跳过恢复');
      return;
    }

    try {
      db.exec(CREATE_TABLE_SQL);
      ensureTasksSchema(db);

      const rows = db.prepare('SELECT * FROM tasks ORDER BY priority DESC, created_at ASC').all() as Record<string, unknown>[];

      this.heap = [];
      this.taskMap.clear();

      for (const row of rows) {
        const payload = parsePayload(row.payload);
        const task: ITask = {
          id: row.id as string,
          type: row.type as ITask['type'],
          platform: (row.platform as string) || payloadField(payload, 'platform') || 'unknown',
          accountId: (row.accountId as string) || payloadField(payload, 'accountId') || payloadField(payload, 'account_id') || '',
          priority: row.priority as number,
          payload,
          status: row.status as TaskStatus,
          createdAt: (row.created_at as string) || new Date().toISOString(),
          scheduledAt: (row.scheduled_at as string) || undefined,
          startedAt: (row.started_at as string) || undefined,
          completedAt: (row.completed_at as string) || undefined,
          error: (row.error as string) || undefined,
          retryCount: (row.retry_count as number) || 0,
          maxRetries: (row.max_retries as number) || 3,
        };

        this.taskMap.set(task.id, task);
      }

      logger.info(`已恢复 ${this.taskMap.size} 个任务（队列中 ${this.heap.length} 个）`);
      this.eventBus.emit(TaskEvents.QUEUE_RESTORED, { total: this.taskMap.size, queued: this.heap.length });
    } catch (err) {
      logger.error('任务恢复失败:', err);
    }
  }

  clear(): void {
    this.heap = [];
    this.taskMap.clear();
    this.dirty = true;
    logger.info('队列已清空');
  }

  startAutoPersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      this.persist().catch((err) => logger.error('自动持久化失败:', err));
    }, QueueManager.PERSIST_INTERVAL_MS);
    logger.info(`自动持久化已启动 (间隔 ${QueueManager.PERSIST_INTERVAL_MS}ms)`);
  }

  stopAutoPersist(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
      logger.info('自动持久化已停止');
    }
  }

  private getDb(): any | null {
    if (!isDatabaseAvailable()) {
      try {
        const db = initDatabase();
        return db;
      } catch {
        return null;
      }
    }
    try {
      return getDatabase();
    } catch {
      return null;
    }
  }

  // ---- 最小堆（按 priority 降序 -> createdAt 升序） ----

  private heapPush(task: ITask): void {
    this.heap.push(task);
    this.siftUp(this.heap.length - 1);
  }

  private heapPop(): ITask | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[parent]) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest !== i) {
        [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
        i = smallest;
      } else break;
    }
  }

  private compare(a: ITask, b: ITask): number {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt.localeCompare(b.createdAt);
  }
}

export { generateId };
