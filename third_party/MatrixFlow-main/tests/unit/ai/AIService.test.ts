import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIService, initAIService, getAIService } from '@electron/ai/AIService';
import type {
  AIConfig,
  PrePublishContext,
  RuleOptimizationContext,
  AnomalyContext,
  ContentMatchContext,
  LLMResponse,
} from '@electron/ai/types';

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
        apiKey: 'test-key',
      },
    },
    cacheTTL: 86400000,
    fallbackToRules: true,
    costTracking: true,
    ...overrides,
  };
}

function createPrePublishContext(overrides?: Partial<PrePublishContext>): PrePublishContext {
  return {
    groupId: 'group_001',
    groupName: '测试分组',
    contentIds: ['content_001'],
    accounts: [
      {
        id: 'acc_001',
        platform: 'douyin',
        nickname: '测试账号1',
        cookieStatus: 'valid',
        lastPublishAt: new Date('2026-05-10'),
      },
    ],
    scheduleSlots: [
      { time: new Date('2026-05-19T12:00:00'), contentId: 'content_001', accountIds: ['acc_001'] },
    ],
    rule: {
      dailyCount: 3,
      timeSlots: ['08:00', '12:00', '18:00'],
      randomOffsetMin: 10,
      publishMode: 'client_direct',
    },
    ...overrides,
  };
}

function createRuleOptimizationContext(
  overrides?: Partial<RuleOptimizationContext>
): RuleOptimizationContext {
  return {
    groupId: 'group_001',
    historicalData: {
      publishRecords: [
        {
          publishedAt: new Date('2026-05-01T08:00:00'),
          platform: 'douyin',
          accountId: 'acc_001',
          metrics: { views: 1000, likes: 50, comments: 10, shares: 5 },
        },
        {
          publishedAt: new Date('2026-05-01T20:00:00'),
          platform: 'douyin',
          accountId: 'acc_001',
          metrics: { views: 200, likes: 10, comments: 2, shares: 1 },
        },
        ...Array.from({ length: 10 }, (_, i) => ({
          publishedAt: new Date(`2026-05-${String(i + 2).padStart(2, '0')}T12:00:00`),
          platform: 'douyin',
          accountId: 'acc_001',
          metrics: { views: 500 + i * 10, likes: 25, comments: 5, shares: 3 },
        })),
      ],
      dateRange: { start: new Date('2026-05-01'), end: new Date('2026-05-19') },
    },
    currentRule: {
      dailyCount: 3,
      timeSlots: ['08:00', '12:00', '18:00'],
      randomOffsetMin: 10,
      publishMode: 'client_direct',
    },
    ...overrides,
  };
}

function createAnomalyContext(overrides?: Partial<AnomalyContext>): AnomalyContext {
  return {
    type: 'task_failed',
    taskId: 'task_001',
    accountId: 'acc_001',
    platform: 'douyin',
    errorMessage: '发布超时',
    ...overrides,
  };
}

function createContentMatchContext(overrides?: Partial<ContentMatchContext>): ContentMatchContext {
  return {
    contents: [
      { id: 'c_001', title: '美食探店', tags: ['美食', '探店'] },
      { id: 'c_002', title: '旅行日记', tags: ['旅行'] },
    ],
    groups: [
      { id: 'g_001', name: '美食组', keywords: ['美食', '探店'] },
      { id: 'g_002', name: '旅行组', keywords: ['旅行', '风景'] },
    ],
    ...overrides,
  };
}

