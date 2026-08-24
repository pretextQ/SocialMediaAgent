import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, groupPageAll, taskRowsAll } = vi.hoisted(() => ({
  mockDb: {
    prepare: vi.fn(),
  },
  groupPageAll: vi.fn(),
  taskRowsAll: vi.fn(),
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

vi.mock('@electron/core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emit: vi.fn(),
      broadcast: vi.fn(),
    }),
  },
}));

vi.mock('@electron/core/TaskScheduler', () => ({
  TaskScheduler: {
    getInstance: () => ({
      scheduleAt: vi.fn(),
      cancel: vi.fn(),
    }),
  },
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => true,
}));

vi.mock('@electron/services/AccountService', () => ({
  accountService: {},
}));

vi.mock('@electron/services/MaterialService', () => ({
  materialService: {},
}));

vi.mock('@electron/services/Watchdog', () => ({
  watchdog: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

import { PublishService } from '@electron/services/PublishService';

function makeDbTask(index: number) {
  return {
    id: `task-${index}`,
    content_id: `content-${index}`,
    group_id: null,
    platform: 'channels',
    account_id: `account-${index}`,
    publish_mode: 'client',
    status: 'completed',
    scheduled_at: null,
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    result: null,
    created_at: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    updated_at: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:01:00Z`,
    account_name: `账号${index}`,
    title: `内容${index}`,
  };
}

describe('PublishService.listTasks grouped pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    groupPageAll.mockReturnValue(
      Array.from({ length: 20 }, (_, index) => ({
        content_key: `content:content-${index + 21}`,
      })),
    );
    taskRowsAll.mockReturnValue(
      Array.from({ length: 20 }, (_, index) => makeDbTask(index + 21)),
    );

    mockDb.prepare.mockImplementation((sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('SELECT COUNT(*) as total FROM (')) {
        return { get: vi.fn().mockReturnValue({ total: 40 }) };
      }
      if (normalized.startsWith('SELECT COUNT(*) as total')) {
        return { get: vi.fn().mockReturnValue({ total: 40 }) };
      }
      if (normalized.startsWith('SELECT pt.status')) {
        return {
          all: vi.fn().mockReturnValue([{ status: 'completed', count: 40 }]),
        };
      }
      if (normalized.includes('as content_key') && normalized.includes('latest_created_sort')) {
        return { all: groupPageAll };
      }
      if (normalized.startsWith('SELECT pt.*')) {
        return { all: taskRowsAll };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
  });

  it('paginates by visible content rows and still returns the task total', async () => {
    const service = PublishService.getInstance();
    const result = await service.listTasks({
      groupByContent: true,
      limit: 20,
      offset: 20,
    });

    expect(groupPageAll).toHaveBeenCalledWith(20, 20);
    expect(result.total).toBe(40);
    expect(result.taskTotal).toBe(40);
    expect(result.items).toHaveLength(20);
    expect(result.statusBreakdown).toEqual({ completed: 40 });
    expect(taskRowsAll).toHaveBeenCalledTimes(1);

    const preparedSql = mockDb.prepare.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' '));
    expect(preparedSql.some((sql) =>
      sql.includes('MAX(COALESCE(julianday(pt.created_at), 0)) as latest_created_sort')
      && sql.includes('ORDER BY latest_created_sort DESC, latest_rowid DESC')
    )).toBe(true);
    expect(preparedSql.some((sql) =>
      sql.includes('COALESCE(julianday(pt.created_at), 0) DESC')
      && sql.includes('pt.rowid DESC')
    )).toBe(true);
  });
});
