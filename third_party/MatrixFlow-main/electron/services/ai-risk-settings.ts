import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface AIRiskSettings {
  sensitivity: 'low' | 'medium' | 'high';
  alertThreshold: 'low' | 'medium' | 'high';
  weights: {
    sameIPAccounts: number;
    platformRisk: number;
    accountHistory: number;
  };
  platformRiskWeights: {
    xiaohongshu: number;
    douyin: number;
    channels: number;
    kuaishou: number;
    bilibili: number;
  };
}

export interface RiskContext {
  platform: string;
  sameIPCount: number;
  limit: number;
  failedLogins?: number;
  accountAgeDays?: number;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  factors: {
    sameIP: number;
    platform: number;
    history: number;
  };
}

const DEFAULT_SETTINGS: AIRiskSettings = {
  sensitivity: 'medium',
  alertThreshold: 'medium',
  weights: {
    sameIPAccounts: 0.4,
    platformRisk: 0.3,
    accountHistory: 0.3,
  },
  platformRiskWeights: {
    xiaohongshu: 1.0,
    douyin: 0.9,
    channels: 0.7,
    kuaishou: 0.6,
    bilibili: 0.3,
  },
};

export class AIRiskSettingsService {
  private settings: AIRiskSettings;
  private configPath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config', 'ai-risk-settings.json');
    this.settings = { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights }, platformRiskWeights: { ...DEFAULT_SETTINGS.platformRiskWeights } };
  }

  async load(): Promise<AIRiskSettings> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.settings = this.normalizeSettings(JSON.parse(content));
      return this.settings;
    } catch {
      await this.ensureConfigDir();
      await this.save(DEFAULT_SETTINGS);
      this.settings = { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights }, platformRiskWeights: { ...DEFAULT_SETTINGS.platformRiskWeights } };
      return this.settings;
    }
  }

  async save(settings: AIRiskSettings): Promise<void> {
    await this.ensureConfigDir();
    const normalized = this.normalizeSettings(settings);
    await fs.writeFile(this.configPath, JSON.stringify(normalized, null, 2), 'utf-8');
    this.settings = normalized;
  }

  get(): AIRiskSettings {
    return this.settings;
  }

  assess(context: RiskContext): RiskAssessment {
    const sameIPScore = this.calculateSameIPScore(context);
    const platformScore = this.calculatePlatformScore(context.platform);
    const historyScore = this.calculateHistoryScore(context);

    const totalScore =
      sameIPScore * this.settings.weights.sameIPAccounts +
      platformScore * this.settings.weights.platformRisk +
      historyScore * this.settings.weights.accountHistory;

    const thresholds = this.getThresholds();

    let level: RiskLevel = 'low';
    if (totalScore >= thresholds.high) level = 'high';
    else if (totalScore >= thresholds.medium) level = 'medium';

    return {
      level,
      score: Math.round(totalScore * 100) / 100,
      factors: {
        sameIP: Math.round(sameIPScore * 100) / 100,
        platform: Math.round(platformScore * 100) / 100,
        history: Math.round(historyScore * 100) / 100,
      },
    };
  }

  private calculateSameIPScore(context: RiskContext): number {
    if (context.limit <= 0) return 1.0;
    const ratio = context.sameIPCount / context.limit;
    if (ratio >= 1.0) return 1.0;
    if (ratio >= 0.8) return 0.8;
    if (ratio >= 0.6) return 0.5;
    if (ratio >= 0.3) return 0.2;
    return 0.1;
  }

  private calculatePlatformScore(platform: string): number {
    const weights = this.settings.platformRiskWeights as Record<string, number>;
    return weights[platform] ?? 0.5;
  }

  private calculateHistoryScore(context: RiskContext): number {
    let score = 0;
    if ((context.failedLogins ?? 0) >= 5) score += 0.5;
    else if ((context.failedLogins ?? 0) >= 3) score += 0.3;
    if ((context.accountAgeDays ?? 30) < 7) score += 0.3;
    return Math.min(score, 1.0);
  }

  private getThresholds(): { low: number; medium: number; high: number } {
    switch (this.settings.sensitivity) {
      case 'low': return { low: 0.3, medium: 0.6, high: 0.9 };
      case 'medium': return { low: 0.2, medium: 0.4, high: 0.7 };
      case 'high': return { low: 0.1, medium: 0.3, high: 0.5 };
    }
  }

  private async ensureConfigDir(): Promise<void> {
    const dir = path.dirname(this.configPath);
    try { await fs.mkdir(dir, { recursive: true }); } catch {}
  }

  private normalizeSettings(settings: AIRiskSettings): AIRiskSettings {
    const weights = {
      ...settings.platformRiskWeights,
    } as AIRiskSettings['platformRiskWeights'] & { weixin_video?: number };

    if (weights.weixin_video !== undefined && weights.channels === undefined) {
      weights.channels = weights.weixin_video;
    }
    delete weights.weixin_video;

    return {
      ...settings,
      platformRiskWeights: weights,
    };
  }
}

let aiRiskSettingsService: AIRiskSettingsService | null = null;

export function getAIRiskSettingsService(): AIRiskSettingsService {
  if (!aiRiskSettingsService) {
    aiRiskSettingsService = new AIRiskSettingsService();
  }
  return aiRiskSettingsService;
}
