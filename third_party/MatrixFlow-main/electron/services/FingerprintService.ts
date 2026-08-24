import type { FingerprintTemplate, FingerprintCustomParam, FingerprintPlatform, FingerprintBrand } from '../data/types';

export type { FingerprintTemplate, FingerprintCustomParam, FingerprintPlatform, FingerprintBrand };

const PLATFORM_LABELS: Record<FingerprintPlatform, string> = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
};

const BRAND_LABELS: Record<FingerprintBrand, string> = {
  Chrome: 'Chrome',
  Edge: 'Edge',
  Opera: 'Opera',
  Vivaldi: 'Vivaldi',
};

interface HardwareProfile {
  cpuCores: number;
  gpuVendor: string;
  gpuRenderer: string;
  weight: number;
}

const WINDOWS_HARDWARE_PROFILES: HardwareProfile[] = [
  { cpuCores: 4, gpuVendor: 'Intel', gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 20 },
  { cpuCores: 4, gpuVendor: 'Intel', gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 15 },
  { cpuCores: 8, gpuVendor: 'Intel', gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 12 },
  { cpuCores: 6, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 (0x00001C03) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 12 },
  { cpuCores: 8, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F82) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 10 },
  { cpuCores: 8, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 10 },
  { cpuCores: 12, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 8 },
  { cpuCores: 8, gpuVendor: 'AMD', gpuRenderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 8 },
  { cpuCores: 12, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 5 },
];

