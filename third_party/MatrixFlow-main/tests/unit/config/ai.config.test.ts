import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockProcessEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...mockProcessEnv };
});

// Re-import fresh module for each test by invalidating cache
describe('ai.config', () => {
  // We test the exported singleton directly — since aiConfigManager is a module-level
  // singleton, we import it once and reset via load().

  // Dynamically import to ensure module-level code re-runs with current env
  async function loadFreshModule() {
    vi.resetModules();
    // Ensure env vars are set before import
    return import('@electron/config/ai.config');
  }

  describe('DEFAULT_AI_CONFIG', () => {
    it('has correct default values', async () => {
      process.env.OPENAI_API_KEY = '';
      process.env.DEEPSEEK_API_KEY = '';
      process.env.QWEN_API_KEY = '';
      const { DEFAULT_AI_CONFIG } = await loadFreshModule();

      expect(DEFAULT_AI_CONFIG.enabled).toBe(true);
      expect(DEFAULT_AI_CONFIG.defaultProvider).toBe('openai');
      expect(DEFAULT_AI_CONFIG.cacheTTL).toBe(24 * 60 * 60 * 1000);
      expect(DEFAULT_AI_CONFIG.fallbackToRules).toBe(true);
      expect(DEFAULT_AI_CONFIG.costTracking).toBe(true);
    });

    it('configures openai provider by default', async () => {
      process.env.OPENAI_API_KEY = 'test-key-123';
      const { DEFAULT_AI_CONFIG } = await loadFreshModule();

      expect(DEFAULT_AI_CONFIG.providers.openai).toBeDefined();
      expect(DEFAULT_AI_CONFIG.providers.openai!.provider).toBe('openai');
      expect(DEFAULT_AI_CONFIG.providers.openai!.model).toBe('gpt-4o-mini');
      expect(DEFAULT_AI_CONFIG.providers.openai!.apiKey).toBe('test-key-123');
      expect(DEFAULT_AI_CONFIG.providers.openai!.maxTokens).toBe(4096);
      expect(DEFAULT_AI_CONFIG.providers.openai!.temperature).toBe(0.7);
      expect(DEFAULT_AI_CONFIG.providers.openai!.timeout).toBe(30000);
    });

    it('configures deepseek provider by default', async () => {
      process.env.DEEPSEEK_API_KEY = 'ds-key-456';
      const { DEFAULT_AI_CONFIG } = await loadFreshModule();

      expect(DEFAULT_AI_CONFIG.providers.deepseek).toBeDefined();
      expect(DEFAULT_AI_CONFIG.providers.deepseek!.provider).toBe('deepseek');
      expect(DEFAULT_AI_CONFIG.providers.deepseek!.model).toBe('deepseek-chat');
      expect(DEFAULT_AI_CONFIG.providers.deepseek!.apiKey).toBe('ds-key-456');
    });

    it('configures qwen provider by default', async () => {
      process.env.QWEN_API_KEY = 'qwen-key-789';
      const { DEFAULT_AI_CONFIG } = await loadFreshModule();

      expect(DEFAULT_AI_CONFIG.providers.qwen).toBeDefined();
      expect(DEFAULT_AI_CONFIG.providers.qwen!.provider).toBe('qwen');
      expect(DEFAULT_AI_CONFIG.providers.qwen!.model).toBe('qwen2.5-72b-instruct');
      expect(DEFAULT_AI_CONFIG.providers.qwen!.apiKey).toBe('qwen-key-789');
    });

    it('uses empty string for API keys when env vars are missing', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.QWEN_API_KEY;
      const { DEFAULT_AI_CONFIG } = await loadFreshModule();

      expect(DEFAULT_AI_CONFIG.providers.openai!.apiKey).toBe('');
      expect(DEFAULT_AI_CONFIG.providers.deepseek!.apiKey).toBe('');
      expect(DEFAULT_AI_CONFIG.providers.qwen!.apiKey).toBe('');
    });
  });

  describe('AIConfigManager', () => {
    it('get returns a copy of the config', async () => {
      const { aiConfigManager } = await loadFreshModule();
      const config1 = aiConfigManager.get();
      const config2 = aiConfigManager.get();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('load merges user config with defaults', async () => {
      const { aiConfigManager } = await loadFreshModule();

      aiConfigManager.load({
        enabled: false,
        defaultProvider: 'deepseek',
      });

      const config = aiConfigManager.get();
      expect(config.enabled).toBe(false);
      expect(config.defaultProvider).toBe('deepseek');
      // Default providers should still be present
      expect(config.providers.openai).toBeDefined();
      expect(config.providers.deepseek).toBeDefined();
      expect(config.providers.qwen).toBeDefined();
    });

    it('load merges provider configs', async () => {
      const { aiConfigManager } = await loadFreshModule();

      aiConfigManager.load({
        providers: {
          openai: {
            provider: 'openai',
            model: 'gpt-4-turbo',
            apiKey: 'custom-key',
            maxTokens: 8192,
          },
        },
      });

      const config = aiConfigManager.get();
      expect(config.providers.openai!.model).toBe('gpt-4-turbo');
      expect(config.providers.openai!.apiKey).toBe('custom-key');
      expect(config.providers.openai!.maxTokens).toBe(8192);
      // Other providers unchanged
      expect(config.providers.deepseek).toBeDefined();
    });

    it('setEnabled toggles enabled state', async () => {
      const { aiConfigManager } = await loadFreshModule();

      aiConfigManager.setEnabled(false);
      expect(aiConfigManager.get().enabled).toBe(false);

      aiConfigManager.setEnabled(true);
      expect(aiConfigManager.get().enabled).toBe(true);
    });

    it('setProvider changes defaultProvider', async () => {
      const { aiConfigManager } = await loadFreshModule();

      aiConfigManager.setProvider('deepseek');
      expect(aiConfigManager.get().defaultProvider).toBe('deepseek');

      aiConfigManager.setProvider('qwen');
      expect(aiConfigManager.get().defaultProvider).toBe('qwen');
    });

    it('setApiKey updates apiKey for existing provider', async () => {
      const { aiConfigManager } = await loadFreshModule();

      aiConfigManager.setApiKey('openai', 'new-openai-key');
      expect(aiConfigManager.get().providers.openai!.apiKey).toBe('new-openai-key');

      aiConfigManager.setApiKey('deepseek', 'new-deepseek-key');
      expect(aiConfigManager.get().providers.deepseek!.apiKey).toBe('new-deepseek-key');
    });

    it('setApiKey does nothing for non-existent provider', async () => {
      const { aiConfigManager } = await loadFreshModule();
      const configBefore = aiConfigManager.get();

      // anthropic is not configured by default, so setApiKey should be a no-op
      aiConfigManager.setApiKey('anthropic', 'some-key');

      const configAfter = aiConfigManager.get();
      expect(configAfter.providers.anthropic).toBeUndefined();
      // Other providers unchanged
      expect(configAfter.providers.openai!.apiKey).toBe(configBefore.providers.openai!.apiKey);
    });
  });
});
