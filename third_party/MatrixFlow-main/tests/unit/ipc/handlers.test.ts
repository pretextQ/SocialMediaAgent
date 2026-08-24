import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

const eventBusSubscribe = vi.fn();
const eventBusGetInstance = vi.fn(() => ({ subscribe: eventBusSubscribe }));

vi.mock('@electron/core/EventBus', () => ({
  EventBus: { getInstance: eventBusGetInstance },
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

const mockAccountService = {
  getAllAccounts: vi.fn().mockResolvedValue([]),
  bindAccount: vi.fn().mockResolvedValue({ id: 'acc-1', platform: 'douyin' }),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
  validateCookie: vi.fn().mockResolvedValue(true),
  refreshCookie: vi.fn().mockResolvedValue(true),
  getAccount: vi.fn().mockResolvedValue(null),
  setFingerprint: vi.fn().mockResolvedValue(undefined),
  setProxy: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@electron/services/AccountService', () => ({
  accountService: mockAccountService,
}));

const mockStartAccountLogin = vi.fn().mockResolvedValue({
  success: true,
  status: 'online',
  accountId: 'acc-1',
  platform: 'xiaohongshu',
});

vi.mock('@electron/services/ipc-handlers', () => ({
  startAccountLogin: mockStartAccountLogin,
}));

const mockPublishService = {
  createPublishTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  cancelPublish: vi.fn().mockResolvedValue(undefined),
  getTaskStatus: vi.fn().mockResolvedValue({ taskId: 'task-1', status: 'pending' }),
  getContentTasks: vi.fn().mockResolvedValue([]),
  listTasks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  executeNow: vi.fn().mockResolvedValue({ success: true }),
  retryTask: vi.fn().mockResolvedValue({ success: true }),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  preCheckAccounts: vi.fn().mockResolvedValue({ valid: true }),
  getPublishHistory: vi.fn().mockResolvedValue([]),
};

vi.mock('@electron/services/PublishService', () => ({
  publishService: mockPublishService,
}));

const mockContentService = {
  getAllContents: vi.fn().mockResolvedValue([]),
  getContent: vi.fn().mockResolvedValue({ id: 'content-1' }),
  importContent: vi.fn().mockResolvedValue({ id: 'content-1' }),
  deleteContent: vi.fn().mockResolvedValue(undefined),
  updateContent: vi.fn().mockResolvedValue({ id: 'content-1' }),
};

vi.mock('@electron/services/ContentService', () => ({
  contentService: mockContentService,
}));

const mockMaterialService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getMaterial: vi.fn().mockResolvedValue(null),
};

vi.mock('@electron/services/MaterialService', () => ({
  materialService: mockMaterialService,
}));

const mockGroupService = {
  getAllGroups: vi.fn().mockResolvedValue([]),
  createGroup: vi.fn().mockResolvedValue({ id: 'grp-1' }),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
  addAccountsToGroup: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@electron/services/GroupService', () => ({
  groupService: mockGroupService,
}));

const mockStatsService = {
  getOverviewStats: vi.fn().mockResolvedValue({ total: 0 }),
  fetchPlatformStats: vi.fn().mockResolvedValue({}),
  getTrendData: vi.fn().mockResolvedValue([]),
};

vi.mock('@electron/services/StatsService', () => ({
  statsService: mockStatsService,
}));

const mockGetDatabase = vi.fn(() => ({
  prepare: vi.fn(() => ({ get: vi.fn(() => ({ value: 'test' })), run: vi.fn() })),
}));
const mockCreateBackup = vi.fn().mockResolvedValue({ id: 'bk-1', path: '/tmp/backup.db' });
const mockListBackups = vi.fn().mockResolvedValue([]);
const mockRestoreBackup = vi.fn();
const mockDeleteBackup = vi.fn();
const mockClearData = vi.fn();

vi.mock('@electron/data/Database', () => ({
  getDatabase: mockGetDatabase,
  createBackup: mockCreateBackup,
  listBackups: mockListBackups,
  restoreBackup: mockRestoreBackup,
  deleteBackup: mockDeleteBackup,
  clearData: mockClearData,
}));

const mockAIService = {
  prePublishCheck: vi.fn().mockResolvedValue({ suggestions: [], checks: {} }),
  optimizeRule: vi.fn().mockResolvedValue({ suggestions: [] }),
  getCostSummary: vi.fn().mockReturnValue({ totalCost: 0, totalTokens: 0, records: [] }),
};

vi.mock('@electron/ai/AIService', () => ({
  getAIService: () => mockAIService,
}));

const mockAnomalyService = {
  getAlertsByAccount: vi.fn().mockReturnValue([]),
  getActiveAlerts: vi.fn().mockReturnValue([]),
  dismissAlert: vi.fn().mockReturnValue(true),
};

