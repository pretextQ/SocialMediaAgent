import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { GroupPublishRuleRepository } from '@electron/data/repositories/GroupPublishRuleRepository';
import type { GroupPublishRule } from '@electron/data/types';

describe('GroupPublishRuleRepository', () => {
  let repo: GroupPublishRuleRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockRule: GroupPublishRule = {
    id: 'rule-1',
    group_id: 'group-1',
    platform: 'douyin',
    publish_interval_min: 60,
    daily_limit: 5,
    time_slots: '09:00-12:00,14:00-18:00',
    publish_mode: 'client_direct',
    enabled: 1,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new GroupPublishRuleRepository();
  });

  describe('constructor', () => {
    it('uses "group_publish_rules" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('group_publish_rules');
    });
  });

  describe('findByGroupId', () => {
    it('returns rules for given group', async () => {
      stmt.all.mockReturnValue([mockRule]);

      const result = await repo.findByGroupId('group-1');

      expect(result).toEqual([mockRule]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE group_id = @group_id')
      );
    });

    it('returns empty array when no rules found', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findByGroupId('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByPlatform', () => {
    it('returns rules for given platform', async () => {
      stmt.all.mockReturnValue([mockRule]);

      const result = await repo.findByPlatform('douyin');

      expect(result).toEqual([mockRule]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform')
      );
    });
  });

  describe('findEnabledByGroup', () => {
    it('returns enabled rules for given group', async () => {
      stmt.all.mockReturnValue([mockRule]);

      const result = await repo.findEnabledByGroup('group-1');

      expect(result).toEqual([mockRule]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM group_publish_rules WHERE group_id = ? AND enabled = 1'
      );
      expect(stmt.all).toHaveBeenCalledWith('group-1');
    });

    it('returns empty array when no enabled rules', async () => {
      stmt.all.mockReturnValue([]);

      const result = await repo.findEnabledByGroup('group-1');

      expect(result).toEqual([]);
    });
  });

  describe('setEnabled', () => {
    it('enables rule when enabled is true', async () => {
      const updated = { ...mockRule, enabled: 1 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.setEnabled('rule-1', true);

      expect(result.enabled).toBe(1);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: 1, id: 'rule-1' })
      );
    });

    it('disables rule when enabled is false', async () => {
      const updated = { ...mockRule, enabled: 0 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.setEnabled('rule-1', false);

      expect(result.enabled).toBe(0);
      expect(runStmt.run).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: 0, id: 'rule-1' })
      );
    });
  });

  describe('findById', () => {
    it('returns rule when found', async () => {
      stmt.get.mockReturnValue(mockRule);

      const result = await repo.findById('rule-1');

      expect(result).toEqual(mockRule);
    });
  });

  describe('insert', () => {
    it('inserts new rule', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockRule) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'rule-1',
        group_id: 'group-1',
        platform: 'douyin',
        publish_interval_min: 60,
        daily_limit: 5,
        time_slots: '09:00-12:00,14:00-18:00',
        publish_mode: 'client_direct',
        enabled: 1,
      });

      expect(result).toEqual(mockRule);
    });
  });

  describe('deleteById', () => {
    it('deletes rule by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('rule-1');

      expect(result).toBe(true);
    });
  });
});
