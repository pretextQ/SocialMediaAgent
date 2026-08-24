/**
 * Watchdog — 卡死任务自动修复表
 *
 * 按 TaskStatus 8态 扫描长期处于非终态的任务，自动触发恢复逻辑。
 * 修复表：
 * - uploading  >5min → retry → 再超 5min → abandon
 * - publishing >5min → warn（不跳状态）
 * - publishing >15min → escalate → audit → 再超 30min → abandon
 * - audit      >30min → abandon
 * - pending    >1min  → retry
 * - queued     任意 → idle（保持）
 * - success/failed/cancelled → 终态不变
 */

import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { publishTaskRepo } from '../data/repositories/PublishTaskRepository';
import type { TaskStatus } from '../core/types/task';

const logger = new Logger('Watchdog');

// ─── Watchdog 事件 ───────────────────────────────────────────

export const WatchdogEvents = {
  RETRY: 'watchdog:retry',
  WARN: 'watchdog:warn',
  ESCALATE: 'watchdog:escalate',
  ABANDON: 'watchdog:abandon',
} as const;

export type WatchdogEventName = typeof WatchdogEvents[keyof typeof WatchdogEvents];

export interface WatchdogEvent {
  taskId: string;
  status: TaskStatus;
  elapsedMs: number;
  timestamp: number;
  message?: string;
}

// ─── Watchdog 规则 ───────────────────────────────────────────

export interface WatchdogRule {
  status: TaskStatus;
  triggerAfterMs: number;
  action: 'warn' | 'escalate' | 'retry' | 'abandon' | 'markAudit';
  /** action=retry 时可选目标状态，默认 queued */
  targetStatus?: TaskStatus;
  /** 最大触发次数，超过则不再触发（用于 uploading 重试限制） */
  maxOccurrences?: number;
}

const WATCHDOG_INTERVAL_MS = 30_000;

const DEFAULT_RULES: WatchdogRule[] = [
  // uploading: 5min 超时重试 1 次，再超 5min abandon
  {
    status: 'uploading',
    triggerAfterMs: 5 * 60 * 1000,
    action: 'retry',
    maxOccurrences: 1,
  },
  // publishing: 5min warn（不跳状态），15min escalate 到 audit
  {
    status: 'publishing',
    triggerAfterMs: 5 * 60 * 1000,
    action: 'warn',
  },
  {
    status: 'publishing',
    triggerAfterMs: 15 * 60 * 1000,
    action: 'markAudit',
    targetStatus: 'audit',
  },
  // audit: 30min abandon 终态
  {
    status: 'audit',
    triggerAfterMs: 30 * 60 * 1000,
    action: 'abandon',
  },
  // pending: 1min retry 回队列
  {
    status: 'pending',
    triggerAfterMs: 1 * 60 * 1000,
    action: 'retry',
    targetStatus: 'queued',
  },
];

