import { BaseRepository } from './BaseRepository';
import { runAsync } from '../Database';
import type { Content, PaginationOptions, PaginatedResult } from '../types';

export class ContentRepository extends BaseRepository<Content> {
  constructor() {
    super('contents');
  }

  async findByType(type: string, options?: PaginationOptions): Promise<PaginatedResult<Content>> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    return runAsync((db) => {
      const countRow = db.prepare('SELECT COUNT(*) as total FROM contents WHERE type = ?').get(type) as { total: number };
      const rows = db
        .prepare('SELECT * FROM contents WHERE type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(type, pageSize, offset) as Content[];

      return { data: rows, total: countRow.total, page, pageSize };
    });
  }

  async findByStatus(status: string): Promise<Content[]> {
    return this.findWhere({ status } as Partial<Content>);
  }

  async search(keyword: string): Promise<Content[]> {
    return runAsync((db) => {
      return db
        .prepare("SELECT * FROM contents WHERE title LIKE ? OR description LIKE ? ORDER BY created_at DESC")
        .all(`%${keyword}%`, `%${keyword}%`) as Content[];
    });
  }
}

export const contentRepo = new ContentRepository();
