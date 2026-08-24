import { BaseRepository } from './BaseRepository';
import { runAsync } from '../Database';
import type { VideoStat, PaginationOptions, PaginatedResult } from '../types';

export class VideoStatRepository extends BaseRepository<VideoStat> {
  constructor() {
    super('video_stats');
  }

  async findByPlatformVideoId(platformVideoId: string): Promise<VideoStat[]> {
    return this.findWhere({ platform_video_id: platformVideoId } as Partial<VideoStat>);
  }

  async findByTaskItemId(taskItemId: string): Promise<VideoStat[]> {
    return this.findWhere({ task_item_id: taskItemId } as Partial<VideoStat>);
  }

  async getLatestByPlatformVideoId(platformVideoId: string): Promise<VideoStat | undefined> {
    return runAsync((db) => {
      return db
        .prepare('SELECT * FROM video_stats WHERE platform_video_id = ? ORDER BY fetch_time DESC LIMIT 1')
        .get(platformVideoId) as VideoStat | undefined;
    });
  }

  async getStatsHistory(platformVideoId: string, options?: PaginationOptions): Promise<PaginatedResult<VideoStat>> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 30;
    const offset = (page - 1) * pageSize;

    return runAsync((db) => {
      const countRow = db
        .prepare('SELECT COUNT(*) as total FROM video_stats WHERE platform_video_id = ?')
        .get(platformVideoId) as { total: number };
      const rows = db
        .prepare('SELECT * FROM video_stats WHERE platform_video_id = ? ORDER BY fetch_time DESC LIMIT ? OFFSET ?')
        .all(platformVideoId, pageSize, offset) as VideoStat[];

      return { data: rows, total: countRow.total, page, pageSize };
    });
  }
}

export const videoStatRepo = new VideoStatRepository();