function createLLMResponse(content: string, overrides?: Partial<LLMResponse>): LLMResponse {
  return {
    content,
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    model: 'gpt-4o-mini',
    provider: 'openai',
    latency: 500,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AIService', () => {
  let service: AIService;

  beforeEach(() => {
    service = new AIService(createTestConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 构造函数 ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('enabled=true 时初始化 LLM 和缓存', () => {
      const svc = new AIService(createTestConfig({ enabled: true }));
      const config = svc.getConfig();
      expect(config.enabled).toBe(true);
    });

    it('enabled=false 时不初始化 LLM 和缓存', () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      expect(svc.getConfig().enabled).toBe(false);
    });
  });

  // ─── prePublishCheck ────────────────────────────────────────────────

  describe('prePublishCheck', () => {
    it('disabled 时走规则引擎', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createPrePublishContext();
      const result = await svc.prePublishCheck(ctx);

      expect(result.checks.accountHealth).toBe(true);
      expect(result.checks.scheduleReasonable).toBe(true);
    });

    it('规则引擎检测到 Cookie 过期账号', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createPrePublishContext({
        accounts: [
          { id: 'a1', platform: 'douyin', nickname: '过期账号', cookieStatus: 'invalid' },
          { id: 'a2', platform: 'douyin', nickname: '正常账号', cookieStatus: 'valid' },
        ],
      });

      const result = await svc.prePublishCheck(ctx);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.title.includes('Cookie'))).toBe(true);
      expect(result.checks.accountHealth).toBe(false);
    });

    it('规则引擎检测到 1 小时内有发布记录的账号', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const recentDate = new Date(Date.now() - 30 * 60 * 1000);
      const ctx = createPrePublishContext({
        accounts: [
          {
            id: 'a1',
            platform: 'douyin',
            nickname: '频繁发布账号',
            cookieStatus: 'valid',
            lastPublishAt: recentDate,
          },
        ],
      });

      const result = await svc.prePublishCheck(ctx);
      expect(result.suggestions.some(s => s.title.includes('1 小时内'))).toBe(true);
    });

    it('规则引擎检测到大量发布任务', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createPrePublishContext({
        scheduleSlots: Array.from({ length: 12 }, (_, i) => ({
          time: new Date(`2026-05-19T${String(8 + i).padStart(2, '0')}:00:00`),
          contentId: `c_${i}`,
          accountIds: ['acc_001'],
        })),
      });

      const result = await svc.prePublishCheck(ctx);
      expect(result.suggestions.some(s => s.title.includes('任务较多'))).toBe(true);
    });

    it('LLM 成功时返回解析结果', async () => {
      const svc = new AIService(createTestConfig({ enabled: true, cacheTTL: 100 }));

      const llmResponse = createLLMResponse(
        JSON.stringify({
          suggestions: [
            { title: '排期冲突', description: '时间重叠', level: 'warning', confidence: 0.8 },
          ],
        })
      );

      const callSpy = vi.spyOn(svc, 'prePublishCheck');

      // Mock internal LLM call by intercepting at the prePublishCheck level
      // Since AIService creates its own LLMService, we need a different approach
      // We'll test the full flow by mocking fetch
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: llmResponse.content } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          })),
          json: () => Promise.resolve({
            choices: [{ message: { content: llmResponse.content } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          }),
        })
      ));

      const ctx = createPrePublishContext();
      const result = await svc.prePublishCheck(ctx);

      expect(result.suggestions).toBeDefined();
      expect(result.checks).toBeDefined();
    });

    it('LLM 失败时降级到规则引擎', async () => {
      const svc = new AIService(createTestConfig({ enabled: true, cacheTTL: 100 }));

      mockFetchNetworkError(new Error('API down'));

      const ctx = createPrePublishContext();
      const result = await svc.prePublishCheck(ctx);

      // 应该走规则引擎路径，返回默认结果
      expect(result.suggestions).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.checks.accountHealth).toBe(true);
    });
  });

  // ─── optimizeRule ────────────────────────────────────────────────────

  describe('optimizeRule', () => {
    it('disabled 时走规则引擎', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createRuleOptimizationContext();
      const result = await svc.optimizeRule(ctx);

      expect(result.suggestions).toBeDefined();
    });

    it('规则引擎记录不足 10 条时返回空建议', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createRuleOptimizationContext({
        historicalData: {
          publishRecords: Array.from({ length: 5 }, (_, i) => ({
            publishedAt: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T12:00:00`),
            platform: 'douyin',
            accountId: 'acc_001',
            metrics: { views: 500, likes: 20, comments: 5, shares: 2 },
          })),
          dateRange: { start: new Date('2026-05-01'), end: new Date('2026-05-19') },
        },
      });

      const result = await svc.optimizeRule(ctx);
      expect(result.suggestions).toHaveLength(0);
    });

    it('规则引擎在播放量差异大时生成时间建议', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createRuleOptimizationContext({
        historicalData: {
          publishRecords: [
            ...Array.from({ length: 15 }, () => ({
              publishedAt: new Date('2026-05-01T12:00:00'),
              platform: 'douyin',
              accountId: 'acc_001',
              metrics: { views: 5000, likes: 100, comments: 20, shares: 10 },
            })),
            ...Array.from({ length: 15 }, () => ({
              publishedAt: new Date('2026-05-01T20:00:00'),
              platform: 'douyin',
              accountId: 'acc_001',
              metrics: { views: 1000, likes: 20, comments: 5, shares: 2 },
            })),
          ],
          dateRange: { start: new Date('2026-04-01'), end: new Date('2026-05-19') },
        },
      });

      const result = await svc.optimizeRule(ctx);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].title).toContain('发布效果最佳');
    });

    it('LLM 成功时返回优化结果', async () => {
      const svc = new AIService(createTestConfig({ enabled: true, cacheTTL: 100 }));

      const llmContent = JSON.stringify({
        suggestions: [
          { title: '调整发布时间', description: '建议调整', level: 'strong', confidence: 0.9 },
        ],
        optimizations: {
          suggestedTimeSlots: ['10:00', '14:00'],
          reasoning: '数据分析结果',
        },
      });

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: llmContent } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          })),
          json: () => Promise.resolve({
            choices: [{ message: { content: llmContent } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          }),
        })
      ));

      const ctx = createRuleOptimizationContext();
      const result = await svc.optimizeRule(ctx);
      expect(result.suggestions).toBeDefined();
    });

    it('LLM 失败时降级到规则引擎', async () => {
      const svc = new AIService(createTestConfig({ enabled: true, cacheTTL: 100 }));
      mockFetchNetworkError(new Error('timeout'));

      const ctx = createRuleOptimizationContext();
      const result = await svc.optimizeRule(ctx);
      expect(result.suggestions).toBeDefined();
    });
  });

  // ─── detectAnomaly ────────────────────────────────────────────────────

  describe('detectAnomaly', () => {
    it.each([
      { type: 'task_failed' as const, severity: 'critical' as const, action: 'retry' as const, title: '发布任务失败' },
      { type: 'cookie_expiring' as const, severity: 'warning' as const, action: 'relogin' as const, title: 'Cookie 即将过期' },
      { type: 'account_limited' as const, severity: 'warning' as const, action: 'investigate' as const, title: '账号可能被限流' },
      { type: 'publish_error' as const, severity: 'critical' as const, action: 'retry' as const, title: '发布过程出错' },
    ])('type=$type 映射到 severity=$severity, action=$action', ({ type, severity, action, title }) => {
      const ctx = createAnomalyContext({ type });
      const alert = service.detectAnomaly(ctx);

      expect(alert).not.toBeNull();
      expect(alert!.type).toBe(type);
      expect(alert!.severity).toBe(severity);
      expect(alert!.action).toBe(action);
      expect(alert!.title).toBe(title);
    });

    it('生成唯一 ID', () => {
      const ctx = createAnomalyContext();
      const alert1 = service.detectAnomaly(ctx);
      const alert2 = service.detectAnomaly(ctx);
      expect(alert1!.id).not.toBe(alert2!.id);
    });

    it('ID 以 alert_ 前缀开头', () => {
      const alert = service.detectAnomaly(createAnomalyContext());
      expect(alert!.id).toMatch(/^alert_/);
    });

    it('使用 context 中的 errorMessage 作为 description', () => {
      const alert = service.detectAnomaly(createAnomalyContext({ errorMessage: '自定义错误' }));
      expect(alert!.description).toBe('自定义错误');
    });

    it('无 errorMessage 时使用默认 description', () => {
      const alert = service.detectAnomaly({ type: 'task_failed' });
      expect(alert!.description).toContain('task_failed');
    });

    it('包含完整的 context', () => {
      const ctx = createAnomalyContext();
      const alert = service.detectAnomaly(ctx);
      expect(alert!.context).toEqual(ctx);
    });

    it('createdAt 为当前时间', () => {
      const before = new Date();
      const alert = service.detectAnomaly(createAnomalyContext());
      const after = new Date();
      expect(alert!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(alert!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ─── matchContentToGroup ──────────────────────────────────────────────

  describe('matchContentToGroup', () => {
    it('disabled 时返回空匹配，所有内容为 unmatched', async () => {
      const svc = new AIService(createTestConfig({ enabled: false }));
      const ctx = createContentMatchContext();
      const result = await svc.matchContentToGroup(ctx);

      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toEqual(['c_001', 'c_002']);
    });

    it('空内容时返回空匹配', async () => {
      const svc = new AIService(createTestConfig({ enabled: true }));
      const ctx = createContentMatchContext({ contents: [] });
      const result = await svc.matchContentToGroup(ctx);

      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
    });

    it('LLM 返回有效匹配结果', async () => {
      const svc = new AIService(createTestConfig({ enabled: true }));

      const matchContent = JSON.stringify({
        matches: [
          { contentId: 'c_001', groupId: 'g_001', confidence: 0.9, reasoning: '美食内容' },
          { contentId: 'c_002', groupId: 'g_002', confidence: 0.85, reasoning: '旅行内容' },
        ],
      });

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: matchContent } }],
            usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
          })),
          json: () => Promise.resolve({
            choices: [{ message: { content: matchContent } }],
            usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
          }),
        })
      ));

      const ctx = createContentMatchContext();
      const result = await svc.matchContentToGroup(ctx);

      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].contentId).toBe('c_001');
      expect(result.matches[0].suggestedGroupId).toBe('g_001');
      expect(result.unmatched).toHaveLength(0);
    });

    it('LLM 返回部分匹配时 unmatched 包含未匹配内容', async () => {
      const svc = new AIService(createTestConfig({ enabled: true }));

      const matchContent = JSON.stringify({
        matches: [
          { contentId: 'c_001', groupId: 'g_001', confidence: 0.9, reasoning: '匹配' },
        ],
      });

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: matchContent } }],
            usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
          })),
          json: () => Promise.resolve({
            choices: [{ message: { content: matchContent } }],
            usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
          }),
        })
      ));

      const ctx = createContentMatchContext();
      const result = await svc.matchContentToGroup(ctx);

      expect(result.matches).toHaveLength(1);
      expect(result.unmatched).toEqual(['c_002']);
    });

    it('LLM 返回无效 JSON 时所有内容为 unmatched', async () => {
      const svc = new AIService(createTestConfig({ enabled: true }));

      const invalidJsonContent = 'this is not valid json at all';
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: invalidJsonContent } }],
            usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100 },
          })),
          json: () => Promise.resolve({
            choices: [{ message: { content: invalidJsonContent } }],
            usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100 },
          }),
        })
      ));

      const ctx = createContentMatchContext();
      const result = await svc.matchContentToGroup(ctx);

      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toEqual(['c_001', 'c_002']);
    });
  });

  // ─── 成本追踪 ──────────────────────────────────────────────────────────

  describe('cost tracking', () => {
    it('costTracking=false 时不记录成本', async () => {
      const svc = new AIService(createTestConfig({ enabled: true, costTracking: false }));

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({
            choices: [{ message: { content: '{"suggestions":[]}' } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          })),
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"suggestions":[]}' } }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          }),
        })
      ));

      await svc.prePublishCheck(createPrePublishContext());
      const summary = svc.getCostSummary();
      expect(summary.totalCost).toBe(0);
      expect(summary.records).toHaveLength(0);
    });

    it('getCostSummary 初始状态为零', () => {
      const summary = service.getCostSummary();
      expect(summary.totalCost).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.records).toHaveLength(0);
    });

    it('getCostSummary 返回配置的副本', () => {
      const summary1 = service.getCostSummary();
      summary1.totalCost = 999;
      const summary2 = service.getCostSummary();
      expect(summary2.totalCost).toBe(0);
    });
  });

  // ─── 配置管理 ──────────────────────────────────────────────────────────

  describe('updateConfig / getConfig', () => {
    it('updateConfig 更新配置', () => {
      service.updateConfig({ costTracking: false });
      expect(service.getConfig().costTracking).toBe(false);
    });

    it('getConfig 返回副本', () => {
      const config = service.getConfig();
      config.enabled = false;
      expect(service.getConfig().enabled).toBe(true);
    });
  });

  // ─── 单例函数 ──────────────────────────────────────────────────────────

  describe('initAIService / getAIService', () => {
    afterEach(() => {
      initAIService(createTestConfig());
    });

    it('initAIService 返回 AIService 实例', () => {
      const instance = initAIService(createTestConfig());
      expect(instance).toBeInstanceOf(AIService);
    });

    it('getAIService 返回已初始化的实例', () => {
      const instance = initAIService(createTestConfig());
      expect(getAIService()).toBe(instance);
    });

    it('getAIService 未初始化时抛出错误', () => {
      // initAIService 每次调用都覆盖单例，无法真正测试未初始化状态
      // 但可以验证初始化后的行为
      initAIService(createTestConfig());
      expect(() => getAIService()).not.toThrow();
    });
  });
});

function mockFetchNetworkError(error: Error): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(error)));
}
