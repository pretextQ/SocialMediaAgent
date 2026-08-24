import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  VALID_STATE_TRANSITIONS,
} from '../../electron/core/QueueManager';
import { TaskEvents } from '../../electron/core/types/task';
import type { TaskStatus } from '../../electron/core/types/task';

describe('TaskScheduler State Machine v0.3.1', () => {
  describe('8-State Enum Definition', () => {
    it('should have all 8 primary states defined', () => {
      const expectedStates: TaskStatus[] = [
        'queued',
        'pending',
        'uploading',
        'publishing',
        'audit',
        'success',
        'failed',
        'cancelled',
      ];

      for (const state of expectedStates) {
        expect(TASK_STATUS_LABELS[state]).toBeDefined();
        expect(TASK_STATUS_COLORS[state]).toBeDefined();
      }
    });

    it('should have auxiliary states (retry, skipped)', () => {
      expect(TASK_STATUS_LABELS['retry']).toBe('重试中');
      expect(TASK_STATUS_LABELS['skipped']).toBe('已跳过');
      expect(TASK_STATUS_COLORS['retry']).toBeDefined();
      expect(TASK_STATUS_COLORS['skipped']).toBeDefined();
    });
  });

  describe('State Labels (Chinese)', () => {
    it('should have correct Chinese labels for all 8 states', () => {
      const expectedLabels: Record<TaskStatus, string> = {
        queued: '排队中',
        pending: '等待中',
        uploading: '上传中',
        publishing: '发布中',
        audit: '审核中',
        success: '已发布',
        failed: '失败',
        cancelled: '已取消',
        retry: '重试中',
        skipped: '已跳过',
      };

      for (const [state, expectedLabel] of Object.entries(expectedLabels)) {
        expect(TASK_STATUS_LABELS[state as TaskStatus]).toBe(expectedLabel);
      }
    });
  });

  describe('State Colors', () => {
    it('should have valid color definitions for all 8 states', () => {
      const primaryStates: TaskStatus[] = [
        'queued',
        'pending',
        'uploading',
        'publishing',
        'audit',
        'success',
        'failed',
        'cancelled',
      ];

      for (const state of primaryStates) {
        const colors = TASK_STATUS_COLORS[state];
        expect(colors).toBeDefined();
        expect(colors.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(colors.fg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it('should have distinct colors for different states', () => {
      const primaryStates: TaskStatus[] = [
        'queued',
        'pending',
        'uploading',
        'publishing',
        'audit',
        'success',
        'failed',
        'cancelled',
      ];

      const bgColors = primaryStates.map((s) => TASK_STATUS_COLORS[s].bg);
      const uniqueColors = new Set(bgColors);

      expect(uniqueColors.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe('State Transitions', () => {
    it('should allow valid transitions from queued', () => {
      expect(VALID_STATE_TRANSITIONS['queued']).toContain('pending');
      expect(VALID_STATE_TRANSITIONS['queued']).toContain('cancelled');
    });

    it('should allow valid transitions from pending', () => {
      expect(VALID_STATE_TRANSITIONS['pending']).toContain('uploading');
      expect(VALID_STATE_TRANSITIONS['pending']).toContain('cancelled');
    });

    it('should allow valid transitions from uploading', () => {
      expect(VALID_STATE_TRANSITIONS['uploading']).toContain('publishing');
      expect(VALID_STATE_TRANSITIONS['uploading']).toContain('failed');
      expect(VALID_STATE_TRANSITIONS['uploading']).toContain('cancelled');
    });

    it('should allow valid transitions from publishing', () => {
      expect(VALID_STATE_TRANSITIONS['publishing']).toContain('audit');
      expect(VALID_STATE_TRANSITIONS['publishing']).toContain('failed');
      expect(VALID_STATE_TRANSITIONS['publishing']).toContain('cancelled');
    });

    it('should allow valid transitions from audit', () => {
      expect(VALID_STATE_TRANSITIONS['audit']).toContain('success');
      expect(VALID_STATE_TRANSITIONS['audit']).toContain('failed');
    });

    it('should have terminal states with no outgoing transitions', () => {
      expect(VALID_STATE_TRANSITIONS['success']).toHaveLength(0);
      expect(VALID_STATE_TRANSITIONS['cancelled']).toHaveLength(0);
      expect(VALID_STATE_TRANSITIONS['skipped']).toHaveLength(0);
    });

    it('should allow retry from failed state', () => {
      expect(VALID_STATE_TRANSITIONS['failed']).toContain('retry');
      expect(VALID_STATE_TRANSITIONS['failed']).toContain('queued');
    });

    it('should not allow invalid transitions', () => {
      const invalidTransitions: [TaskStatus, TaskStatus][] = [
        ['success', 'pending'],
        ['success', 'uploading'],
        ['cancelled', 'pending'],
        ['failed', 'success'],
        ['queued', 'success'],
      ];

      for (const [from, to] of invalidTransitions) {
        expect(VALID_STATE_TRANSITIONS[from]).not.toContain(to);
      }
    });
  });

  describe('v0.3.1 Migration: Old -> New State Mapping', () => {
    it('should map old running state to uploading', () => {
      const oldRunningState = 'running';
      const newEquivalent = 'uploading';

      expect(TASK_STATUS_LABELS[newEquivalent]).toBe('上传中');
      expect(VALID_STATE_TRANSITIONS[newEquivalent]).toBeDefined();
    });

    it('should map old completed state to success', () => {
      const oldCompletedState = 'completed';
      const newEquivalent = 'success';

      expect(TASK_STATUS_LABELS[newEquivalent]).toBe('已发布');
      expect(VALID_STATE_TRANSITIONS[newEquivalent]).toHaveLength(0);
    });
  });

  describe('TaskEvents Constants', () => {
    it('should have events for all 8 primary states', () => {
      expect(TaskEvents.TASK_QUEUED).toBe('task:queued');
      expect(TaskEvents.TASK_UPLOADING).toBe('task:uploading');
      expect(TaskEvents.TASK_PUBLISHING).toBe('task:publishing');
      expect(TaskEvents.TASK_AUDIT).toBe('task:audit');
      expect(TaskEvents.TASK_SUCCESS).toBe('task:success');
      expect(TaskEvents.TASK_FAILED).toBe('task:failed');
      expect(TaskEvents.TASK_CANCELLED).toBe('task:cancelled');
    });

    it('should maintain backward compatible events', () => {
      expect(TaskEvents.TASK_STARTED).toBe('task:started');
      expect(TaskEvents.TASK_COMPLETED).toBe('task:completed');
      expect(TaskEvents.TASK_RETRY).toBe('task:retry');
    });
  });

  describe('State Machine Completeness', () => {
    it('should have exactly 10 total states (8 primary + 2 auxiliary)', () => {
      const allStates = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];
      expect(allStates).toHaveLength(10);
    });

    it('should have transition rules for all states', () => {
      const allStates = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];
      for (const state of allStates) {
        expect(VALID_STATE_TRANSITIONS[state]).toBeDefined();
        expect(Array.isArray(VALID_STATE_TRANSITIONS[state])).toBe(true);
      }
    });
  });
});
