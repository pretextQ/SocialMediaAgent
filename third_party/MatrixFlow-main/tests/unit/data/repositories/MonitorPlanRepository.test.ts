import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { MonitorPlanRepository } from '@electron/data/repositories/MonitorPlanRepository';
import type { MonitorPlan } from '@electron/data/types';

describe('MonitorPlanRepository', () => {
  let repo: MonitorPlanRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockPlan: MonitorPlan = {
    id: 'mp-1',
    name: 'Daily Stats Monitor',
    platform: 'douyin',
    target_type: 'video',
    target_id: 'vid-1',
    interval_min: 60,
    enabled: 1,
    last_run_at: null,
    next_run_at: '2025-06-01T00:00:00.000Z',
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new MonitorPlanRepository();
  });

  describe('constructor', () => {
    it('uses "monitor_plans" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('monitor_plans');
    });
  });

  describe('findEnabled', () => {
    it('returns enabled plans', async () => {
      stmt.all.mockReturnValue([mockPlan]);

      const result = await repo.findEnabled();

      expect(result).toEqual([mockPlan]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE enabled = @enabled')
      );
    });

    it('returns empty array when no enabled plans', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findEnabled();

      expect(result).toEqual([]);
    });
  });

  describe('findDueNow', () => {
    it('returns due plans that are enabled and active', async () => {
      stmt.all.mockReturnValue([mockPlan]);

      const result = await repo.findDueNow();

      expect(result).toEqual([mockPlan]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("enabled = 1 AND next_run_at <= ? AND status = 'active'")
      );
    });

    it('returns empty array when no plans are due', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findDueNow();

      expect(result).toEqual([]);
    });
  });

  describe('updateLastRun', () => {
    it('updates last_run_at and calculates next_run_at from interval', async () => {
      const updated = { ...mockPlan, last_run_at: '2025-06-01T01:00:00.000Z' };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.updateLastRun('mp-1', 60);

      expect(result.last_run_at).toBeTruthy();
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mp-1' })
      );
    });
  });

  describe('enable', () => {
    it('sets enabled to 1', async () => {
      const updated = { ...mockPlan, enabled: 1 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.enable('mp-1');

      expect(result.enabled).toBe(1);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: 1, id: 'mp-1' })
      );
    });
  });

  describe('disable', () => {
    it('sets enabled to 0', async () => {
      const updated = { ...mockPlan, enabled: 0 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.disable('mp-1');

      expect(result.enabled).toBe(0);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: 0, id: 'mp-1' })
      );
    });
  });

  describe('findById', () => {
    it('returns plan when found', async () => {
      stmt.get.mockReturnValue(mockPlan);

      const result = await repo.findById('mp-1');

      expect(result).toEqual(mockPlan);
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('insert', () => {
    it('inserts new plan', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockPlan) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'mp-1',
        name: 'Daily Stats Monitor',
        platform: 'douyin',
        target_type: 'video',
        target_id: 'vid-1',
        interval_min: 60,
        enabled: 1,
        last_run_at: null,
        next_run_at: '2025-06-01T00:00:00.000Z',
        status: 'active',
      });

      expect(result).toEqual(mockPlan);
    });
  });

  describe('update', () => {
    it('updates plan fields', async () => {
      const updated = { ...mockPlan, interval_min: 120 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.update('mp-1', { interval_min: 120 });

      expect(result.interval_min).toBe(120);
    });
  });

  describe('deleteById', () => {
    it('deletes plan by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('mp-1');

      expect(result).toBe(true);
    });
  });
});
