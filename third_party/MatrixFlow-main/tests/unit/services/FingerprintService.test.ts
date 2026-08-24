import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateFingerprintSeed,
  getDefaultPlatform,
  getDefaultTimezone,
  getDefaultLang,
  getDefaultAcceptLang,
  validateFingerprintTemplate,
  buildFingerprintArgs,
  createDefaultTemplate,
  parseCustomParams,
  stringifyCustomParams,
  generateHardwareFromSeed,
  generateTemplateFromSeed,
} from '@electron/services/FingerprintService';
import type { FingerprintTemplate } from '@electron/data/types';

describe('FingerprintService', () => {
  describe('generateFingerprintSeed', () => {
    it('generates a 32-bit integer between 1 and 2147483647', () => {
      for (let i = 0; i < 100; i++) {
        const seed = generateFingerprintSeed();
        expect(seed).toBeGreaterThanOrEqual(1);
        expect(seed).toBeLessThanOrEqual(2147483647);
        expect(Number.isInteger(seed)).toBe(true);
      }
    });

    it('generates different values on each call', () => {
      const seeds = new Set<number>();
      for (let i = 0; i < 10; i++) {
        seeds.add(generateFingerprintSeed());
      }
      expect(seeds.size).toBeGreaterThan(5);
    });
  });

  describe('getDefaultPlatform', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns windows for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getDefaultPlatform()).toBe('windows');
    });

    it('returns macos for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getDefaultPlatform()).toBe('macos');
    });

    it('returns linux for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getDefaultPlatform()).toBe('linux');
    });
  });

  describe('getDefaultTimezone', () => {
    it('returns a valid timezone string', () => {
      const tz = getDefaultTimezone();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    });
  });

  describe('getDefaultLang', () => {
    it('returns zh-CN', () => {
      expect(getDefaultLang()).toBe('zh-CN');
    });
  });

  describe('getDefaultAcceptLang', () => {
    it('returns zh-CN,en-US', () => {
      expect(getDefaultAcceptLang()).toBe('zh-CN,en-US');
    });
  });

  describe('validateFingerprintTemplate', () => {
    it('validates a correct template', () => {
      const result = validateFingerprintTemplate({
        name: 'Test Template',
        seed: 12345,
        platform: 'windows',
        brand: 'Chrome',
        hardware_concurrency: 8,
        lang: 'zh-CN',
        timezone: 'Asia/Shanghai',
      });
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('errors on empty name', () => {
      const result = validateFingerprintTemplate({ name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeDefined();
    });

    it('errors on invalid seed', () => {
      const result = validateFingerprintTemplate({ seed: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.seed).toBeDefined();
    });

    it('errors on seed > 2147483647', () => {
      const result = validateFingerprintTemplate({ seed: 2147483648 });
      expect(result.valid).toBe(false);
      expect(result.errors.seed).toBeDefined();
    });

    it('errors on invalid platform', () => {
      const result = validateFingerprintTemplate({ platform: 'invalid' as any });
      expect(result.valid).toBe(false);
      expect(result.errors.platform).toBeDefined();
    });

    it('errors on invalid brand', () => {
      const result = validateFingerprintTemplate({ brand: 'Safari' as any });
      expect(result.valid).toBe(false);
      expect(result.errors.brand).toBeDefined();
    });

    it('errors on invalid hardware_concurrency', () => {
      const result = validateFingerprintTemplate({ hardware_concurrency: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors.hardware_concurrency).toBeDefined();
    });

    it('errors on invalid lang format', () => {
      const result = validateFingerprintTemplate({ lang: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors.lang).toBeDefined();
    });

    it('errors on invalid timezone', () => {
      const result = validateFingerprintTemplate({ timezone: 'Invalid/Timezone' });
      expect(result.valid).toBe(false);
      expect(result.errors.timezone).toBeDefined();
    });
  });

  describe('buildFingerprintArgs', () => {
    const createTemplate = (overrides?: Partial<FingerprintTemplate>): FingerprintTemplate => ({
      id: 'fp_001',
      name: 'Test',
      seed: 12345,
      platform: 'windows',
      platform_version: null,
      brand: 'Chrome',
      brand_version: null,
      hardware_concurrency: 8,
      gpu_vendor: 'Intel Inc.',
      gpu_renderer: 'Intel Iris',
      disable_non_proxied_udp: 1,
      lang: 'zh-CN',
      accept_lang: 'zh-CN,en-US',
      timezone: 'Asia/Shanghai',
      custom_params: '[]',
      user_agent: null,
      screen_width: 1920,
      screen_height: 1080,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    });

    it('builds args with seed', () => {
      const args = buildFingerprintArgs(createTemplate({ seed: 999 }));
      expect(args).toContain('--fingerprint=999');
    });

    it('builds args with platform', () => {
      const args = buildFingerprintArgs(createTemplate({ platform: 'linux' }));
      expect(args).toContain('--fingerprint-platform=linux');
    });

    it('builds args with brand', () => {
      const args = buildFingerprintArgs(createTemplate({ brand: 'Edge' }));
      expect(args).toContain('--fingerprint-brand=Edge');
    });

    it('does not pass hardware_concurrency to CLI (seed handles it)', () => {
      const args = buildFingerprintArgs(createTemplate({ hardware_concurrency: 16 }));
      expect(args.find(a => a.includes('hardware-concurrency'))).toBeUndefined();
    });

    it('does not pass gpu_vendor/gpu_renderer to CLI (seed handles it)', () => {
      const args = buildFingerprintArgs(createTemplate({
        gpu_vendor: 'NVIDIA Corporation',
        gpu_renderer: 'NVIDIA GeForce GTX 1060',
      }));
      expect(args.find(a => a.includes('gpu-vendor'))).toBeUndefined();
      expect(args.find(a => a.includes('gpu-renderer'))).toBeUndefined();
    });

    it('builds args with disable_non_proxied_udp', () => {
      const args = buildFingerprintArgs(createTemplate({ disable_non_proxied_udp: 1 }));
      expect(args).toContain('--disable-non-proxied-udp');
    });

    it('does not include disable_non_proxied_udp when 0', () => {
      const args = buildFingerprintArgs(createTemplate({ disable_non_proxied_udp: 0 }));
      expect(args).not.toContain('--disable-non-proxied-udp');
    });

    it('builds args with lang', () => {
      const args = buildFingerprintArgs(createTemplate({ lang: 'en-US' }));
      expect(args).toContain('--lang=en-US');
    });

    it('builds args with accept_lang', () => {
      const args = buildFingerprintArgs(createTemplate({ accept_lang: 'en-US,zh-CN' }));
      expect(args).toContain('--accept-lang=en-US,zh-CN');
    });

    it('builds args with timezone', () => {
      const args = buildFingerprintArgs(createTemplate({ timezone: 'UTC' }));
      expect(args).toContain('--timezone=UTC');
    });

    it('builds args with custom_params', () => {
      const args = buildFingerprintArgs(createTemplate({
        custom_params: '[{"name":"--test","value":"value1"}]',
      }));
      expect(args).toContain('--test=value1');
    });

    it('returns empty array for minimal template', () => {
      const args = buildFingerprintArgs(createTemplate({
        seed: null,
        hardware_concurrency: null,
        gpu_vendor: null,
        gpu_renderer: null,
      }));
      expect(args.length).toBeGreaterThan(0);
      expect(args).toContain('--fingerprint-platform=windows');
      expect(args).toContain('--fingerprint-brand=Chrome');
    });
  });

  describe('createDefaultTemplate', () => {
    it('creates a template with all default values', () => {
      const template = createDefaultTemplate();
      expect(template.name).toBe('');
      expect(template.seed).toBeGreaterThanOrEqual(1);
      expect(template.platform).toBeOneOf(['windows', 'linux', 'macos']);
      expect(template.brand).toBe('Chrome');
      expect(template.disable_non_proxied_udp).toBe(1);
      expect(template.lang).toBe('zh-CN');
      expect(template.accept_lang).toBe('zh-CN,en-US');
      expect(template.timezone).toBeDefined();
      expect(template.custom_params).toBe('[]');
    });
  });

  describe('parseCustomParams', () => {
    it('parses valid JSON', () => {
      const params = parseCustomParams('[{"name":"--test","value":"val"}]');
      expect(params).toEqual([{ name: '--test', value: 'val' }]);
    });

    it('returns empty array for invalid JSON', () => {
      const params = parseCustomParams('invalid');
      expect(params).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const params = parseCustomParams('');
      expect(params).toEqual([]);
    });
  });

  describe('stringifyCustomParams', () => {
    it('stringifies params', () => {
      const json = stringifyCustomParams([{ name: '--test', value: 'val' }]);
      expect(json).toBe('[{"name":"--test","value":"val"}]');
    });

    it('returns empty array for empty input', () => {
      const json = stringifyCustomParams([]);
      expect(json).toBe('[]');
    });
  });

  describe('generateHardwareFromSeed', () => {
    it('generates hardware for Windows', () => {
      const hw = generateHardwareFromSeed(12345, 'windows');
      expect(hw.hardware_concurrency).toBeGreaterThan(0);
      expect(hw.gpu_vendor).toBeTruthy();
      expect(hw.gpu_renderer).toBeTruthy();
      expect(['10', '11']).toContain(hw.platform_version);
      expect(hw.brand_version).toMatch(/^\d+$/);
    });

    it('generates hardware for macOS', () => {
      const hw = generateHardwareFromSeed(12345, 'macos');
      expect(hw.hardware_concurrency).toBeGreaterThan(0);
      expect(hw.gpu_vendor).toBe('Apple Inc.');
      expect(hw.gpu_renderer).toMatch(/^Apple M\d/);
      expect(hw.platform_version).toMatch(/^1[345]\.\d$/);
    });

    it('generates hardware for Linux', () => {
      const hw = generateHardwareFromSeed(12345, 'linux');
      expect(hw.hardware_concurrency).toBeGreaterThan(0);
      expect(hw.platform_version).toBe('');
    });

    it('generates different hardware for different seeds', () => {
      const hw1 = generateHardwareFromSeed(1, 'windows');
      const hw2 = generateHardwareFromSeed(50, 'windows');
      expect(
        hw1.hardware_concurrency !== hw2.hardware_concurrency
        || hw1.gpu_vendor !== hw2.gpu_vendor
        || hw1.gpu_renderer !== hw2.gpu_renderer
      ).toBe(true);
    });

    it('generates consistent hardware for same seed and platform', () => {
      const hw1 = generateHardwareFromSeed(12345, 'windows');
      const hw2 = generateHardwareFromSeed(12345, 'windows');
      expect(hw1).toEqual(hw2);
    });

    it('generates brand version based on brand', () => {
      const hwChrome = generateHardwareFromSeed(12345, 'windows', 'Chrome');
      const hwEdge = generateHardwareFromSeed(12345, 'windows', 'Edge');
      expect(hwChrome.brand_version).toMatch(/^\d+$/);
      expect(hwEdge.brand_version).toMatch(/^\d+$/);
    });
  });

  describe('generateTemplateFromSeed', () => {
    it('generates a complete template from seed', () => {
      const tpl = generateTemplateFromSeed(12345);
      expect(tpl.seed).toBe(12345);
      expect(tpl.platform).toBeTruthy();
      expect(tpl.brand).toBe('Chrome');
      expect(tpl.hardware_concurrency).toBeGreaterThan(0);
      expect(tpl.gpu_vendor).toBeTruthy();
      expect(tpl.gpu_renderer).toBeTruthy();
      expect(tpl.platform_version).toBeDefined();
      expect(tpl.brand_version).toBeDefined();
      expect(tpl.lang).toBe('zh-CN');
      expect(tpl.accept_lang).toBe('zh-CN,en-US');
      expect(tpl.timezone).toBeTruthy();
      expect(tpl.disable_non_proxied_udp).toBe(1);
    });

    it('generates consistent template for same seed', () => {
      const tpl1 = generateTemplateFromSeed(999);
      const tpl2 = generateTemplateFromSeed(999);
      expect(tpl1).toEqual(tpl2);
    });

    it('generates different templates for different seeds', () => {
      const tpl1 = generateTemplateFromSeed(1);
      const tpl2 = generateTemplateFromSeed(999);
      expect(tpl1.hardware_concurrency).not.toBe(tpl2.hardware_concurrency);
    });
  });
});