vi.mock('@electron/services/AnomalyService', () => ({
  anomalyService: mockAnomalyService,
}));

const mockMonitorService = {
  createPlan: vi.fn().mockReturnValue({ id: 'plan-1' }),
  updatePlan: vi.fn().mockReturnValue(true),
  deletePlan: vi.fn().mockReturnValue(true),
  getAllPlans: vi.fn().mockReturnValue([]),
  getActiveAlerts: vi.fn().mockReturnValue([]),
};

vi.mock('@electron/services/MonitorService', () => ({
  monitorService: mockMonitorService,
}));

const mockWeeklyReportService = {
  generateReport: vi.fn().mockResolvedValue({ id: 'report-1' }),
  getLatestReport: vi.fn().mockResolvedValue(null),
};

vi.mock('@electron/services/WeeklyReportService', () => ({
  weeklyReportService: mockWeeklyReportService,
}));

const mockMultiPanelService = {
  openPanel: vi.fn().mockResolvedValue({ id: 'panel-1' }),
  closePanel: vi.fn(),
  focusPanel: vi.fn(),
  getActivePanels: vi.fn().mockReturnValue([]),
};

vi.mock('@electron/services/MultiPanelService', () => ({
  multiPanelService: mockMultiPanelService,
}));

const mockEmbeddedView = {
  webContents: {
    loadURL: vi.fn().mockResolvedValue(undefined),
  },
};

const mockBrowserManager = {
  hasTab: vi.fn().mockReturnValue(false),
  hasStandaloneTab: vi.fn().mockReturnValue(false),
  getView: vi.fn().mockReturnValue(null),
  switchTab: vi.fn(),
  closeTab: vi.fn().mockResolvedValue(undefined),
  createTab: vi.fn().mockResolvedValue(mockEmbeddedView),
  layoutEmbeddedToMainContent: vi.fn(),
};

vi.mock('@electron/services/embedded-browser/browser-manager', () => ({
  browserManager: mockBrowserManager,
}));

const mockDraftService = {
  createDraft: vi.fn().mockReturnValue({ id: 'draft-1' }),
  updateDraft: vi.fn().mockReturnValue({ id: 'draft-1' }),
  saveDraft: vi.fn().mockReturnValue({ id: 'draft-1', title: 'Test', materialId: 'mat-1', status: 'editing', snapshot: {}, sourceDraftId: null, createdAt: new Date(), updatedAt: new Date() }),
  getDraft: vi.fn().mockReturnValue({ id: 'draft-1' }),
  deleteDraft: vi.fn().mockReturnValue(true),
  listDrafts: vi.fn().mockReturnValue([]),
  duplicateDraft: vi.fn().mockReturnValue({ id: 'draft-2' }),
  publishDraft: vi.fn().mockResolvedValue(undefined),
  revokeDraft: vi.fn().mockReturnValue(undefined),
};

vi.mock('@electron/services/DraftService', () => ({
  draftService: mockDraftService,
}));

const mockCommentService = {
  createTemplate: vi.fn().mockReturnValue({ id: 'tpl-1' }),
  updateTemplate: vi.fn().mockReturnValue({ id: 'tpl-1' }),
  deleteTemplate: vi.fn().mockReturnValue(true),
  listTemplates: vi.fn().mockReturnValue([]),
  scheduleComment: vi.fn().mockResolvedValue({ id: 'ct-1' }),
  executeComment: vi.fn().mockResolvedValue(true),
};

vi.mock('@electron/services/CommentService', () => ({
  commentService: mockCommentService,
}));

const mockLicenseService = {
  validateLicense: vi.fn().mockReturnValue(true),
  getLicense: vi.fn().mockReturnValue({ key: 'test' }),
  activateLicense: vi.fn().mockResolvedValue({ success: true }),
  activateOffline: vi.fn().mockResolvedValue({ success: true }),
  generateOfflineRequest: vi.fn().mockReturnValue('/tmp/request.txt'),
  deactivate: vi.fn(),
};

vi.mock('@electron/services/LicenseService', () => ({
  licenseService: mockLicenseService,
}));

const mockProxyService = {
  getAllProxies: vi.fn().mockResolvedValue([]),
  getProxyById: vi.fn().mockResolvedValue({ id: 'proxy-1' }),
  createProxy: vi.fn().mockResolvedValue({ id: 'proxy-1' }),
  updateProxy: vi.fn().mockResolvedValue({ id: 'proxy-1' }),
  deleteProxy: vi.fn().mockResolvedValue(undefined),
  checkProxy: vi.fn().mockResolvedValue({ ok: true }),
};

vi.mock('@electron/services/ProxyService', () => ({
  proxyService: mockProxyService,
}));

