import { Logger } from '../core/Logger';
import { accountPublishPresetRepo, type AccountPublishPresetRow } from '../data/repositories/AccountPublishPresetRepository';
import { randomUUID } from 'crypto';

const logger = new Logger('AccountPublishPresetService');

export interface PublishPreset {
  accountId: string;
  platform: string;
  defaultTopics: string[];
  platformOptions: Record<string, unknown>;
  enabled: boolean;
  updatedAt?: string;
}

export interface SavePublishPresetInput {
  accountId: string;
  platform: string;
  defaultTopics: string[];
  platformOptions: Record<string, unknown>;
  enabled: boolean;
}

function rowToPreset(row: AccountPublishPresetRow): PublishPreset {
  let defaultTopics: string[] = [];
  let platformOptions: Record<string, unknown> = {};

  try {
    const parsedTopics = JSON.parse(row.default_topics);
    if (Array.isArray(parsedTopics)) {
      defaultTopics = parsedTopics.filter((t) => typeof t === 'string');
    }
  } catch (e) {
    logger.warn(`解析 default_topics 失败: ${row.id}`);
  }

  try {
    const parsedOptions = JSON.parse(row.platform_options);
    if (parsedOptions && typeof parsedOptions === 'object' && !Array.isArray(parsedOptions)) {
      platformOptions = parsedOptions as Record<string, unknown>;
    }
  } catch (e) {
    logger.warn(`解析 platform_options 失败: ${row.id}`);
  }

  return {
    accountId: row.account_id,
    platform: row.platform,
    defaultTopics,
    platformOptions,
    enabled: row.enabled === 1,
    updatedAt: row.updated_at,
  };
}

function normalizeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of topics) {
    if (typeof raw !== 'string') continue;
    const tag = raw.replace(/^#+/, '').replace(/#+$/, '').trim();
    if (!tag) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export class AccountPublishPresetService {
  async getPreset(accountId: string, platform: string): Promise<PublishPreset | null> {
    const row = await accountPublishPresetRepo.findByAccountAndPlatform(accountId, platform);
    return row ? rowToPreset(row) : null;
  }

  async listPresetsByAccount(accountId: string): Promise<PublishPreset[]> {
    const rows = await accountPublishPresetRepo.findByAccount(accountId);
    return rows.map(rowToPreset);
  }

  async upsertPreset(input: SavePublishPresetInput): Promise<PublishPreset> {
    const existing = await accountPublishPresetRepo.findByAccountAndPlatform(input.accountId, input.platform);
    const payload = {
      default_topics: JSON.stringify(normalizeTopics(input.defaultTopics)),
      platform_options: JSON.stringify(input.platformOptions || {}),
      enabled: input.enabled ? 1 : 0,
    };

    if (existing) {
      const updated = await accountPublishPresetRepo.update(existing.id, payload as Partial<AccountPublishPresetRow>);
      return rowToPreset(updated);
    }

    const id = randomUUID();
    const created = await accountPublishPresetRepo.insert({
      id,
      account_id: input.accountId,
      platform: input.platform,
      ...payload,
    } as Omit<AccountPublishPresetRow, 'created_at' | 'updated_at'>);

    return rowToPreset(created);
  }

  async deletePreset(accountId: string, platform: string): Promise<boolean> {
    const existing = await accountPublishPresetRepo.findByAccountAndPlatform(accountId, platform);
    if (!existing) return false;
    return accountPublishPresetRepo.deleteById(existing.id);
  }
}

export const accountPublishPresetService = new AccountPublishPresetService();
