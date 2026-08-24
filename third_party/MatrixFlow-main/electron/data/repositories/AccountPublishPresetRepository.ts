import { BaseRepository } from './BaseRepository';

export interface AccountPublishPresetRow {
  id: string;
  account_id: string;
  platform: string;
  default_topics: string;
  platform_options: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export class AccountPublishPresetRepository extends BaseRepository<AccountPublishPresetRow> {
  constructor() {
    super('account_publish_presets');
  }

  async findByAccount(accountId: string): Promise<AccountPublishPresetRow[]> {
    return this.findWhere({ account_id: accountId } as Partial<AccountPublishPresetRow>);
  }

  async findByAccountAndPlatform(accountId: string, platform: string): Promise<AccountPublishPresetRow | undefined> {
    return this.findOneWhere({ account_id: accountId, platform } as Partial<AccountPublishPresetRow>);
  }
}

export const accountPublishPresetRepo = new AccountPublishPresetRepository();
