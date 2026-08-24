import { BaseRepository } from './BaseRepository';
import { getDatabase } from '../Database';
import type { CommentTemplate } from '../types';

export class CommentTemplateRepository extends BaseRepository<CommentTemplate> {
  constructor() {
    super('comment_templates');
  }

  async findByCategory(category: string): Promise<CommentTemplate[]> {
    return this.findWhere({ category } as Partial<CommentTemplate>);
  }

  async findByPlatform(platform: string): Promise<CommentTemplate[]> {
    return this.findWhere({ platform } as Partial<CommentTemplate>);
  }

  async findEnabled(): Promise<CommentTemplate[]> {
    return this.findWhere({ enabled: 1 } as Partial<CommentTemplate>);
  }

  async findEnabledByPlatform(platform: string): Promise<CommentTemplate[]> {
    const db = getDatabase();
    return db
      .prepare('SELECT * FROM comment_templates WHERE platform = ? AND enabled = 1')
      .all(platform) as CommentTemplate[];
  }

  async incrementUsage(id: string): Promise<void> {
    const db = getDatabase();
    db.prepare('UPDATE comment_templates SET usage_count = usage_count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  }

  async getRandomEnabled(platform?: string): Promise<CommentTemplate | undefined> {
    const db = getDatabase();

    if (platform) {
      return db
        .prepare('SELECT * FROM comment_templates WHERE enabled = 1 AND (platform = ? OR platform = \'\') ORDER BY RANDOM() LIMIT 1')
        .get(platform) as CommentTemplate | undefined;
    }
    return db
      .prepare('SELECT * FROM comment_templates WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1')
      .get() as CommentTemplate | undefined;
  }
}

export const commentTemplateRepo = new CommentTemplateRepository();
