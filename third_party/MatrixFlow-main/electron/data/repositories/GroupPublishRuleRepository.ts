import { BaseRepository } from './BaseRepository';
import { getDatabase } from '../Database';
import type { GroupPublishRule } from '../types';

export class GroupPublishRuleRepository extends BaseRepository<GroupPublishRule> {
  constructor() {
    super('group_publish_rules');
  }

  async findByGroupId(groupId: string): Promise<GroupPublishRule[]> {
    return this.findWhere({ group_id: groupId } as Partial<GroupPublishRule>);
  }

  async findByPlatform(platform: string): Promise<GroupPublishRule[]> {
    return this.findWhere({ platform } as Partial<GroupPublishRule>);
  }

  async findEnabledByGroup(groupId: string): Promise<GroupPublishRule[]> {
    const db = getDatabase();
    return db
      .prepare('SELECT * FROM group_publish_rules WHERE group_id = ? AND enabled = 1')
      .all(groupId) as GroupPublishRule[];
  }

  async setEnabled(id: string, enabled: boolean): Promise<GroupPublishRule> {
    return this.update(id, { enabled: enabled ? 1 : 0 } as Partial<GroupPublishRule>);
  }
}

export const groupPublishRuleRepo = new GroupPublishRuleRepository();
