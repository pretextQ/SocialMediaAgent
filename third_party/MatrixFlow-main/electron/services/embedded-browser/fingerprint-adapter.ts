import { randomUUID } from 'crypto';
import { getDatabase } from '../../data/Database';
import { fingerprintTemplateRepo } from '../../data/repositories/FingerprintTemplateRepository';
import { generateFingerprintSeed, generateHardwareFromSeed } from '../FingerprintService';
import type { FingerprintTemplate, FingerprintPlatform } from '../FingerprintService';
import type { Platform } from '../types';

export interface FingerprintProfile {
  id: string;
  ua: string;
  platform: string;
  gpu_vendor: string;
  gpu_renderer: string;
  canvasSeed: number;
  timezone: string;
  language: string;
  hardware_concurrency: number;
  screen_width: number;
  screen_height: number;
  [key: string]: unknown;
}

function getNavigatorPlatform(platform: Platform): string {
  switch (platform) {
    case 'douyin':
    case 'kuaishou':
      return 'Windows NT 10.0';
    case 'bilibili':
      return 'Macintosh';
    case 'xiaohongshu':
      return 'iPhone';
    case 'channels':
      return 'Windows NT 10.0';
    default:
      return 'Windows NT 10.0';
  }
}

function toFingerprintPlatform(platform: Platform): FingerprintPlatform {
  switch (platform) {
    case 'douyin':
    case 'kuaishou':
    case 'channels':
      return 'windows';
    case 'bilibili':
      return 'macos';
    case 'xiaohongshu':
      return 'macos';
    default:
      return 'windows';
  }
}

export class FingerprintAdapter {
  async getOrAssign(accountId: string, platform: Platform): Promise<FingerprintProfile> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT fingerprint_id FROM accounts WHERE id = ?')
      .get(accountId) as { fingerprint_id: string | null } | undefined;

    if (row?.fingerprint_id) {
      const template = await fingerprintTemplateRepo.findById(row.fingerprint_id);
      if (template) {
        return this.toProfile(template);
      }
    }

    const templateId = await this.createAndBind(accountId, platform);
    const finalTemplate = await fingerprintTemplateRepo.findById(templateId);
    if (!finalTemplate) {
      throw new Error(`Fingerprint template not found: ${templateId}`);
    }
    return this.toProfile(finalTemplate);
  }

  private async createAndBind(accountId: string, platform: Platform): Promise<string> {
    const seed = generateFingerprintSeed();
    const fpPlatform = toFingerprintPlatform(platform);
    const hardware = generateHardwareFromSeed(seed, fpPlatform);

    const template = await fingerprintTemplateRepo.insert({
      id: randomUUID(),
      name: `${platform}-${seed}`,
      seed,
      platform: fpPlatform,
      platform_version: hardware.platform_version,
      brand: 'Chrome',
      brand_version: hardware.brand_version,
      hardware_concurrency: hardware.hardware_concurrency,
      gpu_vendor: hardware.gpu_vendor,
      gpu_renderer: hardware.gpu_renderer,
      disable_non_proxied_udp: 1,
      lang: 'zh-CN',
      accept_lang: 'zh-CN,en-US',
      timezone: 'Asia/Shanghai',
      custom_params: '[]',
      user_agent: null,
      screen_width: 1920,
      screen_height: 1080,
    });

    const db = getDatabase();
    db.prepare('UPDATE accounts SET fingerprint_id = ?, updated_at = ? WHERE id = ?').run(
      template.id,
      new Date().toISOString(),
      accountId
    );

    return template.id;
  }

  private toProfile(template: FingerprintTemplate): FingerprintProfile {
    const navigatorPlat = getNavigatorPlatform(template.platform as Platform);
    const brandVersion = template.brand_version ?? '131';
    const ua = `Mozilla/5.0 (${navigatorPlat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${brandVersion}.0.0.0 Safari/537.36`;

    return {
      id: template.id,
      ua,
      platform: navigatorPlat,
      gpu_vendor: template.gpu_vendor ?? '',
      gpu_renderer: template.gpu_renderer ?? '',
      screen_width: template.screen_width,
      screen_height: template.screen_height,
      canvasSeed: template.seed ?? 0,
      timezone: template.timezone,
      language: template.lang,
      hardware_concurrency: template.hardware_concurrency ?? 4,
    };
  }
}