const mockFingerprintTemplateRepo = {
  findAll: vi.fn().mockResolvedValue({ data: [] }),
  findById: vi.fn().mockResolvedValue({ id: 'fp-1' }),
  insert: vi.fn().mockResolvedValue({ id: 'fp-1' }),
  update: vi.fn().mockResolvedValue({ id: 'fp-1' }),
  deleteById: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@electron/data/repositories/FingerprintTemplateRepository', () => ({
  fingerprintTemplateRepo: mockFingerprintTemplateRepo,
}));

const mockAutoUpdaterService = {
  checkForUpdates: vi.fn().mockResolvedValue({ available: false }),
  downloadUpdate: vi.fn().mockResolvedValue(undefined),
  installUpdate: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue({ status: 'idle' }),
};

vi.mock('@electron/core/AutoUpdater', () => ({
  autoUpdaterService: mockAutoUpdaterService,
}));

const mockNotificationService = {
  getPreferences: vi.fn().mockReturnValue({}),
  updatePreferences: vi.fn().mockReturnValue({}),
  sendTest: vi.fn(),
};

vi.mock('@electron/core/NotificationService', () => ({
  notificationService: mockNotificationService,
}));

const mockAdapter = {
  platformId: 'douyin',
  config: { platformId: 'douyin', name: '抖音' },
  capabilities: { canSchedule: true, coverRatios: ['16:9', '9:16'] },
  login: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  getQRCode: vi.fn().mockResolvedValue('/tmp/qr.png'),
};

vi.mock('@electron/platform/base/PlatformRegistry', () => ({
  PlatformRegistry: {
    getAllAdapters: () => [mockAdapter],
    getAdapter: (id: string) => (id === 'douyin' ? mockAdapter : undefined),
    getSupportedPlatforms: () => ['douyin', 'xiaohongshu', 'channels', 'kuaishou', 'bilibili'],
  },
}));

const mockElectron = await import('electron');
const ipcMainHandle = mockElectron.ipcMain.handle as ReturnType<typeof vi.fn>;

const fakeEvent = {} as IpcMainInvokeEvent;

async function getHandler(channel: string): Promise<(...args: unknown[]) => Promise<unknown>> {
  const calls = ipcMainHandle.mock.calls;
  for (const [ch, handler] of calls) {
    if (ch === channel) return handler;
  }
  throw new Error(`No handler registered for channel: ${channel}`);
}

