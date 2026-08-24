import { BaseRepository } from './BaseRepository';
import { runAsync } from '../Database';
import type { PublishTask, PaginationOptions, PaginatedResult } from '../types';

export class PublishTaskRepository extends BaseRepository<PublishTask> {
  constructor() {
    super('publish_tasks');
  }

  async findByStatus(status: string, options?: PaginationOptions): Promise<PaginatedResult<PublishTask>> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    return runAsync((db) => {
      const countRow = db.prepare('SELECT COUNT(*) as total FROM publish_tasks WHERE status = ?').get(status) as { total: number };
      const rows = db
        .prepare('SELECT * FROM publish_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(status, pageSize, offset) as PublishTask[];

      return { data: rows, total: countRow.total, page, pageSize };
    });
  }

  async findByContentId(contentId: string): Promise<PublishTask[]> {
    return this.findWhere({ content_id: contentId } as Partial<PublishTask>);
  }

  async findByGroupId(groupId: string): Promise<PublishTask[]> {
    return this.findWhere({ group_id: groupId } as Partial<PublishTask>);
  }

  async findPendingScheduled(beforeTime: string): Promise<PublishTask[]> {
    return runAsync((db) => {
      return db
        .prepare("SELECT * FROM publish_tasks WHERE status = 'pending' AND publish_mode = 'scheduled' AND scheduled_at <= ?")
        .all(beforeTime) as PublishTask[];
    });
  }

  async markRunning(id: string): Promise<PublishTask> {
    return this.update(id, { status: 'running' } as Partial<PublishTask>);
  }

  async markCompleted(id: string, result: string): Promise<PublishTask> {
    return this.update(id, { status: 'completed', result } as Partial<PublishTask>);
  }

  async markFailed(id: string, errorMessage: string): Promise<PublishTask> {
    return runAsync((db) => {
      const task = db.prepare('SELECT retry_count, max_retries FROM publish_tasks WHERE id = ?').get(id) as Pick<PublishTask, 'retry_count' | 'max_retries'> | undefined;
      if (!task) throw new Error(`PublishTask ${id} not found`);

      const newRetryCount = task.retry_count + 1;
      const newStatus = newRetryCount >= task.max_retries ? 'failed' : 'pending';

      db.prepare(
        `UPDATE publish_tasks SET status = ?, error_message = ?, retry_count = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newStatus, errorMessage, newRetryCount, id);

      return db.prepare('SELECT * FROM publish_tasks WHERE id = ?').get(id) as PublishTask;
    });
  }

  async markFinalFailed(id: string, errorMessage: string): Promise<PublishTask> {
    return runAsync((db) => {
      const task = db.prepare('SELECT retry_count FROM publish_tasks WHERE id = ?').get(id) as Pick<PublishTask, 'retry_count'> | undefined;
      if (!task) throw new Error(`PublishTask ${id} not found`);

      const newRetryCount = task.retry_count + 1;
      db.prepare(
        `UPDATE publish_tasks SET status = 'failed', error_message = ?, retry_count = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(errorMessage, newRetryCount, id);

      return db.prepare('SELECT * FROM publish_tasks WHERE id = ?').get(id) as PublishTask;
    });
  }
}

export const publishTaskRepo = new PublishTaskRepository();
