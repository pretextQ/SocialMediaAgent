import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GroupService } from '@electron/services/GroupService';
import { GroupEvent } from '@electron/services/types/group';
import type { GroupRow, PublishRuleRow, AccountRow } from '@electron/services/types';

vi.mock('@electron/core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }),
  },
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

const mockStmt = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
};

const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: Function) => (...args: unknown[]) => fn(...args)),
};

let dbAvailable = true;

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomBytes: () => Buffer.alloc(4, 'a'),
  };
});

function createGroupRow(overrides?: Partial<GroupRow>): GroupRow {
  return {
    id: 'grp_001',
    name: '测试分组',
    description: '描述',
    color: '#409EFF',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createAccountRow(overrides?: Partial<AccountRow>): AccountRow {
  return {
    id: 'acc-001',
    platform: 'douyin',
    name: '测试账号',
    avatar: null,
    cookie_encrypted: 'enc',
    cookie_valid: 1,
    last_cookie_check: null,
    group_id: 'grp_001',
    fingerprint_id: null,
    proxy_id: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function resetSingleton(): void {
  (GroupService as unknown as { instance: null }).instance = null;
}

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(() => {
    resetSingleton();
    vi.clearAllMocks();
    dbAvailable = true;
    service = GroupService.getInstance();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const a = GroupService.getInstance();
      const b = GroupService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('initializes schema when database available', () => {
      service.initialize();
      expect(mockDb.exec).toHaveBeenCalled();
    });

    it('skips schema when database unavailable', () => {
      dbAvailable = false;
      service.initialize();
      expect(mockDb.exec).not.toHaveBeenCalled();
    });

    it('is idempotent', () => {
      service.initialize();
      const callCount = mockDb.exec.mock.calls.length;
      service.initialize();
      expect(mockDb.exec.mock.calls.length).toBe(callCount);
    });
  });

  describe('dispose', () => {
    it('resets initialized state', () => {
      service.initialize();
      service.dispose();
      service.initialize();
      expect(mockDb.exec).toHaveBeenCalled();
    });
  });

  describe('createGroup', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('creates a group with default color and emits event', async () => {
      const checkNameStmt = { get: vi.fn().mockReturnValue(null) };
      const insertStmt = { run: vi.fn() };
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(checkNameStmt)
        .mockReturnValueOnce(insertStmt)
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      const group = await service.createGroup('测试分组');

      expect(group).not.toBeNull();
      expect(group.id).toBe('grp_001');
      expect(insertStmt.run).toHaveBeenCalledWith(
        expect.any(String),
        '测试分组',
        '',
        '#409EFF',
        expect.any(String),
        expect.any(String),
      );
    });

    it('creates a group with custom color and description', async () => {
      const checkNameStmt = { get: vi.fn().mockReturnValue(null) };
      const insertStmt = { run: vi.fn() };
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(checkNameStmt)
        .mockReturnValueOnce(insertStmt)
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      await service.createGroup('新分组', '描述', '#FF0000');
      expect(insertStmt.run).toHaveBeenCalledWith(
        expect.any(String),
        '新分组',
        '描述',
        '#FF0000',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('updateGroup', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('updates specified fields', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };
      const updateStmt = { run: vi.fn() };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(updateStmt);

      await service.updateGroup('grp_001', { name: '新名字', color: '#00FF00' });

      expect(updateStmt.run).toHaveBeenCalled();
    });

    it('does nothing when no fields to update', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      await service.updateGroup('grp_001', {});
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    });

    it('throws when group does not exist', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      await expect(service.updateGroup('nonexistent', { name: 'x' })).rejects.toThrow('分组不存在');
    });
  });

  describe('deleteGroup', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('deletes empty group and its rules', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };
      const deleteRulesStmt = { run: vi.fn() };
      const deleteGroupStmt = { run: vi.fn() };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(deleteRulesStmt)
        .mockReturnValueOnce(deleteGroupStmt);

      await service.deleteGroup('grp_001');

      expect(deleteRulesStmt.run).toHaveBeenCalledWith('grp_001');
      expect(deleteGroupStmt.run).toHaveBeenCalledWith('grp_001');
    });

    it('throws when group has accounts', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 3 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      await expect(service.deleteGroup('grp_001')).rejects.toThrow('还有 3 个账号');
    });

    it('throws when group does not exist', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      await expect(service.deleteGroup('nonexistent')).rejects.toThrow('分组不存在');
    });
  });

  describe('getGroup', () => {
    it('returns group with account count', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 5 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      const group = await service.getGroup('grp_001');
      expect(group).not.toBeNull();
      expect(group!.accountCount).toBe(5);
      expect(group!.name).toBe('测试分组');
    });

    it('returns null when not found', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      const group = await service.getGroup('nonexistent');
      expect(group).toBeNull();
    });
  });

  describe('getAllGroups', () => {
    it('returns all groups with account counts', async () => {
      const allStmt = { all: vi.fn().mockReturnValue([createGroupRow(), createGroupRow({ id: 'grp_002', name: '分组2' })]) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 2 }) };

      mockDb.prepare
        .mockReturnValueOnce(allStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(countStmt);

      const groups = await service.getAllGroups();
      expect(groups).toHaveLength(2);
      expect(groups[0].accountCount).toBe(2);
    });

    it('returns empty array when no groups', async () => {
      const allStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(allStmt);

      const groups = await service.getAllGroups();
      expect(groups).toHaveLength(0);
    });
  });

  describe('addAccountsToGroup', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('adds accounts to group in transaction', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };
      const updateStmt = { run: vi.fn() };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(updateStmt);

      await service.addAccountsToGroup('grp_001', ['acc-1', 'acc-2']);

      expect(updateStmt.run).toHaveBeenCalledTimes(2);
    });

    it('does nothing when accountIds is empty', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      await service.addAccountsToGroup('grp_001', []);
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    });

    it('throws when group does not exist', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      await expect(service.addAccountsToGroup('nonexistent', ['acc-1'])).rejects.toThrow('分组不存在');
    });
  });

  describe('removeAccountsFromGroup', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('removes accounts from group', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 2 }) };
      const updateStmt = { run: vi.fn() };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(updateStmt);

      await service.removeAccountsFromGroup('grp_001', ['acc-1']);

      expect(updateStmt.run).toHaveBeenCalledWith(expect.any(String), 'acc-1', 'grp_001');
    });

    it('does nothing when accountIds is empty', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      await service.removeAccountsFromGroup('grp_001', []);
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    });

    it('throws when group does not exist', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      await expect(service.removeAccountsFromGroup('nonexistent', ['acc-1'])).rejects.toThrow('分组不存在');
    });
  });

  describe('getGroupAccounts', () => {
    it('returns accounts in group', async () => {
      const allStmt = { all: vi.fn().mockReturnValue([createAccountRow()]) };
      mockDb.prepare.mockReturnValueOnce(allStmt);

      const accounts = await service.getGroupAccounts('grp_001');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].platform).toBe('douyin');
    });
  });

  describe('setPublishRule', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('sets publish rules for multiple platforms', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };
      const deleteRulesStmt = { run: vi.fn() };
      const insertStmt = { run: vi.fn() };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(deleteRulesStmt)
        .mockReturnValueOnce(insertStmt);

      await service.setPublishRule('grp_001', {
        groupId: 'grp_001',
        publishMode: 'client',
        interval: 30,
        platforms: ['douyin', 'xiaohongshu'],
        settings: { douyin: {}, xiaohongshu: {} },
        scheduledTime: { start: '08:00', end: '10:00' },
      });

      expect(deleteRulesStmt.run).toHaveBeenCalledWith('grp_001');
      expect(insertStmt.run).toHaveBeenCalledTimes(2);
    });

    it('throws when group does not exist', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      await expect(
        service.setPublishRule('nonexistent', {
          groupId: 'nonexistent',
          publishMode: 'client',
          interval: 30,
          platforms: ['douyin'],
          settings: {},
        }),
      ).rejects.toThrow('分组不存在');
    });
  });

  describe('getPublishRule', () => {
    it('returns null when no rules found', async () => {
      const allStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(allStmt);

      const rule = await service.getPublishRule('grp_001');
      expect(rule).toBeNull();
    });

    it('returns parsed publish rule', async () => {
      const ruleRow: PublishRuleRow = {
        id: 'rule_001',
        group_id: 'grp_001',
        platform: 'douyin',
        publish_interval_min: 30,
        daily_limit: 10,
        time_slots: JSON.stringify([{ start: '08:00', end: '10:00' }]),
        publish_mode: 'client',
        enabled: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      const allStmt = { all: vi.fn().mockReturnValue([ruleRow]) };
      mockDb.prepare.mockReturnValueOnce(allStmt);

      const rule = await service.getPublishRule('grp_001');
      expect(rule).not.toBeNull();
      expect(rule!.platforms).toContain('douyin');
      expect(rule!.publishMode).toBe('client');
      expect(rule!.interval).toBe(30);
      expect(rule!.scheduledTime).toEqual({ start: '08:00', end: '10:00' });
    });
  });

  describe('getGroupStats', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('returns aggregated stats', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 5 }) };
      const activeStmt = { get: vi.fn().mockReturnValue({ cnt: 3 }) };
      const todayStmt = { get: vi.fn().mockReturnValue({ cnt: 2 }) };
      const weekStmt = { get: vi.fn().mockReturnValue({ cnt: 10 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(activeStmt)
        .mockReturnValueOnce(todayStmt)
        .mockReturnValueOnce(weekStmt);

      const stats = await service.getGroupStats('grp_001');

      expect(stats).toEqual({
        totalAccounts: 5,
        activeAccounts: 3,
        publishedToday: 2,
        publishedThisWeek: 10,
      });
    });

    it('throws when group does not exist', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(null) };
      mockDb.prepare.mockReturnValueOnce(getGroupStmt);

      await expect(service.getGroupStats('nonexistent')).rejects.toThrow('分组不存在');
    });
  });

  describe('database unavailability', () => {
    it('getGroup throws when database unavailable', async () => {
      dbAvailable = false;
      await expect(service.getGroup('any')).rejects.toThrow('数据库不可用');
    });

    it('getAllGroups throws when database unavailable', async () => {
      dbAvailable = false;
      await expect(service.getAllGroups()).rejects.toThrow('数据库不可用');
    });
  });

  describe('rowToGroup mapping', () => {
    it('maps null description to undefined', async () => {
      const row = createGroupRow({ description: null });
      const getGroupStmt = { get: vi.fn().mockReturnValue(row) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      const group = await service.getGroup('grp_001');
      expect(group!.description).toBeUndefined();
    });

    it('uses default color when empty', async () => {
      const row = createGroupRow({ color: '' });
      const getGroupStmt = { get: vi.fn().mockReturnValue(row) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      const group = await service.getGroup('grp_001');
      expect(group!.color).toBe('#409EFF');
    });

    it('maps dates correctly', async () => {
      const getGroupStmt = { get: vi.fn().mockReturnValue(createGroupRow()) };
      const countStmt = { get: vi.fn().mockReturnValue({ cnt: 0 }) };

      mockDb.prepare
        .mockReturnValueOnce(getGroupStmt)
        .mockReturnValueOnce(countStmt);

      const group = await service.getGroup('grp_001');
      expect(group!.createdAt).toBeInstanceOf(Date);
      expect(group!.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('rowToAccount mapping (in GroupService)', () => {
    it('maps account row with null fields', async () => {
      const row = createAccountRow({
        avatar: null,
        group_id: null,
        fingerprint_id: null,
        proxy_id: null,
        last_cookie_check: null,
      });
      const allStmt = { all: vi.fn().mockReturnValue([row]) };
      mockDb.prepare.mockReturnValueOnce(allStmt);

      const accounts = await service.getGroupAccounts('grp_001');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].avatar).toBeUndefined();
      expect(accounts[0].groupId).toBeUndefined();
    });
  });
});
