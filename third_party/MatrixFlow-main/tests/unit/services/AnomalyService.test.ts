import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AnomalyContext, AnomalyAlert } from '@electron/ai/types';

// Mock AIService before importing AnomalyService
const mockDetectAnomaly = vi.fn();
vi.mock('@electron/ai/AIService', () => ({
  getAIService: () => ({
    detectAnomaly: mockDetectAnomaly,
  }),
}));

// Must import after mock
let AnomalyServiceClass: typeof import('@electron/services/AnomalyService').AnomalyService;

// Re-import a fresh module each time — we need the class
// Since it's exported as `new AnomalyService()`, we grab the constructor via proto
import { anomalyService } from '@electron/services/AnomalyService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function createAlert(overrides?: Partial<AnomalyAlert>): AnomalyAlert {
  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'task_failed',
    severity: 'critical',
    title: '发布任务失败',
    description: '发布超时',
    action: 'retry',
    context: createAnomalyContext(),
    createdAt: new Date(),
    ...overrides,
  };
}

// Access private fields via (service as any) for testing
function getService(): typeof anomalyService & {
  alerts: Map<string, AnomalyAlert>;
  listeners: Set<(alert: AnomalyAlert) => void>;
  maxAlerts: number;
} {
  return anomalyService as unknown as typeof anomalyService & {
    alerts: Map<string, AnomalyAlert>;
    listeners: Set<(alert: AnomalyAlert) => void>;
    maxAlerts: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AnomalyService', () => {
  const service = getService();

  beforeEach(() => {
    service.alerts.clear();
    service.listeners.clear();
    mockDetectAnomaly.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── report ───────────────────────────────────────────────────────────

  describe('report', () => {
    it('调用 AIService.detectAnomaly 并存储返回的 alert', () => {
      const alert = createAlert();
      mockDetectAnomaly.mockReturnValue(alert);

      const result = anomalyService.report(createAnomalyContext());

      expect(result).toEqual(alert);
      expect(service.alerts.has(alert.id)).toBe(true);
    });

    it('detectAnomaly 返回 null 时返回 null', () => {
      mockDetectAnomaly.mockReturnValue(null);

      const result = anomalyService.report(createAnomalyContext());

      expect(result).toBeNull();
      expect(service.alerts.size).toBe(0);
    });

    it('detectAnomaly 抛出异常时返回 null', () => {
      mockDetectAnomaly.mockImplementation(() => {
        throw new Error('AI 服务不可用');
      });

      const result = anomalyService.report(createAnomalyContext());

      expect(result).toBeNull();
    });

    it('通知所有已注册的监听器', () => {
      const alert = createAlert();
      mockDetectAnomaly.mockReturnValue(alert);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      anomalyService.subscribe(listener1);
      anomalyService.subscribe(listener2);

      anomalyService.report(createAnomalyContext());

      expect(listener1).toHaveBeenCalledWith(alert);
      expect(listener2).toHaveBeenCalledWith(alert);
    });

    it('监听器异常不影响其他监听器和主流程', () => {
      const alert = createAlert();
      mockDetectAnomaly.mockReturnValue(alert);

      const badListener = vi.fn(() => {
        throw new Error('listener error');
      });
      const goodListener = vi.fn();
      anomalyService.subscribe(badListener);
      anomalyService.subscribe(goodListener);

      const result = anomalyService.report(createAnomalyContext());

      expect(result).not.toBeNull();
      expect(goodListener).toHaveBeenCalledWith(alert);
    });
  });

  // ─── reportTaskFailed ─────────────────────────────────────────────────

  describe('reportTaskFailed', () => {
    it('构造正确的 context 调用 report', () => {
      const alert = createAlert();
      mockDetectAnomaly.mockReturnValue(alert);

      const result = anomalyService.reportTaskFailed('t1', 'a1', 'douyin', 'error msg');

      expect(result).toBe(alert);
      expect(mockDetectAnomaly).toHaveBeenCalledWith({
        type: 'task_failed',
        taskId: 't1',
        accountId: 'a1',
        platform: 'douyin',
        errorMessage: 'error msg',
      });
    });
  });

  // ─── reportCookieExpiring ─────────────────────────────────────────────

  describe('reportCookieExpiring', () => {
    it('构造正确的 context 调用 report', () => {
      const alert = createAlert({ type: 'cookie_expiring', severity: 'warning' });
      mockDetectAnomaly.mockReturnValue(alert);

      const result = anomalyService.reportCookieExpiring('a1', 'douyin', 3);

      expect(result).toBe(alert);
      expect(mockDetectAnomaly).toHaveBeenCalledWith({
        type: 'cookie_expiring',
        accountId: 'a1',
        platform: 'douyin',
        metadata: { daysLeft: 3 },
      });
    });
  });

  // ─── reportAccountLimited ─────────────────────────────────────────────

  describe('reportAccountLimited', () => {
    it('构造正确的 context 调用 report', () => {
      const alert = createAlert({ type: 'account_limited', severity: 'warning' });
      mockDetectAnomaly.mockReturnValue(alert);

      const result = anomalyService.reportAccountLimited('a1', 'douyin', '限流中');

      expect(result).toBe(alert);
      expect(mockDetectAnomaly).toHaveBeenCalledWith({
        type: 'account_limited',
        accountId: 'a1',
        platform: 'douyin',
        metadata: { reason: '限流中' },
      });
    });
  });

  // ─── reportPublishError ───────────────────────────────────────────────

  describe('reportPublishError', () => {
    it('构造正确的 context 调用 report', () => {
      const alert = createAlert({ type: 'publish_error', severity: 'critical' });
      mockDetectAnomaly.mockReturnValue(alert);

      const result = anomalyService.reportPublishError('t1', 'a1', 'douyin', '上传失败');

      expect(result).toBe(alert);
      expect(mockDetectAnomaly).toHaveBeenCalledWith({
        type: 'publish_error',
        taskId: 't1',
        accountId: 'a1',
        platform: 'douyin',
        errorMessage: '上传失败',
      });
    });
  });

  // ─── getActiveAlerts ──────────────────────────────────────────────────

  describe('getActiveAlerts', () => {
    it('返回 severity 为 critical 或 warning 的告警', () => {
      const criticalAlert = createAlert({ severity: 'critical', createdAt: new Date('2026-05-19T10:00:00') });
      const warningAlert = createAlert({ severity: 'warning', createdAt: new Date('2026-05-19T12:00:00') });
      const infoAlert = createAlert({ severity: 'info', createdAt: new Date('2026-05-19T11:00:00') });

      service.alerts.set(criticalAlert.id, criticalAlert);
      service.alerts.set(warningAlert.id, warningAlert);
      service.alerts.set(infoAlert.id, infoAlert);

      const result = anomalyService.getActiveAlerts();

      expect(result).toHaveLength(2);
      // 按时间降序
      expect(result[0].id).toBe(warningAlert.id);
      expect(result[1].id).toBe(criticalAlert.id);
    });

    it('无告警时返回空数组', () => {
      expect(anomalyService.getActiveAlerts()).toEqual([]);
    });
  });

  // ─── getAlertsByAccount ───────────────────────────────────────────────

  describe('getAlertsByAccount', () => {
    it('过滤指定账号的告警', () => {
      const alert1 = createAlert({
        severity: 'critical',
        context: createAnomalyContext({ accountId: 'acc_001' }),
        createdAt: new Date('2026-05-19T10:00:00'),
      });
      const alert2 = createAlert({
        severity: 'warning',
        context: createAnomalyContext({ accountId: 'acc_002' }),
        createdAt: new Date('2026-05-19T11:00:00'),
      });

      service.alerts.set(alert1.id, alert1);
      service.alerts.set(alert2.id, alert2);

      const result = anomalyService.getAlertsByAccount('acc_001');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(alert1.id);
    });
  });

  // ─── getAlertsByTask ──────────────────────────────────────────────────

  describe('getAlertsByTask', () => {
    it('过滤指定任务的告警', () => {
      const alert1 = createAlert({
        severity: 'critical',
        context: createAnomalyContext({ taskId: 'task_001' }),
        createdAt: new Date('2026-05-19T10:00:00'),
      });
      const alert2 = createAlert({
        severity: 'warning',
        context: createAnomalyContext({ taskId: 'task_002' }),
        createdAt: new Date('2026-05-19T11:00:00'),
      });

      service.alerts.set(alert1.id, alert1);
      service.alerts.set(alert2.id, alert2);

      const result = anomalyService.getAlertsByTask('task_001');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(alert1.id);
    });
  });

  // ─── dismissAlert ─────────────────────────────────────────────────────

  describe('dismissAlert', () => {
    it('删除存在的告警并返回 true', () => {
      const alert = createAlert();
      service.alerts.set(alert.id, alert);

      const result = anomalyService.dismissAlert(alert.id);

      expect(result).toBe(true);
      expect(service.alerts.has(alert.id)).toBe(false);
    });

    it('告警不存在时返回 false', () => {
      const result = anomalyService.dismissAlert('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ─── dismissAllForAccount ─────────────────────────────────────────────

  describe('dismissAllForAccount', () => {
    it('删除指定账号的所有告警并返回数量', () => {
      const alert1 = createAlert({ context: createAnomalyContext({ accountId: 'acc_001' }) });
      const alert2 = createAlert({ context: createAnomalyContext({ accountId: 'acc_001' }) });
      const alert3 = createAlert({ context: createAnomalyContext({ accountId: 'acc_002' }) });

      service.alerts.set(alert1.id, alert1);
      service.alerts.set(alert2.id, alert2);
      service.alerts.set(alert3.id, alert3);

      const count = anomalyService.dismissAllForAccount('acc_001');

      expect(count).toBe(2);
      expect(service.alerts.size).toBe(1);
    });

    it('无匹配时返回 0', () => {
      const count = anomalyService.dismissAllForAccount('nonexistent');
      expect(count).toBe(0);
    });
  });

  // ─── clearAll ─────────────────────────────────────────────────────────

  describe('clearAll', () => {
    it('清空所有告警', () => {
      service.alerts.set('a1', createAlert());
      service.alerts.set('a2', createAlert());

      anomalyService.clearAll();

      expect(service.alerts.size).toBe(0);
    });
  });

  // ─── subscribe ────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('返回取消订阅函数', () => {
      const listener = vi.fn();
      const unsubscribe = anomalyService.subscribe(listener);

      expect(service.listeners.has(listener)).toBe(true);

      unsubscribe();

      expect(service.listeners.has(listener)).toBe(false);
    });

    it('取消订阅后不再收到通知', () => {
      const alert = createAlert();
      mockDetectAnomaly.mockReturnValue(alert);

      const listener = vi.fn();
      const unsubscribe = anomalyService.subscribe(listener);
      unsubscribe();

      anomalyService.report(createAnomalyContext());

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── pruneOldAlerts ──────────────────────────────────────────────────

  describe('pruneOldAlerts (maxAlerts)', () => {
    it('超过 maxAlerts 时只保留最新的告警', () => {
      const maxAlerts = 5;
      service.maxAlerts = maxAlerts;

      // Create 8 alerts with different timestamps
      for (let i = 0; i < 8; i++) {
        const alert = createAlert({
          id: `alert_${i}`,
          createdAt: new Date(`2026-05-19T${String(10 + i).padStart(2, '0')}:00:00`),
        });
        service.alerts.set(alert.id, alert);
      }

      // Trigger prune via report
      const newestAlert = createAlert({
        id: 'alert_newest',
        createdAt: new Date('2026-05-19T20:00:00'),
      });
      mockDetectAnomaly.mockReturnValue(newestAlert);
      anomalyService.report(createAnomalyContext());

      // After pruning, should have maxAlerts alerts
      expect(service.alerts.size).toBeLessThanOrEqual(maxAlerts);
      // Newest should still be there
      expect(service.alerts.has('alert_newest')).toBe(true);

      // Restore
      service.maxAlerts = 100;
    });

    it('未超过 maxAlerts 时不裁剪', () => {
      service.maxAlerts = 100;

      for (let i = 0; i < 3; i++) {
        service.alerts.set(`alert_${i}`, createAlert({ id: `alert_${i}` }));
      }

      const alert = createAlert({ id: 'alert_new' });
      mockDetectAnomaly.mockReturnValue(alert);
      anomalyService.report(createAnomalyContext());

      expect(service.alerts.size).toBe(4);
    });
  });
});
