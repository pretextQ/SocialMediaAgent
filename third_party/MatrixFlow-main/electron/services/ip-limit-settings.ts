import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface IPLimitSettings {
  global: {
    maxAccountsPerIPPerPlatform: number;
    maxAccountsPerIPTotal: number;
    behaviorOnLimit: 'block' | 'warn';
  };
  platformSpecific: {
    enabled: boolean;
    limits: Array<{
      platform: string;
      maxAccounts: number;
    }>;
  };
}

export interface LimitCheckResult {
  platformCount: number;
  platformLimit: number;
  totalCount: number;
  totalLimit: number;
  platformExceeded: boolean;
  totalExceeded: boolean;
  behavior: 'block' | 'warn';
}

const DEFAULT_SETTINGS: IPLimitSettings = {
  global: {
    maxAccountsPerIPPerPlatform: 5,
    maxAccountsPerIPTotal: 20,
    behaviorOnLimit: 'warn',
  },
  platformSpecific: {
    enabled: false,
    limits: [
      { platform: 'xiaohongshu', maxAccounts: 3 },
      { platform: 'douyin', maxAccounts: 5 },
      { platform: 'channels', maxAccounts: 5 },
      { platform: 'kuaishou', maxAccounts: 8 },
      { platform: 'bilibili', maxAccounts: 10 },
    ],
  },
};

export class IPLimitSettingsService {
  private settings: IPLimitSettings;
  private configPath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config', 'ip-limit.json');
    this.settings = { ...DEFAULT_SETTINGS };
  }

  async load(): Promise<IPLimitSettings> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.settings = this.normalizeSettings(JSON.parse(content));
      return this.settings;
    } catch (error) {
      await this.ensureConfigDir();
      await this.save(DEFAULT_SETTINGS);
      this.settings = { ...DEFAULT_SETTINGS };
      return this.settings;
    }
  }

  async save(settings: IPLimitSettings): Promise<void> {
    await this.ensureConfigDir();
    const normalized = this.normalizeSettings(settings);
    await fs.writeFile(this.configPath, JSON.stringify(normalized, null, 2), 'utf-8');
    this.settings = normalized;
  }

  get(): IPLimitSettings {
    return this.settings;
  }

  getLimit(platform: string): number {
    if (this.settings.platformSpecific?.enabled) {
      const platformLimit = this.settings.platformSpecific.limits.find(
        (l) => l.platform === platform
      );
      if (platformLimit) {
        return platformLimit.maxAccounts;
      }
    }

    return this.settings.global.maxAccountsPerIPPerPlatform;
  }

  async checkLimit(
    platform: string,
    getPlatformCount: () => Promise<number>,
    getTotalCount: () => Promise<number>
  ): Promise<LimitCheckResult> {
    const platformCount = await getPlatformCount();
    const totalCount = await getTotalCount();

    const platformLimit = this.getLimit(platform);
    const totalLimit = this.settings.global.maxAccountsPerIPTotal;

    return {
      platformCount,
      platformLimit,
      totalCount,
      totalLimit,
      platformExceeded: platformCount >= platformLimit,
      totalExceeded: totalCount >= totalLimit,
      behavior: this.settings.global.behaviorOnLimit,
    };
  }

  private async ensureConfigDir(): Promise<void> {
    const dir = path.dirname(this.configPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {}
  }

  private normalizeSettings(settings: IPLimitSettings): IPLimitSettings {
    return {
      ...settings,
      platformSpecific: {
        ...settings.platformSpecific,
        limits: settings.platformSpecific.limits.map((limit) => ({
          ...limit,
          platform: limit.platform === 'weixin_video' ? 'channels' : limit.platform,
        })),
      },
    };
  }
}

let ipLimitSettingsService: IPLimitSettingsService | null = null;

export function getIPLimitSettingsService(): IPLimitSettingsService {
  if (!ipLimitSettingsService) {
    ipLimitSettingsService = new IPLimitSettingsService();
  }
  return ipLimitSettingsService;
}
