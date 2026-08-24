import { BaseRepository } from './BaseRepository';
import type { PublishRecord } from '../types';

export class PublishRecordRepository extends BaseRepository<PublishRecord> {
  constructor() {
    super('publish_records');
  }

  async findByVideoId(videoId: string): Promise<PublishRecord[]> {
    return this.findWhere({ video_id: videoId } as Partial<PublishRecord>);
  }

  async findByAccountId(accountId: string): Promise<PublishRecord[]> {
    return this.findWhere({ account_id: accountId } as Partial<PublishRecord>);
  }

  async findByStatus(status: string): Promise<PublishRecord[]> {
    return this.findWhere({ status } as Partial<PublishRecord>);
  }

  async markStarted(id: string): Promise<PublishRecord> {
    return this.update(id, {
      status: 'running',
      started_at: new Date().toISOString(),
    } as Partial<PublishRecord>);
  }

  async markCompleted(id: string, durationMs: number): Promise<PublishRecord> {
    return this.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    } as Partial<PublishRecord>);
  }

  async markFailed(id: string, errorMessage: string): Promise<PublishRecord> {
    return this.update(id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    } as Partial<PublishRecord>);
  }
}

export const publishRecordRepo = new PublishRecordRepository();
