import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  uploadVideo,
  mockDb,
  mockAccountFindById,
  mockTaskFindById,
  mockFindItems,
  mockPublishTaskUpdate,
  mockPublishTaskMarkCompleted,
  mockPublishTaskMarkFailed,
  mockPublishTaskMarkFinalFailed,
} = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
  mockDb: {
    prepare: vi.fn(),
  },
  mockAccountFindById: vi.fn(),
  mockTaskFindById: vi.fn(),
  mockFindItems: vi.fn(),
  mockPublishTaskUpdate: vi.fn(),
  mockPublishTaskMarkCompleted: vi.fn(),
  mockPublishTaskMarkFailed: vi.fn(),
  mockPublishTaskMarkFinalFailed: vi.fn(),
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
    getInstance: () => ({ emit: vi.fn(), broadcast: vi.fn() }),
  },
}));

vi.mock('@electron/core/TaskScheduler', () => ({
  TaskScheduler: {
    getInstance: () => ({ scheduleAt: vi.fn(), cancel: vi.fn() }),
  },
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => true,
}));

vi.mock('@electron/data/repositories/AccountRepository', () => ({
  accountRepo: {
    findById: mockAccountFindById,
  },
}));

vi.mock('@electron/data/repositories/PublishTaskRepository', () => ({
  publishTaskRepo: {
    findById: mockTaskFindById,
    update: mockPublishTaskUpdate,
    markCompleted: mockPublishTaskMarkCompleted,
    markFailed: mockPublishTaskMarkFailed,
    markFinalFailed: mockPublishTaskMarkFinalFailed,
    insert: vi.fn(),
  },
}));

vi.mock('@electron/data/repositories/TaskItemRepository', () => ({
  taskItemRepo: {
    findByTaskId: mockFindItems,
    insert: vi.fn(),
    markStarted: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock('@electron/data/repositories/GroupPublishRuleRepository', () => ({
  groupPublishRuleRepo: {},
}));

vi.mock('@electron/services/AccountService', () => ({
  accountService: {
    validateCookie: vi.fn().mockResolvedValue(true),
    updateStatus: vi.fn(),
  },
}));

vi.mock('@electron/services/MaterialService', () => ({
  materialService: {
    getMaterial: vi.fn().mockResolvedValue({ filePath: '/tmp/video.mp4' }),
  },
}));

vi.mock('@electron/services/Watchdog', () => ({
  watchdog: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@electron/platform/base/PlatformRegistry', () => ({
  PlatformRegistry: {
    getAdapter: vi.fn(() => ({
      platformId: 'xiaohongshu',
      uploadVideo,
      publish: vi.fn().mockResolvedValue({ success: true }),
    })),
    getSupportedPlatforms: vi.fn(() => ['xiaohongshu']),
  },
}));

import { PublishService } from '@electron/services/PublishService';

function makeTask(tags: string[]) {
  return {
    id: 'task-1',
    content_id: 'content-1',
    platform: 'xiaohongshu',
    account_id: 'account-1',
    publish_mode: 'client',
    status: 'pending',
    scheduled_at: null,
    retry_count: 0,
    max_retries: 3,
    title: '测试标题',
    description: '测试描述',
    tags: JSON.stringify(tags),
    cover_url: null,
    metadata: '{}',
  };
}

describe('PublishService account publish preset tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublishTaskUpdate.mockResolvedValue({});
    mockPublishTaskMarkCompleted.mockResolvedValue({});
    mockPublishTaskMarkFailed.mockImplementation(async (_id: string, error: string) => ({
      ...makeTask(['#原始标签']),
      status: 'failed',
      error_message: error,
      retry_count: 1,
    }));
    mockPublishTaskMarkFinalFailed.mockImplementation(async (_id: string, error: string) => ({
      ...makeTask(['#原始标签']),
      status: 'failed',
      error_message: error,
      retry_count: 1,
    }));
    mockAccountFindById.mockResolvedValue({
      id: 'account-1',
      platform: 'xiaohongshu',
      cookie_valid: 1,
    });
    mockFindItems.mockResolvedValue([{
      id: 'item-1',
      task_id: 'task-1',
      account_id: 'account-1',
      platform: 'xiaohongshu',
      status: 'pending',
    }]);
    uploadVideo.mockResolvedValue({ success: true, message: 'ok', videoId: 'video-1' });

    mockDb.prepare.mockImplementation((sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT browser_mode, fingerprint_id, cookie_path, platform')) {
        return {
          get: vi.fn().mockReturnValue({
            browser_mode: 'embedded',
            fingerprint_id: null,
            cookie_path: '/tmp/cookie.json',
            platform: 'xiaohongshu',
          }),
        };
      }
      if (normalized.startsWith('SELECT value FROM platform_configs')) {
        return { get: vi.fn().mockReturnValue(undefined) };
      }
      if (normalized.startsWith('SELECT default_topics, platform_options, enabled')) {
        return {
          get: vi.fn().mockReturnValue({
            default_topics: JSON.stringify(['#预设话题']),
            platform_options: '{}',
            enabled: 1,
          }),
        };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
  });

  it('原始任务没有标签时，不应用账号预设标签', async () => {
    mockTaskFindById.mockResolvedValue(makeTask([]));

    const result = await PublishService.getInstance().publishFromClient('task-1');
    expect(result.success).toBe(true);

    expect(uploadVideo).toHaveBeenCalledWith(expect.objectContaining({
      tags: [],
    }));
  });

  it('原始任务有标签时，追加账号预设标签并去重', async () => {
    mockTaskFindById.mockResolvedValue(makeTask(['#原始标签', '#预设话题']));

    const result = await PublishService.getInstance().publishFromClient('task-1');
    expect(result.success).toBe(true);

    expect(uploadVideo).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['#原始标签', '#预设话题'],
    }));
  });

  it('executeNow 失败后只标记失败，不自动再次执行', async () => {
    vi.useFakeTimers();
    mockTaskFindById.mockResolvedValue(makeTask(['#原始标签']));
    uploadVideo.mockResolvedValue({ success: false, message: '上传失败' });

    const result = await PublishService.getInstance().executeNow('task-1');

    expect(result.success).toBe(false);
    expect(uploadVideo).toHaveBeenCalledTimes(1);
    expect(mockPublishTaskMarkFailed).not.toHaveBeenCalled();
    expect(mockPublishTaskMarkFinalFailed).toHaveBeenCalledWith('task-1', '上传失败: 上传失败');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(uploadVideo).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
