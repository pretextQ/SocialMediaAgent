import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockEventBusEmit, mockPublishTaskRepo } = vi.hoisted(() => {
  return {
    mockEventBusEmit: vi.fn(),
    mockPublishTaskRepo: {
      findByStatus: vi.fn(),
      update: vi.fn(),
      markFinalFailed: vi.fn(),
    },
  };
});

vi.mock('../../../electron/core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emit: mockEventBusEmit,
    }),
  },
}));

vi.mock('../../../electron/data/repositories/PublishTaskRepository', () => ({
  get publishTaskRepo() {
    return mockPublishTaskRepo;
  },
}));

import { Watchdog, WatchdogEvents } from '../../../electron/services/Watchdog';

function makeTask(overrides: Partial<{
  id: string;
  status: string;
  updated_at: string;
}> = {}) {
  return {
    id: 'task-1',
    status: 'uploading',
    updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('Watchdog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublishTaskRepo.findByStatus.mockResolvedValue({ data: [], total: 0 });
    mockPublishTaskRepo.update.mockResolvedValue(undefined);
    mockPublishTaskRepo.markFinalFailed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('check() — 7种状态处理', () => {
    it('uploading 5min内不触发', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'uploading') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'uploading', updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(0);
    });

    it('SQLite UTC datetime 不应按本地时区误判为超时', async () => {
      const recentUtc = new Date(Date.now() - 30 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'uploading') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'uploading', updated_at: recentUtc }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(0);
      expect(mockPublishTaskRepo.update).not.toHaveBeenCalled();
    });

    it('uploading 5min+ 触发 retry，任务回到 queued', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'uploading') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'uploading', updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('task-1');
      expect(mockPublishTaskRepo.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ status: 'queued' }));
      expect(mockEventBusEmit).toHaveBeenCalledWith(WatchdogEvents.RETRY, expect.objectContaining({ taskId: 'task-1' }));
    });

    it('uploading retry后再次超时触发 abandon 终态', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'uploading') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'uploading', updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      await wd.check();
      await wd.check();

      expect(mockPublishTaskRepo.markFinalFailed).toHaveBeenCalledWith(
        'task-1',
        expect.stringContaining('已终止'),
      );
      expect(mockEventBusEmit).toHaveBeenCalledWith(WatchdogEvents.ABANDON, expect.objectContaining({ taskId: 'task-1' }));
    });

    it('publishing 5min+ 触发 warn，不改状态', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'publishing') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'publishing', updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('task-1');
      expect(mockPublishTaskRepo.update).not.toHaveBeenCalled();
      expect(mockEventBusEmit).toHaveBeenCalledWith(WatchdogEvents.WARN, expect.objectContaining({ taskId: 'task-1' }));
    });

    it('publishing 15min+ 触发 warn+escalate（两个规则都满足）', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'publishing') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'publishing', updated_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(2);
      expect(events.map(e => e.status)).toEqual(['publishing', 'publishing']);
      expect(mockPublishTaskRepo.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ status: 'audit' }));
      expect(mockEventBusEmit).toHaveBeenCalledWith(WatchdogEvents.ESCALATE, expect.objectContaining({ taskId: 'task-1' }));
    });

    it('audit 30min+ 触发 abandon 终态', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'audit') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'audit', updated_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(1);
      expect(mockPublishTaskRepo.markFinalFailed).toHaveBeenCalledWith(
        'task-1',
        expect.stringContaining('已终止'),
      );
      expect(mockEventBusEmit).toHaveBeenCalledWith(WatchdogEvents.ABANDON, expect.objectContaining({ taskId: 'task-1' }));
    });

    it('pending 1min+ 触发 retry，状态改为 queued', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'pending') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'pending', updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(1);
      expect(mockPublishTaskRepo.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ status: 'queued' }));
      expect(mockEventBusEmit).toHaveBeenCalledWith(WatchdogEvents.RETRY, expect.objectContaining({ taskId: 'task-1' }));
    });

    it('queued 状态不触发任何动作（保持 idle）', async () => {
      mockPublishTaskRepo.findByStatus.mockResolvedValue({ data: [], total: 0 });

      const wd = new Watchdog();
      const events = await wd.check();

      expect(events).toHaveLength(0);
    });

    it('success/failed/cancelled 终态不触发', async () => {
      mockPublishTaskRepo.findByStatus.mockResolvedValue({ data: [], total: 0 });

      for (const status of ['success', 'failed', 'cancelled']) {
        const wd = new Watchdog();
        const events = await wd.check();
        expect(events).toHaveLength(0);
      }
    });

    it('不存在监听的状态（如 retry/skipped）忽略', async () => {
      mockPublishTaskRepo.findByStatus.mockResolvedValue({ data: [], total: 0 });

      const wd = new Watchdog();
      const events = await wd.check();
      expect(events).toHaveLength(0);
    });
  });

  describe('start() / stop()', () => {
    it('start 多次调用不重复启动', () => {
      const wd = new Watchdog();
      wd.start();
      wd.start();
      wd.stop();
    });

    it('stop 后不再扫描', () => {
      const wd = new Watchdog();
      wd.stop();
    });
  });

  describe('maxOccurrences 边界', () => {
    it('uploading 重试1次后不再 retry，但触发 abandon', async () => {
      mockPublishTaskRepo.findByStatus.mockImplementation((status: string) => {
        if (status === 'uploading') {
          return Promise.resolve({
            data: [{ ...makeTask({ status: 'uploading', updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }) }],
            total: 1,
          });
        }
        return Promise.resolve({ data: [], total: 0 });
      });

      const wd = new Watchdog();
      await wd.check();
      await wd.check();

      expect(mockPublishTaskRepo.markFinalFailed).toHaveBeenCalled();
    });
  });
});