function parseTaskTimestamp(value?: string | null): number {
  if (!value) return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = hasTimezone
    ? trimmed
    : `${trimmed.replace(' ', 'T')}Z`;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// ─── Watchdog 主类 ───────────────────────────────────────────

export class Watchdog {
  private rules: WatchdogRule[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private eventBus: EventBus;
  /** 每 taskId 累计触发次数（用于 maxOccurrences 限制） */
  private occurrenceCount = new Map<string, number>();

  constructor(rules: WatchdogRule[] = DEFAULT_RULES) {
    this.rules = rules;
    this.eventBus = EventBus.getInstance();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.check().catch((err) => logger.error(`Watchdog scan error: ${err}`));
    }, WATCHDOG_INTERVAL_MS);
    logger.info(`Watchdog 已启动 (扫描间隔=${WATCHDOG_INTERVAL_MS / 1000}s)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Watchdog 已停止');
    }
  }

  /**
   * 立即执行一次扫描，返回触发的事件列表。
   */
  async check(): Promise<WatchdogEvent[]> {
    const events: WatchdogEvent[] = [];
    const now = Date.now();

    // 扫描所有需要监控的状态（排除终态）
    const monitoredStatuses: TaskStatus[] = ['pending', 'uploading', 'publishing', 'audit'];
    for (const status of monitoredStatuses) {
      const page = await publishTaskRepo.findByStatus(status, { pageSize: 200 });
      for (const task of page.data) {
        const updatedAt = parseTaskTimestamp(task.updated_at);
        if (!updatedAt) {
          logger.warn(`Watchdog 跳过无法解析更新时间的任务: taskId=${task.id} status=${task.status} updated_at=${task.updated_at || ''}`);
          continue;
        }
        const elapsedMs = now - updatedAt;
        const relevantRules = this.rules.filter((r) => r.status === status);

        for (const rule of relevantRules) {
          if (elapsedMs < rule.triggerAfterMs) continue;

          // maxOccurrences 检查
          const occKey = `${task.id}:${rule.status}:${rule.action}`;
          const count = this.occurrenceCount.get(occKey) ?? 0;
          if (rule.maxOccurrences !== undefined && count >= rule.maxOccurrences) {
            // 超过最大次数，跳过；但如果 action=retry 仍需触发 abandon
            if (rule.action === 'retry') {
              const abandonRule: WatchdogRule = {
                status: rule.status,
                triggerAfterMs: rule.triggerAfterMs,
                action: 'abandon',
              };
              events.push(await this.executeRule(task.id, task.status as TaskStatus, abandonRule, elapsedMs, now));
            }
            continue;
          }

          // 记录触发次数
          this.occurrenceCount.set(occKey, count + 1);

          const evt = await this.executeRule(task.id, task.status as TaskStatus, rule, elapsedMs, now);
          if (evt) events.push(evt);
        }
      }
    }

    return events;
  }

  private async executeRule(
    taskId: string,
    currentStatus: TaskStatus,
    rule: WatchdogRule,
    elapsedMs: number,
    now: number,
  ): Promise<WatchdogEvent> {
    const evt: WatchdogEvent = {
      taskId,
      status: currentStatus,
      elapsedMs,
      timestamp: now,
    };

    switch (rule.action) {
      case 'warn': {
        // publishing 5min warn，不改状态，只发事件
        evt.message = `任务处于 ${currentStatus} 状态已超过 ${Math.round(elapsedMs / 60000)} 分钟`;
        this.eventBus.emit(WatchdogEvents.WARN, evt);
        logger.warn(`Watchdog warn: taskId=${taskId} status=${currentStatus} elapsed=${Math.round(elapsedMs / 60000)}min`);
        break;
      }

      case 'markAudit': {
        // publishing 15min escalate 到 audit
        const target = rule.targetStatus ?? 'audit';
        evt.message = `任务处于 ${currentStatus} 状态已超过 ${Math.round(elapsedMs / 60000)} 分钟，升级到审核`;
        await publishTaskRepo.update(taskId, { status: target, updated_at: new Date(now).toISOString() } as any);
        this.eventBus.emit(WatchdogEvents.ESCALATE, evt);
        logger.warn(`Watchdog escalate: taskId=${taskId} ${currentStatus}→${target} elapsed=${Math.round(elapsedMs / 60000)}min`);
        break;
      }

      case 'retry': {
        // pending 1min / uploading 5min 重试，回队列
        const target = rule.targetStatus ?? 'queued';
        evt.message = `任务处于 ${currentStatus} 状态已超过 ${Math.round(elapsedMs / 60000)} 分钟，重新入队`;
        await publishTaskRepo.update(taskId, { status: target, updated_at: new Date(now).toISOString() } as any);
        this.eventBus.emit(WatchdogEvents.RETRY, evt);
        logger.warn(`Watchdog retry: taskId=${taskId} ${currentStatus}→${target} elapsed=${Math.round(elapsedMs / 60000)}min`);
        break;
      }

      case 'abandon': {
        // audit 30min abandon 终态
        evt.message = `任务处于 ${currentStatus} 状态已超过 ${Math.round(elapsedMs / 60000)} 分钟，已终止`;
        await publishTaskRepo.markFinalFailed(taskId, evt.message);
        this.eventBus.emit(WatchdogEvents.ABANDON, evt);
        logger.warn(`Watchdog abandon: taskId=${taskId} status=${currentStatus} elapsed=${Math.round(elapsedMs / 60000)}min`);
        break;
      }
    }

    return evt;
  }
}

export const watchdog = new Watchdog();
