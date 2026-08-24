import type { Platform } from './types';

const PLATFORM_ALIASES: Record<string, Platform> = {
  weixin_video: 'channels',
  weixin_channels: 'channels',
  wxsph: 'channels',
};

export function normalizePlatformId(platform: string): Platform {
  const normalized = platform.trim().toLowerCase();
  return PLATFORM_ALIASES[normalized] ?? (normalized as Platform);
}

export function isChannelsPlatform(platform: string): boolean {
  return normalizePlatformId(platform) === 'channels';
}
