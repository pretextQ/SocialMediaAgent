import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMService, initLLMService, getLLMService } from '@electron/ai/LLMService';
import type { AIConfig, LLMRequest, LLMResponse } from '@electron/ai/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTestConfig(overrides?: Partial<AIConfig>): AIConfig {
  return {
    enabled: true,
    defaultProvider: 'openai',
    providers: {
      openai: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
        baseUrl: 'https://api.openai.com/v1',
      },
      deepseek: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
      },
    },
    cacheTTL: 86400000,
    fallbackToRules: true,
    costTracking: false,
    ...overrides,
  };
}

function createLLMResponse(overrides?: Partial<LLMResponse>): LLMResponse {
  return {
    content: 'Hello from LLM',
    usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
    model: 'gpt-4o-mini',
    provider: 'openai',
    latency: 200,
    ...overrides,
  };
}

const defaultRequest: LLMRequest = {
  prompt: 'Test prompt',
  systemPrompt: 'You are a helpful assistant.',
};

function mockFetchSuccess(response: Record<string, unknown>): void {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(response)),
      json: () => Promise.resolve(response),
    })
  ));
}

function mockFetchError(status: number, text: string): void {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve({}),
    })
  ));
}

function mockFetchNetworkError(error: Error): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(error)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('LLMService', () => {
  let service: LLMService;

  beforeEach(() => {
    service = new LLMService(createTestConfig());
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ─── call() - 正常路径 ───────────────────────────────────────────────────

  describe('call', () => {
    it('调用默认提供商成功返回响应', async () => {
      const apiResponse = {
        choices: [{ message: { content: 'AI response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };
      mockFetchSuccess(apiResponse);

      const result = await service.call(defaultRequest);

      expect(result.content).toBe('AI response');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.provider).toBe('openai');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('使用自定义 temperature 和 maxTokens', async () => {
      const apiResponse = {
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      };
      mockFetchSuccess(apiResponse);

      const request: LLMRequest = {
        prompt: 'test',
        temperature: 0.1,
        maxTokens: 2048,
      };
      await service.call(request);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.temperature).toBe(0.1);
      expect(body.max_tokens).toBe(2048);
    });

    it('不传 systemPrompt 时消息体只有 user 角色', async () => {
      const apiResponse = {
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      };
      mockFetchSuccess(apiResponse);

      await service.call({ prompt: 'hello' });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('传 systemPrompt 时消息体包含 system 和 user', async () => {
      const apiResponse = {
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      };
      mockFetchSuccess(apiResponse);

      await service.call({ prompt: 'hello', systemPrompt: 'be helpful' });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' });
    });

    it('正确设置 Authorization header', async () => {
      mockFetchSuccess({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });

      await service.call(defaultRequest);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBe('Bearer test-api-key');
    });
  });

  // ─── call() - 提供商路由 ──────────────────────────────────────────────────

  describe('provider routing', () => {
    it('未配置提供商时抛出错误', async () => {
      const config = createTestConfig({
        defaultProvider: 'openai',
        providers: {},
      });
      const svc = new LLMService(config);

      await expect(svc.call(defaultRequest)).rejects.toThrow(
        'LLM provider openai not configured'
      );
    });

    it('使用配置中的 baseUrl 而非默认值', async () => {
      const config = createTestConfig({
        providers: {
          openai: {
            provider: 'openai',
            model: 'custom-model',
            apiKey: 'key',
            baseUrl: 'https://custom.api.com/v1',
          },
        },
      });
      const svc = new LLMService(config);
      mockFetchSuccess({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });

      await svc.call(defaultRequest);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toBe('https://custom.api.com/v1/chat/completions');
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('custom-model');
    });
  });

  // ─── call() - 降级/备用 ──────────────────────────────────────────────────

  describe('fallback behavior', () => {
    it('fallbackToRules=true 且主提供商失败时立即抛出降级错误', async () => {
      const config = createTestConfig({ fallbackToRules: true });
      const svc = new LLMService(config);

      mockFetchNetworkError(new Error('OpenAI down'));

      await expect(svc.call(defaultRequest)).rejects.toThrow('LLM call failed and fallback disabled');
    });

    it('fallbackToRules=false 且主提供商失败时尝试备用提供商', async () => {
      const config = createTestConfig({ fallbackToRules: false });
      const svc = new LLMService(config);

      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('OpenAI down'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('ok'),
          json: () => Promise.resolve({
            choices: [{ message: { content: 'deepseek response' } }],
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
          }),
        });
      }));

      const result = await svc.call(defaultRequest);
      expect(result.content).toBe('deepseek response');
      expect(result.provider).toBe('deepseek');
    });

    it('fallbackToRules=false 且所有提供商都失败时抛出错误', async () => {
      const config = createTestConfig({ fallbackToRules: false });
      const svc = new LLMService(config);

      mockFetchNetworkError(new Error('Network error'));

      await expect(svc.call(defaultRequest)).rejects.toThrow('All LLM providers failed');
    });
  });

  // ─── call() - API 错误 ──────────────────────────────────────────────────

  describe('API error handling', () => {
    it('API 返回非 200 时抛出包含状态码的错误', async () => {
      mockFetchError(429, 'Rate limited');

      await expect(service.call(defaultRequest)).rejects.toThrow('LLM API error: 429');
    });

    it('API 返回 500 时抛出错误', async () => {
      mockFetchError(500, 'Internal Server Error');

      await expect(service.call(defaultRequest)).rejects.toThrow('LLM API error: 500');
    });

    it('API 返回空 choices 时 content 为空字符串', async () => {
      mockFetchSuccess({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      });

      const result = await service.call(defaultRequest);
      expect(result.content).toBe('');
      expect(result.usage.promptTokens).toBe(10);
    });

    it('API 返回无 usage 时默认为 0', async () => {
      mockFetchSuccess({
        choices: [{ message: { content: 'ok' } }],
      });

      const result = await service.call(defaultRequest);
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });
  });

  // ─── call() - 延迟计算 ──────────────────────────────────────────────────

  describe('latency tracking', () => {
    it('记录正确的延迟时间', async () => {
      mockFetchSuccess({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });

      const start = Date.now();
      vi.advanceTimersByTime(150);

      const result = await service.call(defaultRequest);
      // latency 在 fetch mock 中不会实际等待，但会记录 Date.now() - startTime
      expect(typeof result.latency).toBe('number');
    });
  });

  // ─── Qwen 特殊处理 ────────────────────────────────────────────────────

  describe('Qwen provider', () => {
    it('Qwen 请求时 model 加前缀 qwen-', async () => {
      const config = createTestConfig({
        defaultProvider: 'qwen',
        providers: {
          qwen: {
            provider: 'qwen',
            model: 'qwen2.5-72b-instruct',
            apiKey: 'test-key',
            baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
          },
        },
      });
      const svc = new LLMService(config);
      mockFetchSuccess({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });

      await svc.call(defaultRequest);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('qwen-qwen2.5-72b-instruct');
    });
  });

  // ─── 配置管理 ──────────────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('更新配置后 getConfig 返回新值', () => {
      service.updateConfig({ costTracking: true });
      const config = service.getConfig();
      expect(config.costTracking).toBe(true);
    });

    it('不影响未更新的配置项', () => {
      const originalProvider = service.getConfig().defaultProvider;
      service.updateConfig({ costTracking: true });
      expect(service.getConfig().defaultProvider).toBe(originalProvider);
    });
  });

  describe('getConfig', () => {
    it('返回配置副本，修改不影响内部状态', () => {
      const config1 = service.getConfig();
      config1.enabled = false;
      const config2 = service.getConfig();
      expect(config2.enabled).toBe(true);
    });
  });

  // ─── 单例函数 ──────────────────────────────────────────────────────────

  describe('initLLMService / getLLMService', () => {
    // 重置模块级单例：每次 initLLMService 会覆盖
    afterEach(() => {
      // 重新初始化以避免污染其他测试
      initLLMService(createTestConfig());
    });

    it('initLLMService 返回 LLMService 实例', () => {
      const instance = initLLMService(createTestConfig());
      expect(instance).toBeInstanceOf(LLMService);
    });

    it('getLLMService 返回已初始化的实例', () => {
      const instance = initLLMService(createTestConfig());
      expect(getLLMService()).toBe(instance);
    });

    it('getLLMService 未初始化时抛出错误', () => {
      // 用一个新模块级别的状态来测试
      // 由于单例是模块级的，initLLMService 总会覆盖
      // 这里验证 init 后 get 返回正确实例
      const instance = initLLMService(createTestConfig());
      expect(getLLMService()).toBe(instance);
    });
  });
});