describe('IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMainHandle.mockClear();
  });

  describe('registerIpcHandlers', () => {
    it('registers handlers for all expected channels', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();

      expect(ipcMainHandle).toHaveBeenCalled();
      const registeredChannels = ipcMainHandle.mock.calls.map(([ch]: [string]) => ch);

      const expectedChannels = [
        'account:list', 'account:add', 'account:remove', 'account:validate',
        'publish:submit', 'publish:cancel', 'publish:status',
        'task:list', 'task:retry',
        'platform:list', 'platform:login',
        'content:list', 'content:create', 'content:delete', 'content:update', 'content:uploadVideo',
        'groups:list', 'groups:create', 'groups:update', 'groups:delete', 'groups:bindAccounts',
        'stats:overview', 'stats:platform', 'stats:trend',
        'ai:prePublishCheck', 'ai:optimizeRule', 'ai:getCostSummary', 'ai:getAlerts', 'ai:dismissAlert',
        'panel:open', 'panel:close', 'panel:focus', 'panel:list',
        'draft:save', 'draft:get', 'draft:delete', 'draft:list', 'draft:publish', 'draft:revoke',
        'comment:template:create', 'comment:template:update', 'comment:template:delete', 'comment:template:list',
        'comment:schedule', 'comment:execute', 'comment:task:list',
        'license:status', 'license:activate', 'license:activate:offline', 'license:offline:request', 'license:deactivate',
        'update:check', 'update:download', 'update:install', 'update:getStatus',
        'data:createBackup', 'data:listBackups', 'data:restoreBackup', 'data:deleteBackup', 'data:clear',
        'notification:getPreferences', 'notification:updatePreferences', 'notification:test',
      ];

      for (const ch of expectedChannels) {
        expect(registeredChannels).toContain(ch);
      }
    });

    it('subscribes to EventBus for publish events', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();

      expect(eventBusGetInstance).toHaveBeenCalled();
      expect(eventBusSubscribe).toHaveBeenCalled();
    });
  });

  describe('account:* channels', () => {
    it('account:list returns all accounts', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:list');

      const result = await handler(fakeEvent);
      expect(result).toEqual({ success: true, data: [] });
      expect(mockAccountService.getAllAccounts).toHaveBeenCalled();
    });

    it('account:add binds account with platform and groupId', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:add');

      const result = await handler(fakeEvent, 'douyin', 'grp-1');
      expect(result.success).toBe(true);
      expect(mockAccountService.bindAccount).toHaveBeenCalledWith('douyin', 'grp-1');
    });

    it('account:remove deletes account', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:remove');

      const result = await handler(fakeEvent, 'acc-1');
      expect(result.success).toBe(true);
      expect(mockAccountService.deleteAccount).toHaveBeenCalledWith('acc-1');
    });

    it('account:validate validates cookie', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:validate');

      const result = await handler(fakeEvent, 'acc-1');
      expect(result).toEqual({ success: true, data: true });
      expect(mockAccountService.validateCookie).toHaveBeenCalledWith('acc-1');
    });

    it('accounts:login reuses the account persistent browser mode', async () => {
      const prepare = vi.fn(() => ({
        get: vi.fn(() => ({ platform: 'xiaohongshu', browser_mode: 'embedded' })),
        run: vi.fn(),
      }));
      mockGetDatabase.mockReturnValueOnce({ prepare });

      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('accounts:login');

      const result = await handler(fakeEvent, 'acc-1');

      expect(result).toEqual({ success: true });
      expect(mockStartAccountLogin).toHaveBeenCalledWith({
        platform: 'xiaohongshu',
        browserConfig: { type: 'embedded' },
        existingAccountId: 'acc-1',
      });
      expect(mockAccountService.refreshCookie).not.toHaveBeenCalled();
    });

    it('account:openBrowser opens embedded homepage in standalone browser window', async () => {
      const url = 'https://cp.kuaishou.com/article/publish/video';
      const prepare = vi.fn(() => ({
        get: vi.fn(() => ({ platform: 'kuaishou', browser_mode: 'embedded', fingerprint_id: null })),
        run: vi.fn(),
      }));
      mockGetDatabase.mockReturnValueOnce({ prepare });
      mockBrowserManager.hasTab.mockReturnValueOnce(false);

      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:openBrowser');

      const result = await handler(fakeEvent, 'acc-1', url);
      expect(result.success).toBe(true);
      expect(mockBrowserManager.createTab).toHaveBeenCalledWith('acc-1', 'kuaishou', url);
      expect(mockMultiPanelService.openPanel).not.toHaveBeenCalled();
      expect(mockBrowserManager.layoutEmbeddedToMainContent).not.toHaveBeenCalled();
    });

    it('account:openBrowser focuses existing standalone browser window', async () => {
      const url = 'https://creator.douyin.com';
      const prepare = vi.fn(() => ({
        get: vi.fn(() => ({ platform: 'douyin', browser_mode: 'embedded', fingerprint_id: null })),
        run: vi.fn(),
      }));
      mockGetDatabase.mockReturnValueOnce({ prepare });
      mockBrowserManager.hasTab.mockReturnValueOnce(true).mockReturnValueOnce(true);
      mockBrowserManager.hasStandaloneTab.mockReturnValueOnce(true);
      mockBrowserManager.getView.mockReturnValueOnce(mockEmbeddedView);

      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:openBrowser');

      const result = await handler(fakeEvent, 'acc-1', url);
      expect(result.success).toBe(true);
      expect(mockEmbeddedView.webContents.loadURL).toHaveBeenCalledWith(url);
      expect(mockBrowserManager.switchTab).toHaveBeenCalledWith('acc-1');
      expect(mockBrowserManager.createTab).not.toHaveBeenCalled();
      expect(mockMultiPanelService.openPanel).not.toHaveBeenCalled();
    });

    it('account:add returns failure on service error', async () => {
      mockAccountService.bindAccount.mockRejectedValueOnce(new Error('login failed'));
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('account:add');

      const result = await handler(fakeEvent, 'douyin');
      expect(result.success).toBe(false);
      expect(result.message).toContain('login failed');
    });
  });

  describe('publish:* channels', () => {
    it('publish:submit creates a publish task', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:submit');

      const result = await handler(fakeEvent, { contentId: 'c-1', accountIds: ['a-1'] });
      expect(result.success).toBe(true);
      expect(mockPublishService.createPublishTask).toHaveBeenCalled();
    });

    it('publish:cancel cancels a task', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:cancel');

      const result = await handler(fakeEvent, 'task-1');
      expect(result.success).toBe(true);
      expect(mockPublishService.cancelPublish).toHaveBeenCalledWith('task-1');
    });

    it('publish:status returns task status', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:status');

      const result = await handler(fakeEvent, 'task-1');
      expect(result.success).toBe(true);
      expect(mockPublishService.getTaskStatus).toHaveBeenCalledWith('task-1');
    });

    it('publish:retryTask returns actual execution result', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      mockPublishService.retryTask.mockResolvedValueOnce({ success: true, videoId: 'v-1' });
      const handler = await getHandler('publish:retryTask');

      const result = await handler(fakeEvent, 'task-1');
      expect(result).toEqual({ success: true, data: { success: true, videoId: 'v-1' } });
      expect(mockPublishService.retryTask).toHaveBeenCalledWith('task-1');
    });

    it('publish:retryTask returns failure when execution fails', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      mockPublishService.retryTask.mockResolvedValueOnce({ success: false, error: '视频发布失败' });
      const handler = await getHandler('publish:retryTask');

      const result = await handler(fakeEvent, 'task-1');
      expect(result).toEqual({
        success: false,
        data: { success: false, error: '视频发布失败' },
        message: '视频发布失败',
      });
    });

    it('publish:createTask converts string scheduledAt to Date', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:createTask');

      const isoString = '2026-05-28T10:00:00.000Z';
      const result = await handler(fakeEvent, {
        contentId: 'mat-1',
        accountId: 'acc-1',
        platform: 'douyin',
        scheduledAt: isoString,
        publishMode: 'client',
        metadata: { title: 'Test' },
      });
      expect(result.success).toBe(true);
      expect(mockPublishService.createPublishTask).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: expect.any(Date) }),
      );
    });

    it('publish:createTask works without scheduledAt', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:createTask');

      const result = await handler(fakeEvent, {
        contentId: 'mat-1',
        accountId: 'acc-1',
        platform: 'douyin',
        publishMode: 'client',
        metadata: { title: 'Test' },
      });
      expect(result.success).toBe(true);
      expect(mockPublishService.createPublishTask).toHaveBeenCalled();
    });

    it('publish:listTasks returns items with total', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      mockPublishService.listTasks.mockResolvedValue({ items: [{ id: 't-1' }], total: 1 });
      const handler = await getHandler('publish:listTasks');

      const result = await handler(fakeEvent);
      expect(mockPublishService.listTasks).toHaveBeenCalledWith({});
      expect(result).toEqual({ items: [{ id: 't-1' }], total: 1 });
    });

    it('publish:listTasks uses listTasks when filter provided', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      mockPublishService.listTasks.mockResolvedValue({ items: [], total: 0 });
      const handler = await getHandler('publish:listTasks');

      const result = await handler(fakeEvent, { status: ['pending'], platform: ['douyin'] });
      expect(mockPublishService.listTasks).toHaveBeenCalledWith({ status: ['pending'], platform: ['douyin'] });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('task:* channels', () => {
    it('task:list returns content tasks', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('task:list');

      const result = await handler(fakeEvent, 'content-1');
      expect(result.success).toBe(true);
      expect(mockPublishService.getContentTasks).toHaveBeenCalledWith('content-1');
    });

    it('task:retry executes task immediately', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('task:retry');

      const result = await handler(fakeEvent, 'task-1');
      expect(result.success).toBe(true);
      expect(mockPublishService.executeNow).toHaveBeenCalledWith('task-1');
    });
  });

  describe('platform:* channels', () => {
    it('platform:list returns platform infos', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('platform:list');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].platformId).toBe('douyin');
    });

    it('platform:login succeeds for valid account', async () => {
      mockAccountService.getAccount.mockResolvedValueOnce({ id: 'acc-1', platform: 'douyin' });
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('platform:login');

      const result = await handler(fakeEvent, 'acc-1');
      expect(result.success).toBe(true);
      expect(mockAdapter.login).toHaveBeenCalledWith(
        'acc-1',
        false,
        expect.objectContaining({ force: true })
      );
    });

    it('platform:login fails for missing account', async () => {
      mockAccountService.getAccount.mockResolvedValueOnce(null);
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('platform:login');

      const result = await handler(fakeEvent, 'acc-unknown');
      expect(result.success).toBe(false);
      expect(result.message).toContain('账号不存在');
    });
  });

  describe('content:* channels', () => {
    it('content:list returns all contents', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('content:list');

      const result = await handler(fakeEvent);
      expect(result).toEqual([]);
      expect(mockContentService.getAllContents).toHaveBeenCalled();
    });

    it('content:create imports content', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('content:create');

      const result = await handler(fakeEvent, { filePath: '/tmp/video.mp4' });
      expect(result.success).toBe(true);
      expect(mockContentService.importContent).toHaveBeenCalledWith('/tmp/video.mp4');
    });

    it('content:delete removes content', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('content:delete');

      const result = await handler(fakeEvent, 'c-1');
      expect(result.success).toBe(true);
      expect(mockContentService.deleteContent).toHaveBeenCalledWith('c-1');
    });

    it('content:update updates content', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('content:update');

      const result = await handler(fakeEvent, 'c-1', { title: 'new' });
      expect(result.success).toBe(true);
      expect(mockContentService.updateContent).toHaveBeenCalledWith('c-1', { title: 'new' });
    });
  });

  describe('groups:* channels', () => {
    it('groups:list returns all groups', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('groups:list');

      const result = await handler(fakeEvent);
      expect(result).toEqual([]);
      expect(mockGroupService.getAllGroups).toHaveBeenCalled();
    });

    it('groups:create creates a group', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('groups:create');

      const result = await handler(fakeEvent, { name: 'Test Group', description: 'desc', color: '#fff' });
      expect(result.success).toBe(true);
      expect(mockGroupService.createGroup).toHaveBeenCalledWith('Test Group', 'desc', '#fff');
    });

    it('groups:delete deletes a group', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('groups:delete');

      const result = await handler(fakeEvent, 'grp-1');
      expect(result.success).toBe(true);
      expect(mockGroupService.deleteGroup).toHaveBeenCalledWith('grp-1');
    });
  });

  describe('stats:* channels', () => {
    it('stats:overview returns overview stats', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('stats:overview');

      const result = await handler(fakeEvent, { range: 'week' });
      expect(result).toEqual({ total: 0 });
      expect(mockStatsService.getOverviewStats).toHaveBeenCalled();
    });

    it('stats:overview returns null on error', async () => {
      mockStatsService.getOverviewStats.mockRejectedValueOnce(new Error('db error'));
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('stats:overview');

      const result = await handler(fakeEvent, { range: 'today' });
      expect(result).toBeNull();
    });

    it('stats:platform returns platform stats', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('stats:platform');

      const result = await handler(fakeEvent, { platform: 'douyin', range: 'month' });
      expect(result).toEqual({});
      expect(mockStatsService.fetchPlatformStats).toHaveBeenCalledWith('douyin', expect.any(Object));
    });

    it('stats:trend returns trend data', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('stats:trend');

      const result = await handler(fakeEvent, { metric: 'play_count', range: 'week' });
      expect(result).toEqual([]);
      expect(mockStatsService.getTrendData).toHaveBeenCalledWith('play_count', expect.any(Object));
    });
  });

  describe('ai:* channels', () => {
    it('ai:prePublishCheck returns AI suggestions', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('ai:prePublishCheck');

      const result = await handler(fakeEvent, { groupId: 'g-1', groupName: 'test', contentIds: [], accounts: [] });
      expect(result.suggestions).toEqual([]);
      expect(mockAIService.prePublishCheck).toHaveBeenCalled();
    });

    it('ai:prePublishCheck returns fallback on error', async () => {
      mockAIService.prePublishCheck.mockRejectedValueOnce(new Error('LLM error'));
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('ai:prePublishCheck');

      const result = await handler(fakeEvent, { groupId: 'g-1', groupName: 'test', contentIds: [], accounts: [] });
      expect(result.suggestions).toEqual([]);
      expect(result.checks.scheduleReasonable).toBe(true);
    });

    it('ai:getCostSummary returns cost summary', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('ai:getCostSummary');

      const result = await handler(fakeEvent);
      expect(result.totalCost).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('ai:getAlerts returns alerts for account when provided', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('ai:getAlerts');

      const result = await handler(fakeEvent, 'acc-1');
      expect(mockAnomalyService.getAlertsByAccount).toHaveBeenCalledWith('acc-1');
    });

    it('ai:getAlerts returns active alerts when no account provided', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('ai:getAlerts');

      const result = await handler(fakeEvent);
      expect(mockAnomalyService.getActiveAlerts).toHaveBeenCalled();
    });

    it('ai:dismissAlert dismisses alert', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('ai:dismissAlert');

      const result = await handler(fakeEvent, 'alert-1');
      expect(result).toBe(true);
      expect(mockAnomalyService.dismissAlert).toHaveBeenCalledWith('alert-1');
    });
  });

  describe('panel:* channels', () => {
    it('panel:open opens panel for account', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('panel:open');

      const result = await handler(fakeEvent, { accountId: 'acc-1' });
      expect(result.success).toBe(true);
      expect(mockMultiPanelService.openPanel).toHaveBeenCalledWith('acc-1');
    });

    it('panel:close closes panel', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('panel:close');

      const result = await handler(fakeEvent, { panelId: 'panel-1' });
      expect(result.success).toBe(true);
      expect(mockMultiPanelService.closePanel).toHaveBeenCalledWith('panel-1');
    });

    it('panel:list returns active panels', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('panel:list');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockMultiPanelService.getActivePanels).toHaveBeenCalled();
    });
  });

  describe('draft:* channels', () => {
    it('draft:save saves snapshot and returns draft with id', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:save');

      const snapshot = { materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: 'Test', platformConfigs: [] };
      const result = await handler(fakeEvent, { snapshot });
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(mockDraftService.saveDraft).toHaveBeenCalledWith(snapshot, undefined);
    });

    it('draft:save passes existingId for update', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:save');

      const snapshot = { materialId: 'mat-1', materialPath: '/tmp/v.mp4', title: 'Updated', platformConfigs: [] };
      const result = await handler(fakeEvent, { snapshot, existingId: 'draft-existing' });
      expect(result.success).toBe(true);
      expect(mockDraftService.saveDraft).toHaveBeenCalledWith(snapshot, 'draft-existing');
    });

    it('draft:get returns a draft', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:get');

      const result = await handler(fakeEvent, { id: 'draft-1' });
      expect(result.success).toBe(true);
      expect(mockDraftService.getDraft).toHaveBeenCalledWith('draft-1');
    });

    it('draft:delete deletes a draft', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:delete');

      const result = await handler(fakeEvent, { id: 'draft-1' });
      expect(result.success).toBe(true);
      expect(mockDraftService.deleteDraft).toHaveBeenCalledWith('draft-1');
    });

    it('draft:list lists drafts with filter', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:list');

      const result = await handler(fakeEvent, { filter: { status: 'editing' } });
      expect(result.success).toBe(true);
      expect(mockDraftService.listDrafts).toHaveBeenCalledWith({ status: 'editing' });
    });

    it('draft:publish publishes a draft', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:publish');

      const result = await handler(fakeEvent, { id: 'draft-1' });
      expect(result.success).toBe(true);
      expect(mockDraftService.publishDraft).toHaveBeenCalledWith('draft-1');
    });

    it('draft:revoke revokes a draft', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('draft:revoke');

      const result = await handler(fakeEvent, { id: 'draft-1' });
      expect(result.success).toBe(true);
      expect(mockDraftService.revokeDraft).toHaveBeenCalledWith('draft-1');
    });
  });

  describe('comment:* channels', () => {
    it('comment:template:create creates a template', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('comment:template:create');

      const result = await handler(fakeEvent, { text: 'Great video!' });
      expect(result.success).toBe(true);
      expect(mockCommentService.createTemplate).toHaveBeenCalledWith({ text: 'Great video!' });
    });

    it('comment:template:list lists templates', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('comment:template:list');

      const result = await handler(fakeEvent, { platform: 'douyin' });
      expect(result.success).toBe(true);
      expect(mockCommentService.listTemplates).toHaveBeenCalledWith('douyin');
    });

    it('comment:schedule schedules a comment', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('comment:schedule');

      const result = await handler(fakeEvent, { templateId: 'tpl-1', accountId: 'acc-1', videoId: 'vid-1' });
      expect(result.success).toBe(true);
    });

    it('comment:execute executes a comment', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('comment:execute');

      const result = await handler(fakeEvent, { taskId: 'ct-1' });
      expect(result.success).toBe(true);
      expect(mockCommentService.executeComment).toHaveBeenCalledWith('ct-1');
    });
  });

  describe('license:* channels', () => {
    it('license:status returns validation status', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('license:status');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(true);
      expect(result.data.license).toEqual({ key: 'test' });
    });

    it('license:activate activates license', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('license:activate');

      const result = await handler(fakeEvent, { key: 'KEY-123', email: 'test@test.com' });
      expect(result.success).toBe(true);
      expect(mockLicenseService.activateLicense).toHaveBeenCalledWith('KEY-123', 'test@test.com');
    });

    it('license:deactivate deactivates license', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('license:deactivate');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockLicenseService.deactivate).toHaveBeenCalled();
    });
  });

  describe('update:* channels', () => {
    it('update:check checks for updates', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('update:check');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockAutoUpdaterService.checkForUpdates).toHaveBeenCalled();
    });

    it('update:download downloads update', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('update:download');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockAutoUpdaterService.downloadUpdate).toHaveBeenCalled();
    });

    it('update:getStatus returns current status', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('update:getStatus');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('idle');
    });
  });

  describe('data:* channels', () => {
    it('data:createBackup creates a backup', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('data:createBackup');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockCreateBackup).toHaveBeenCalled();
    });

    it('data:listBackups lists all backups', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('data:listBackups');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockListBackups).toHaveBeenCalled();
    });

    it('data:restoreBackup restores a backup', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('data:restoreBackup');

      const result = await handler(fakeEvent, 'bk-1');
      expect(result.success).toBe(true);
      expect(mockRestoreBackup).toHaveBeenCalledWith('bk-1');
    });

    it('data:deleteBackup deletes a backup', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('data:deleteBackup');

      const result = await handler(fakeEvent, 'bk-1');
      expect(result.success).toBe(true);
      expect(mockDeleteBackup).toHaveBeenCalledWith('bk-1');
    });

    it('data:clear clears data by type', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('data:clear');

      const result = await handler(fakeEvent, 'logs');
      expect(result.success).toBe(true);
      expect(mockClearData).toHaveBeenCalledWith('logs');
    });
  });

  describe('notification:* channels', () => {
    it('notification:getPreferences returns preferences', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('notification:getPreferences');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockNotificationService.getPreferences).toHaveBeenCalled();
    });

    it('notification:updatePreferences updates preferences', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('notification:updatePreferences');

      const result = await handler(fakeEvent, { email: true });
      expect(result.success).toBe(true);
      expect(mockNotificationService.updatePreferences).toHaveBeenCalledWith({ email: true });
    });

    it('notification:test sends test notification', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('notification:test');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockNotificationService.sendTest).toHaveBeenCalled();
    });
  });

  describe('proxy:* channels', () => {
    it('proxy:list returns all proxies', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('proxy:list');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockProxyService.getAllProxies).toHaveBeenCalled();
    });

    it('proxy:create creates a proxy', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('proxy:create');

      const result = await handler(fakeEvent, { name: 'P1', protocol: 'http', host: 'localhost', port: 8080 });
      expect(result.success).toBe(true);
      expect(mockProxyService.createProxy).toHaveBeenCalled();
    });

    it('proxy:check checks proxy connectivity', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('proxy:check');

      const result = await handler(fakeEvent, { id: 'proxy-1' });
      expect(result.success).toBe(true);
      expect(mockProxyService.checkProxy).toHaveBeenCalledWith('proxy-1');
    });
  });

  describe('fingerprint:* channels', () => {
    it('fingerprint:list returns all templates', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('fingerprint:list');

      const result = await handler(fakeEvent);
      expect(result.success).toBe(true);
      expect(mockFingerprintTemplateRepo.findAll).toHaveBeenCalled();
    });

    it('fingerprint:create inserts a template', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('fingerprint:create');

      const result = await handler(fakeEvent, { name: 'FP1', config: {} });
      expect(result.success).toBe(true);
      expect(mockFingerprintTemplateRepo.insert).toHaveBeenCalledWith({ name: 'FP1', config: {} });
    });

    it('fingerprint:delete deletes a template', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('fingerprint:delete');

      const result = await handler(fakeEvent, { id: 'fp-1' });
      expect(result.success).toBe(true);
      expect(mockFingerprintTemplateRepo.deleteById).toHaveBeenCalledWith('fp-1');
    });
  });

  describe('settings:* channels', () => {
    it('settings:get returns value from database', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('settings:get');

      const result = await handler(fakeEvent, 'theme');
      expect(result).toBe('test');
      expect(mockGetDatabase).toHaveBeenCalled();
    });

    it('settings:set writes value to database', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('settings:set');

      const result = await handler(fakeEvent, 'theme', 'dark');
      expect(result.success).toBe(true);
    });
  });

  describe('monitor:* channels', () => {
    it('monitor:listPlans returns all plans', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('monitor:listPlans');

      const result = await handler(fakeEvent);
      expect(result).toEqual([]);
      expect(mockMonitorService.getAllPlans).toHaveBeenCalled();
    });

    it('monitor:createPlan creates a plan', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('monitor:createPlan');

      const result = await handler(fakeEvent, { name: 'Plan1', type: 'daily' });
      expect(result).toEqual({ id: 'plan-1' });
      expect(mockMonitorService.createPlan).toHaveBeenCalled();
    });
  });

  describe('report:* channels', () => {
    it('report:generate generates weekly report', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('report:generate');

      const result = await handler(fakeEvent);
      expect(result).toEqual({ id: 'report-1' });
      expect(mockWeeklyReportService.generateReport).toHaveBeenCalled();
    });

    it('report:getLatest returns latest report', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('report:getLatest');

      const result = await handler(fakeEvent);
      expect(result).toBeNull();
      expect(mockWeeklyReportService.getLatestReport).toHaveBeenCalled();
    });
  });

  describe('publish:preCheck and publish:history', () => {
    it('publish:preCheck validates accounts before publishing', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:preCheck');

      const result = await handler(fakeEvent, { accountIds: ['acc-1'], contentId: 'c-1' });
      expect(result.success).toBe(true);
      expect(mockPublishService.preCheckAccounts).toHaveBeenCalled();
    });

    it('publish:history returns publish history', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('publish:history');

      const result = await handler(fakeEvent, { platform: 'douyin' });
      expect(result.success).toBe(true);
      expect(mockPublishService.getPublishHistory).toHaveBeenCalledWith({ platform: 'douyin' });
    });
  });

  describe('platform:coverRatios', () => {
    it('returns cover ratios for known platform', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('platform:coverRatios');

      const result = await handler(fakeEvent, 'douyin');
      expect(result).toEqual(['16:9', '9:16']);
    });

    it('returns empty array for unknown platform', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('platform:coverRatios');

      const result = await handler(fakeEvent, 'unknown');
      expect(result).toEqual([]);
    });
  });

  describe('app info channels', () => {
    it('app:getVersion returns version', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('app:getVersion');

      const result = await handler(fakeEvent);
      expect(typeof result).toBe('string');
    });

    it('app:getBuildDate returns a date string', async () => {
      const { registerIpcHandlers } = await import('@electron/ipc/handlers');
      registerIpcHandlers();
      const handler = await getHandler('app:getBuildDate');

      const result = await handler(fakeEvent);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
