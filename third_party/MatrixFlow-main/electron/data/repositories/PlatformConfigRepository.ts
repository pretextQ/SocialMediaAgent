import { BaseRepository } from './BaseRepository';
import { getDatabase } from '../Database';
import type { PlatformConfig } from '../types';

export class PlatformConfigRepository extends BaseRepository<PlatformConfig> {
  constructor() {
    super('platform_configs');
  }

  async findByPlatform(platform: string): Promise<PlatformConfig[]> {
    return this.findWhere({ platform } as Partial<PlatformConfig>);
  }

  async findByKey(platform: string, key: string): Promise<PlatformConfig | undefined> {
    return this.findOneWhere({ platform, config_key: key } as Partial<PlatformConfig>);
  }

  async upsert(platform: string, key: string, value: string, description?: string): Promise<PlatformConfig> {
    const existing = await this.findByKey(platform, key);
    if (existing) {
      const data: Partial<PlatformConfig> = { config_value: value };
      if (description !== undefined) data.description = description;
      return this.update(existing.id, data);
    }

    const id = this.generateId();
    return this.insert({
      id,
      platform,
      config_key: key,
      config_value: value,
      description: description ?? '',
    } as any);
  }
}

export const platformConfigRepo = new PlatformConfigRepository();
