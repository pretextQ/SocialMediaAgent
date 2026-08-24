import { BaseRepository } from './BaseRepository';
import { runAsync, runInTransactionAsync } from '../Database';
import type { TaskItem } from '../types';

export class TaskItemRepository extends BaseRepository<TaskItem> {
  constructor() {
    super('task_items');
  }

  async findByTaskId(taskId: string): Promise<TaskItem[]> {
    return this.findWhere({ task_id: taskId } as Partial<TaskItem>);
  }

  async findByAccountId(accountId: string): Promise<TaskItem[]> {
    return this.findWhere({ account_id: accountId } as Partial<TaskItem>);
  }

  async findByStatus(status: string): Promise<TaskItem[]> {
    return this.findWhere({ status } as Partial<TaskItem>);
  }

  async createBatch(items: Omit<TaskItem, 'created_at' | 'updated_at'>[]): Promise<TaskItem[]> {
    return runInTransactionAsync((db) => {
      const stmt = db.prepare(`
        INSERT INTO task_items (id, task_id, account_id, platform, status, platform_video_id, publish_url, error_message, started_at, completed_at)
        VALUES (@id, @task_id, @account_id, @platform, @status, @platform_video_id, @publish_url, @error_message, @started_at, @completed_at)
      `);

      const results: TaskItem[] = [];
      for (const item of items) {
        stmt.run(item);
        results.push(db.prepare('SELECT * FROM task_items WHERE id = ?').get((item as any).id) as TaskItem);
      }
      return results;
    });
  }

  async markStarted(id: string): Promise<TaskItem> {
    return this.update(id, {
      status: 'running',
      started_at: new Date().toISOString(),
    } as Partial<TaskItem>);
  }

  async markCompleted(id: string, platformVideoId: string, publishUrl: string): Promise<TaskItem> {
    return this.update(id, {
      status: 'completed',
      platform_video_id: platformVideoId,
      publish_url: publishUrl,
      completed_at: new Date().toISOString(),
    } as Partial<TaskItem>);
  }

  async markFailed(id: string, errorMessage: string): Promise<TaskItem> {
    return this.update(id, {
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    } as Partial<TaskItem>);
  }

  async getPendingCountByTask(taskId: string): Promise<number> {
    return runAsync((db) => {
      const row = db
        .prepare("SELECT COUNT(*) as total FROM task_items WHERE task_id = ? AND status IN ('pending', 'running')")
        .get(taskId) as { total: number };
      return row.total;
    });
  }
}

export const taskItemRepo = new TaskItemRepository();