const MACOS_HARDWARE_PROFILES: HardwareProfile[] = [
  { cpuCores: 8, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M1', weight: 30 },
  { cpuCores: 8, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M2', weight: 25 },
  { cpuCores: 8, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M3', weight: 15 },
  { cpuCores: 10, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M1 Pro', weight: 10 },
  { cpuCores: 12, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M2 Pro', weight: 10 },
  { cpuCores: 12, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M3 Pro', weight: 5 },
  { cpuCores: 10, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple M4', weight: 5 },
];

const LINUX_HARDWARE_PROFILES: HardwareProfile[] = [
  { cpuCores: 4, gpuVendor: 'Intel', gpuRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (0x00005917), OpenGL 4.6)', weight: 20 },
  { cpuCores: 4, gpuVendor: 'Intel', gpuRenderer: 'ANGLE (Intel, Mesa Intel(R) HD Graphics 530 (0x00001912), OpenGL 4.6)', weight: 15 },
  { cpuCores: 8, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1060/PCIe/SSE2, OpenGL ES 3.2)', weight: 15 },
  { cpuCores: 6, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1660/PCIe/SSE2, OpenGL ES 3.2)', weight: 15 },
  { cpuCores: 8, gpuVendor: 'AMD', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 580 Series (0x000067DF), OpenGL 4.6)', weight: 12 },
  { cpuCores: 12, gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL ES 3.2)', weight: 12 },
  { cpuCores: 8, gpuVendor: 'AMD', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF), OpenGL 4.6)', weight: 8 },
  { cpuCores: 4, gpuVendor: 'Intel', gpuRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (0x00003E92), OpenGL 4.6)', weight: 3 },
];

function selectHardwareProfile(seed: number, platform: FingerprintPlatform): HardwareProfile {
  const profiles = platform === 'windows'
    ? WINDOWS_HARDWARE_PROFILES
    : platform === 'macos'
      ? MACOS_HARDWARE_PROFILES
      : LINUX_HARDWARE_PROFILES;

  const totalWeight = profiles.reduce((sum, p) => sum + p.weight, 0);
  const normalizedSeed = (seed % totalWeight) + 1;

  let cumulative = 0;
  for (const profile of profiles) {
    cumulative += profile.weight;
    if (normalizedSeed <= cumulative) {
      return profile;
    }
  }
  return profiles[0];
}

export interface GeneratedHardware {
  hardware_concurrency: number;
  gpu_vendor: string;
  gpu_renderer: string;
  platform_version: string;
  brand_version: string;
}

const PLATFORM_VERSIONS: Record<FingerprintPlatform, string[]> = {
  windows: ['10', '11', '10', '10', '11', '10'],
  macos: ['14.0', '14.1', '14.2', '15.0', '15.1', '13.6'],
  linux: ['', '', '', '', '', ''],
};

const BRAND_VERSIONS: Record<FingerprintBrand, string[]> = {
  Chrome: ['131', '132', '133', '134', '131', '132'],
  Edge: ['131', '132', '133', '134', '131', '132'],
  Opera: ['116', '117', '118', '119', '116', '117'],
  Vivaldi: ['6.8', '6.9', '7.0', '7.1', '6.8', '6.9'],
};

export function generateHardwareFromSeed(
  seed: number,
  platform: FingerprintPlatform,
  brand: FingerprintBrand = 'Chrome'
): GeneratedHardware {
  const profile = selectHardwareProfile(seed, platform);
  const platformVersions = PLATFORM_VERSIONS[platform];
  const brandVersions = BRAND_VERSIONS[brand];
  const versionIndex = seed % platformVersions.length;
  const brandVersionIndex = seed % brandVersions.length;

  return {
    hardware_concurrency: profile.cpuCores,
    gpu_vendor: profile.gpuVendor,
    gpu_renderer: profile.gpuRenderer,
    platform_version: platformVersions[versionIndex],
    brand_version: brandVersions[brandVersionIndex],
  };
}

export function generateFingerprintSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

export function getDefaultPlatform(): FingerprintPlatform {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

export function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch {
    return 'Asia/Shanghai';
  }
}

export function getDefaultLang(): string {
  return 'zh-CN';
}

export function getDefaultAcceptLang(): string {
  return 'zh-CN,en-US';
}

export interface FingerprintValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateFingerprintTemplate(template: Partial<FingerprintTemplate>): FingerprintValidationResult {
  const errors: Record<string, string> = {};

  if (!template.name?.trim()) {
    errors.name = '模板名称不能为空';
  }

  if (template.seed !== null && template.seed !== undefined) {
    if (!Number.isInteger(template.seed) || template.seed < 1 || template.seed > 2147483647) {
      errors.seed = '指纹种子必须是 1-2147483647 之间的整数';
    }
  }

  if (template.platform && !['windows', 'linux', 'macos'].includes(template.platform)) {
    errors.platform = '操作系统必须是 windows、linux 或 macos';
  }

  if (template.brand && !['Chrome', 'Edge', 'Opera', 'Vivaldi'].includes(template.brand)) {
    errors.brand = '浏览器品牌必须是 Chrome、Edge、Opera 或 Vivaldi';
  }

  if (template.hardware_concurrency !== null && template.hardware_concurrency !== undefined) {
    if (!Number.isInteger(template.hardware_concurrency) || template.hardware_concurrency < 1 || template.hardware_concurrency > 128) {
      errors.hardware_concurrency = 'CPU 核心数必须是 1-128 之间的整数';
    }
  }

  if (template.lang && !/^[a-z]{2,3}(-[A-Z]{2,3})?$/.test(template.lang)) {
    errors.lang = '语言格式不正确，应为 zh-CN 格式';
  }

  if (template.timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: template.timezone });
    } catch {
      errors.timezone = '时区格式不正确';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildFingerprintArgs(template: FingerprintTemplate): string[] {
  const args: string[] = [];

  if (template.seed) {
    args.push(`--fingerprint=${template.seed}`);
  }

  if (template.platform) {
    args.push(`--fingerprint-platform=${template.platform}`);
  }

  if (template.platform_version) {
    args.push(`--fingerprint-platform-version=${template.platform_version}`);
  }

  if (template.brand) {
    args.push(`--fingerprint-brand=${template.brand}`);
  }

  if (template.brand_version) {
    args.push(`--fingerprint-brand-version=${template.brand_version}`);
  }

  if (template.disable_non_proxied_udp === 1) {
    args.push('--disable-non-proxied-udp');
  }

  if (template.lang) {
    args.push(`--lang=${template.lang}`);
  }

  if (template.accept_lang) {
    args.push(`--accept-lang=${template.accept_lang}`);
  }

  if (template.timezone) {
    args.push(`--timezone=${template.timezone}`);
  }

  if (template.custom_params) {
    try {
      const custom = JSON.parse(template.custom_params) as FingerprintCustomParam[];
      for (const param of custom) {
        args.push(`${param.name}=${param.value}`);
      }
    } catch {}
  }

  return args;
}

export function getPlatformLabel(platform: FingerprintPlatform): string {
  return PLATFORM_LABELS[platform] || platform;
}

export function getBrandLabel(brand: FingerprintBrand): string {
  return BRAND_LABELS[brand] || brand;
}

export function createDefaultTemplate(): Partial<FingerprintTemplate> {
  const seed = generateFingerprintSeed();
  const platform = getDefaultPlatform();
  const brand: FingerprintBrand = 'Chrome';
  const hardware = generateHardwareFromSeed(seed, platform, brand);
  return {
    name: '',
    seed,
    platform,
    platform_version: hardware.platform_version,
    brand,
    brand_version: hardware.brand_version,
    hardware_concurrency: hardware.hardware_concurrency,
    gpu_vendor: hardware.gpu_vendor,
    gpu_renderer: hardware.gpu_renderer,
    disable_non_proxied_udp: 1,
    lang: getDefaultLang(),
    accept_lang: getDefaultAcceptLang(),
    timezone: getDefaultTimezone(),
    screen_width: 1920,
    screen_height: 1080,
    custom_params: '[]',
  };
}

export function generateTemplateFromSeed(seed: number): Partial<FingerprintTemplate> {
  const platform = getDefaultPlatform();
  const brand: FingerprintBrand = 'Chrome';
  const hardware = generateHardwareFromSeed(seed, platform, brand);
  return {
    seed,
    platform,
    platform_version: hardware.platform_version,
    brand,
    brand_version: hardware.brand_version,
    hardware_concurrency: hardware.hardware_concurrency,
    gpu_vendor: hardware.gpu_vendor,
    gpu_renderer: hardware.gpu_renderer,
    disable_non_proxied_udp: 1,
    lang: getDefaultLang(),
    accept_lang: getDefaultAcceptLang(),
    timezone: getDefaultTimezone(),
  };
}

export function parseCustomParams(json: string): FingerprintCustomParam[] {
  try {
    return JSON.parse(json) as FingerprintCustomParam[];
  } catch {
    return [];
  }
}

export function stringifyCustomParams(params: FingerprintCustomParam[]): string {
  return JSON.stringify(params);
}
