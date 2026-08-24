import { BaseRepository } from './BaseRepository';
import { getDatabase } from '../Database';
import type { Group } from '../types';

export class GroupRepository extends BaseRepository<Group> {
  constructor() {
    super('groups');
  }

  async findOrdered(): Promise<Group[]> {
    const db = getDatabase();
    return db.prepare('SELECT * FROM groups ORDER BY sort_order ASC, created_at ASC').all() as Group[];
  }

  async reorder(id: string, sortOrder: number): Promise<Group> {
    return this.update(id, { sort_order: sortOrder } as Partial<Group>);
  }
}

export const groupRepo = new GroupRepository();
