import { BaseRepository } from './BaseRepository';
import type { Draft } from '../types';

export class DraftRepository extends BaseRepository<Draft> {
  constructor() {
    super('drafts');
  }

  async findByPlatform(platform: string): Promise<Draft[]> {
    return this.findWhere({ platform } as Partial<Draft>);
  }

  async findByContentId(contentId: string): Promise<Draft[]> {
    return this.findWhere({ content_id: contentId } as Partial<Draft>);
  }
}

export const draftRepo = new DraftRepository();
