import { Logger } from './Logger';

const logger = new Logger('FailureCoordinator');

/** 时间窗口：30 分钟内的失败计数 */
const FAILURE_WINDOW_MS = 30 * 60 * 1000;
/** 触发停止的失败次数阈值 */
const MAX_FAILURES_THRESHOLD = 3;

interface FailureRecord {
  platform: string;
  accountId: string;
  error: string;
  timestamp: string;
}

export class FailureCoordinator {
  private failureHistory = new Map<string, FailureRecord[]>();

  recordFailure(platform: string, accountId: string, error: string): void {
    const key = `${platform}:${accountId}`;
    const history = this.failureHistory.get(key) ?? [];
    history.push({ platform, accountId, error, timestamp: new Date().toISOString() });
    this.failureHistory.set(key, history);
    logger.warn(`Failure recorded: ${key} - ${error}`);
  }

  shouldStopAccount(platform: string, accountId: string): boolean {
    const key = `${platform}:${accountId}`;
    const history = this.failureHistory.get(key) ?? [];
    const recentFailures = history.filter(
      (f) => Date.now() - new Date(f.timestamp).getTime() < FAILURE_WINDOW_MS
    );
    return recentFailures.length >= MAX_FAILURES_THRESHOLD;
  }

  markSkipped(platform: string, accountId: string, reason: string): { status: 'skipped'; error: string } {
    logger.info(`Marking skipped: ${platform}:${accountId} - ${reason}`);
    return { status: 'skipped', error: reason };
  }

  clearHistory(platform: string, accountId: string): void {
    this.failureHistory.delete(`${platform}:${accountId}`);
  }

  getHistory(platform: string, accountId: string): FailureRecord[] {
    return this.failureHistory.get(`${platform}:${accountId}`) ?? [];
  }
}
