import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FailureCoordinator } from '../../../electron/core/FailureCoordinator';

describe('FailureCoordinator', () => {
  let coordinator: FailureCoordinator;

  beforeEach(() => {
    coordinator = new FailureCoordinator();
  });

  describe('recordFailure', () => {
    it('should add failure to history', () => {
      coordinator.recordFailure('douyin', 'acc1', 'timeout');
      const history = coordinator.getHistory('douyin', 'acc1');
      expect(history).toHaveLength(1);
      expect(history[0].error).toBe('timeout');
    });

    it('should accumulate failures for same account', () => {
      coordinator.recordFailure('douyin', 'acc1', 'error1');
      coordinator.recordFailure('douyin', 'acc1', 'error2');
      const history = coordinator.getHistory('douyin', 'acc1');
      expect(history).toHaveLength(2);
    });

    it('should separate history by platform:account', () => {
      coordinator.recordFailure('douyin', 'acc1', 'e1');
      coordinator.recordFailure('douyin', 'acc2', 'e2');
      coordinator.recordFailure('xiaohongshu', 'acc1', 'e3');
      
      expect(coordinator.getHistory('douyin', 'acc1')).toHaveLength(1);
      expect(coordinator.getHistory('douyin', 'acc2')).toHaveLength(1);
      expect(coordinator.getHistory('xiaohongshu', 'acc1')).toHaveLength(1);
    });
  });

  describe('shouldStopAccount', () => {
    it('should return false with 0 failures', () => {
      expect(coordinator.shouldStopAccount('douyin', 'acc1')).toBe(false);
    });

    it('should return false with 1-2 failures', () => {
      coordinator.recordFailure('douyin', 'acc1', 'e1');
      expect(coordinator.shouldStopAccount('douyin', 'acc1')).toBe(false);
      
      coordinator.recordFailure('douyin', 'acc1', 'e2');
      expect(coordinator.shouldStopAccount('douyin', 'acc1')).toBe(false);
    });

    it('should return true with 3 failures within 30min window', () => {
      coordinator.recordFailure('douyin', 'acc1', 'e1');
      coordinator.recordFailure('douyin', 'acc1', 'e2');
      coordinator.recordFailure('douyin', 'acc1', 'e3');
      expect(coordinator.shouldStopAccount('douyin', 'acc1')).toBe(true);
    });

    it('should return false when failures are outside 30min window', () => {
      // Record 2 recent failures
      coordinator.recordFailure('douyin', 'acc1', 'e1');
      coordinator.recordFailure('douyin', 'acc1', 'e2');
      
      // Manually add an old failure (35 minutes ago)
      const history = coordinator.getHistory('douyin', 'acc1');
      history.push({
        platform: 'douyin',
        accountId: 'acc1',
        error: 'old',
        timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      });
      
      expect(coordinator.shouldStopAccount('douyin', 'acc1')).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('should remove all records for an account', () => {
      coordinator.recordFailure('douyin', 'acc1', 'e1');
      coordinator.recordFailure('douyin', 'acc1', 'e2');
      
      coordinator.clearHistory('douyin', 'acc1');
      
      expect(coordinator.getHistory('douyin', 'acc1')).toHaveLength(0);
      expect(coordinator.shouldStopAccount('douyin', 'acc1')).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('should return empty array for unknown accounts', () => {
      expect(coordinator.getHistory('unknown', 'unknown')).toEqual([]);
    });
  });

  describe('markSkipped', () => {
    it('should return correct object', () => {
      const result = coordinator.markSkipped('douyin', 'acc1', 'predecessor failed');
      expect(result).toEqual({ status: 'skipped', error: 'predecessor failed' });
    });
  });
});
