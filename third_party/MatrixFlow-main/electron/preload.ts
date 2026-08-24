import { contextBridge, ipcRenderer } from 'electron';
import type { IpcResult } from './ipc/handlers';
import type { Account } from './services/types/account';
import type {
  PublishTask,
  PublishResult,
  PublishTaskStatusDetail,
  PublishRequest,
} from './services/types/publish';
import type { PlatformConfig, PlatformCapabilities, CookieResult } from './platform/base/types';
import type { PrePublishContext, PrePublishCheckResult, RuleOptimizationContext, RuleOptimizationResult, CostRecord } from './ai/types';
import type { Material, MaterialGroup, ListQuery, ListResult, BatchDeleteResult } from './services/types/material';

type Invoke<T> = Promise<IpcResult<T>>;

const ALLOWED_CHANNELS = new Set([
  'publish:status',
  'task:progress',
  'task:status-change',
  'account:login-status',
  'account:login-status-updated',
  'account:login-success',
  'account:login-failed',
  'account:login-timeout',
  'account:login-cancelled',
  'account:login-blocked',
  'account:login-queued',
  'account:network-slow',
  'browser-address:url-change',
  'browser-address:loading-state',
  'browser-address:navigation-state',
  'update:status',
  'update:progress',
  'material:upload-progress',
  'watchdog:warn',
  'watchdog:escalate',
  'watchdog:abandon',
  'watchdog:retry',
]);

const api = {
  account: {
    list: (): Invoke<Account[]> => ipcRenderer.invoke('account:list'),
    add: (platform: string, groupId?: string): Invoke<Account> =>
      ipcRenderer.invoke('account:add', platform, groupId),
    remove: (accountId: string): Invoke<void> =>
      ipcRenderer.invoke('account:remove', accountId),
    validate: (accountId: string): Invoke<boolean> =>
      ipcRenderer.invoke('account:validate', accountId),
    setFingerprint: (accountId: string, fingerprintId: string | null): Invoke<void> =>
      ipcRenderer.invoke('account:setFingerprint', { accountId, fingerprintId }),
    setProxy: (accountId: string, proxyId: string | null): Invoke<void> =>
      ipcRenderer.invoke('account:setProxy', { accountId, proxyId }),
  },

  accountPublishPreset: {
    get: (accountId: string, platform: string): Invoke<any> =>
      ipcRenderer.invoke('accountPublishPreset:get', { accountId, platform }),
    list: (accountId: string): Invoke<any> =>
      ipcRenderer.invoke('accountPublishPreset:list', { accountId }),
    save: (payload: { accountId: string; platform: string; defaultTopics: string[]; platformOptions: Record<string, unknown>; enabled: boolean }): Invoke<any> =>
      ipcRenderer.invoke('accountPublishPreset:save', payload),
    remove: (accountId: string, platform: string): Invoke<boolean> =>
      ipcRenderer.invoke('accountPublishPreset:delete', { accountId, platform }),
  },

  publish: {
    submit: (request: PublishRequest): Invoke<PublishTask> =>
      ipcRenderer.invoke('publish:submit', request),
    cancel: (taskId: string): Invoke<void> =>
      ipcRenderer.invoke('publish:cancel', taskId),
    status: (taskId: string): Invoke<PublishTaskStatusDetail> =>
      ipcRenderer.invoke('publish:status', taskId),
    preCheck: (request: any): Invoke<any> =>
      ipcRenderer.invoke('publish:preCheck', request),
    history: (filters: any): Invoke<any> =>
      ipcRenderer.invoke('publish:history', filters),
    createTask: (data: any): Promise<any> =>
      ipcRenderer.invoke('publish:createTask', data),
    updateTask: (taskId: string, data: any): Promise<any> =>
      ipcRenderer.invoke('publish:updateTask', taskId, data),
    deleteTask: (taskId: string): Promise<any> =>
      ipcRenderer.invoke('publish:deleteTask', taskId),
    cancelTask: (taskId: string): Promise<any> =>
      ipcRenderer.invoke('publish:cancelTask', taskId),
    retryTask: (taskId: string): Promise<any> =>
      ipcRenderer.invoke('publish:retryTask', taskId),
    republishTask: (taskId: string): Promise<any> =>
      ipcRenderer.invoke('task:republish', taskId),
    listTasks: (filter?: any): Promise<any[]> =>
      ipcRenderer.invoke('publish:listTasks', filter),
    batchRetry: (taskIds: string[]): Promise<any> =>
      ipcRenderer.invoke('task:batchRetry', taskIds),
    batchCancel: (taskIds: string[]): Promise<any> =>
      ipcRenderer.invoke('task:batchCancel', taskIds),
    batchDelete: (taskIds: string[]): Promise<any> =>
      ipcRenderer.invoke('task:batchDelete', taskIds),
  },

  task: {
    list: (contentId?: string): Invoke<PublishTask[]> =>
      ipcRenderer.invoke('task:list', contentId),
    retry: (taskId: string): Invoke<PublishResult> =>
      ipcRenderer.invoke('task:retry', taskId),
  },

  platform: {
    list: (): Invoke<Array<{ platformId: string; config: PlatformConfig; capabilities: PlatformCapabilities }>> =>
      ipcRenderer.invoke('platform:list'),
    login: (accountId: string): Invoke<CookieResult> =>
      ipcRenderer.invoke('platform:login', accountId),
    coverRatios: (platformId: string): Invoke<string[]> =>
      ipcRenderer.invoke('platform:coverRatios', platformId),
  },

  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (data: { platform: string; groupId?: string }) =>
      ipcRenderer.invoke('accounts:create', data),
    delete: (id: string) => ipcRenderer.invoke('accounts:delete', id),
    updateRemark: (id: string, remark: string) => ipcRenderer.invoke('accounts:updateRemark', id, remark),
    setGroup: (accountId: string, groupId: string, action: 'add' | 'remove') => ipcRenderer.invoke('accounts:setGroup', { accountId, groupId, action }),
    login: (accountId: string) => ipcRenderer.invoke('accounts:login', accountId),
    checkCookie: (accountId: string) =>
      ipcRenderer.invoke('accounts:checkCookie', accountId),
    getQRCode: (accountId: string) =>
      ipcRenderer.invoke('accounts:getQRCode', accountId),
    startLogin: (data: { platform: string; browserConfig: Record<string, unknown>; existingAccountId?: string }) =>
      ipcRenderer.invoke('accounts:startLogin', data),
    cancelLogin: () => ipcRenderer.invoke('accounts:cancelLogin'),
  },

  content: {
    list: () => ipcRenderer.invoke('content:list'),
    create: (data: { filePath: string }) =>
      ipcRenderer.invoke('content:create', data),
    update: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('content:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('content:delete', id),
    uploadVideo: (data: { filePath: string }) =>
      ipcRenderer.invoke('content:uploadVideo', data),
  },

  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    create: (data: { name: string; description?: string; color?: string }) =>
      ipcRenderer.invoke('groups:create', data),
    update: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('groups:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('groups:delete', id),
    sort: (orderedIds: string[]) => ipcRenderer.invoke('groups:sort', orderedIds),
    bindAccounts: (groupId: string, accountIds: string[]) =>
      ipcRenderer.invoke('groups:bindAccounts', groupId, accountIds),
  },

  platforms: {
    list: () => ipcRenderer.invoke('platforms:list'),
    getConfig: (platformId: string) =>
      ipcRenderer.invoke('platforms:getConfig', platformId),
    getCapabilities: (platformId: string) =>
      ipcRenderer.invoke('platforms:getCapabilities', platformId),
  },

  notification: {
    getPreferences: () => ipcRenderer.invoke('notification:getPreferences'),
    updatePreferences: (prefs: Record<string, unknown>) =>
      ipcRenderer.invoke('notification:updatePreferences', prefs),
    test: () => ipcRenderer.invoke('notification:test'),
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getElectronVersion: (): Promise<string> => ipcRenderer.invoke('app:getElectronVersion'),
    getChromeVersion: (): Promise<string> => ipcRenderer.invoke('app:getChromeVersion'),
    getBuildDate: (): Promise<string> => ipcRenderer.invoke('app:getBuildDate'),
  },

  dashboard: {
    getOverview: () =>
      ipcRenderer.invoke('dashboard:overview'),
  },

  stats: {
    getOverview: (range?: string) => ipcRenderer.invoke('stats:overview', { range }),
    getPlatformStats: (platform: string, range?: string) =>
      ipcRenderer.invoke('stats:platform', { platform, range }),
    getTrend: (metric?: string, range?: string) =>
      ipcRenderer.invoke('stats:trend', { metric, range }),
  },

  ai: {
    prePublishCheck: (context: PrePublishContext): Promise<PrePublishCheckResult> =>
      ipcRenderer.invoke('ai:prePublishCheck', context),
    optimizeRule: (context: RuleOptimizationContext): Promise<RuleOptimizationResult> =>
      ipcRenderer.invoke('ai:optimizeRule', context),
    getCostSummary: (): Promise<{ totalCost: number; totalTokens: number; records: CostRecord[] }> =>
      ipcRenderer.invoke('ai:getCostSummary'),
    getAlerts: (accountId?: string): Promise<any[]> =>
      ipcRenderer.invoke('ai:getAlerts', accountId),
    dismissAlert: (alertId: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:dismissAlert', alertId),
  },

  monitor: {
    createPlan: (plan: any): Promise<any> =>
      ipcRenderer.invoke('monitor:createPlan', plan),
    updatePlan: (id: string, updates: any): Promise<any> =>
      ipcRenderer.invoke('monitor:updatePlan', id, updates),
    deletePlan: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('monitor:deletePlan', id),
    listPlans: (): Promise<any[]> =>
      ipcRenderer.invoke('monitor:listPlans'),
    getAlerts: (): Promise<any[]> =>
      ipcRenderer.invoke('monitor:getAlerts'),
  },

  report: {
    generate: (): Promise<any> =>
      ipcRenderer.invoke('report:generate'),
    getLatest: (): Promise<any> =>
      ipcRenderer.invoke('report:getLatest'),
  },

  panel: {
    open: (accountId: string) =>
      ipcRenderer.invoke('panel:open', { accountId }),
    close: (panelId: string) =>
      ipcRenderer.invoke('panel:close', { panelId }),
    focus: (panelId: string) =>
      ipcRenderer.invoke('panel:focus', { panelId }),
    list: () =>
      ipcRenderer.invoke('panel:list'),
    hideAll: () =>
      ipcRenderer.invoke('panel:hideAll'),
    showAll: () =>
      ipcRenderer.invoke('panel:showAll'),
    navigate: (panelId: string, action: string, url?: string) => {
      if (action === 'url' && url) {
        ipcRenderer.send('panel-address:navigate', { panelId, url });
      } else {
        ipcRenderer.send(`panel-address:${action}`, { panelId });
      }
    },
    openDevTools: (panelId: string) =>
      ipcRenderer.send('panel-address:open-devtools', { panelId }),
    onUrlChange: (callback: (panelId: string, url: string) => void) => {
      ipcRenderer.on('panel-browser:url-change', (_, panelId, url) => callback(panelId, url));
    },
    onNavigationState: (callback: (panelId: string, canBack: boolean, canForward: boolean) => void) => {
      ipcRenderer.on('panel-browser:navigation-state', (_, panelId, canBack, canForward) => callback(panelId, canBack, canForward));
    },
    onLoadingState: (callback: (panelId: string, isLoading: boolean) => void) => {
      ipcRenderer.on('panel-browser:loading-state', (_, panelId, isLoading) => callback(panelId, isLoading));
    },
  },

  draft: {
    save: (snapshot: any, existingId?: string) =>
      ipcRenderer.invoke('draft:save', { snapshot, existingId }),
    get: (id: string) =>
      ipcRenderer.invoke('draft:get', { id }),
    list: (filter?: any) =>
      ipcRenderer.invoke('draft:list', { filter }),
    delete: (draftId: string) =>
      ipcRenderer.invoke('draft:delete', { id: draftId }),
    publish: (id: string) =>
      ipcRenderer.invoke('draft:publish', { id }),
    revoke: (id: string) =>
      ipcRenderer.invoke('draft:revoke', { id }),
  },

  comment: {
    template: {
      create: (data: any) =>
        ipcRenderer.invoke('comment:template:create', data),
      update: (templateId: string, updates: any) =>
        ipcRenderer.invoke('comment:template:update', { templateId, updates }),
      delete: (templateId: string) =>
        ipcRenderer.invoke('comment:template:delete', { templateId }),
      list: (platform?: string) =>
        ipcRenderer.invoke('comment:template:list', { platform }),
    },
    schedule: (templateId: string, accountId: string, videoId: string) =>
      ipcRenderer.invoke('comment:schedule', { templateId, accountId, videoId }),
    execute: (taskId: string) =>
      ipcRenderer.invoke('comment:execute', { taskId }),
    task: {
      list: () =>
        ipcRenderer.invoke('comment:task:list'),
    },
  },

  license: {
    status: () =>
      ipcRenderer.invoke('license:status'),
    activate: (key: string, email: string) =>
      ipcRenderer.invoke('license:activate', { key, email }),
    activateOffline: (filePath: string) =>
      ipcRenderer.invoke('license:activate:offline', { filePath }),
    offlineRequest: (key: string, email: string) =>
      ipcRenderer.invoke('license:offline:request', { key, email }),
    deactivate: () =>
      ipcRenderer.invoke('license:deactivate'),
  },

  proxy: {
    list: () =>
      ipcRenderer.invoke('proxy:list'),
    get: (id: string) =>
      ipcRenderer.invoke('proxy:get', { id }),
    create: (data: { name: string; protocol: string; host: string; port: number; username?: string; password?: string }) =>
      ipcRenderer.invoke('proxy:create', data),
    update: (id: string, data: any) =>
      ipcRenderer.invoke('proxy:update', { id, data }),
    delete: (id: string) =>
      ipcRenderer.invoke('proxy:delete', { id }),
    check: (id: string) =>
      ipcRenderer.invoke('proxy:check', { id }),
    batchCheck: (ids: string[]) =>
      ipcRenderer.invoke('proxy:batchCheck', { ids }),
    import: (content: string, format: 'csv' | 'txt') =>
      ipcRenderer.invoke('proxy:import', { content, format }),
    export: (scope: 'all' | 'available' | 'selected', ids?: string[]) =>
      ipcRenderer.invoke('proxy:export', { scope, ids }),
    getBoundAccounts: (proxyId: string) =>
      ipcRenderer.invoke('proxy:getBoundAccounts', { proxyId }),
    setAccounts: (proxyId: string, accountIds: string[]) =>
      ipcRenderer.invoke('proxy:setAccounts', { proxyId, accountIds }),
    unbindAccount: (proxyId: string, accountId: string) =>
      ipcRenderer.invoke('proxy:unbindAccount', { proxyId, accountId }),
  },

  fingerprint: {
    list: () =>
      ipcRenderer.invoke('fingerprint:list'),
    get: (id: string) =>
      ipcRenderer.invoke('fingerprint:get', { id }),
    create: (data: any) =>
      ipcRenderer.invoke('fingerprint:create', data),
    update: (id: string, data: any) =>
      ipcRenderer.invoke('fingerprint:update', { id, data }),
    delete: (id: string) =>
      ipcRenderer.invoke('fingerprint:delete', { id }),
    generateSeed: () =>
      ipcRenderer.invoke('fingerprint:generateSeed'),
    getDefaults: () =>
      ipcRenderer.invoke('fingerprint:getDefaults'),
    generateHardware: (seed: number, platform: string, brand?: string) =>
      ipcRenderer.invoke('fingerprint:generateHardware', { seed, platform, brand }),
    generateFromSeed: (seed: number) =>
      ipcRenderer.invoke('fingerprint:generateFromSeed', { seed }),
  },

  ipLimit: {
    get: () =>
      ipcRenderer.invoke('ipLimit:get'),
    save: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('ipLimit:save', settings),
    check: (platform: string) =>
      ipcRenderer.invoke('ipLimit:check', { platform }),
  },

  aiRisk: {
    getSettings: () =>
      ipcRenderer.invoke('ai-risk:getSettings'),
    updateSettings: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('ai-risk:updateSettings', settings),
    assess: (context: { platform: string; sameIPCount: number; limit: number; failedLogins?: number; accountAgeDays?: number }) =>
      ipcRenderer.invoke('ai-risk:assess', context),
  },

  browser: {
    validatePath: (filePath: string): Promise<{ valid: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke('browser:validatePath', filePath),
    openUrl: (url: string): Invoke<void> =>
      ipcRenderer.invoke('browser:openUrl', url),
    openAccountBrowser: (accountId: string, url: string): Invoke<void> =>
      ipcRenderer.invoke('account:openBrowser', accountId, url),
  },

  dialog: {
    openFile: (options?: { title?: string; properties?: string[]; filters?: { name: string; extensions: string[] }[] }): Promise<string | string[] | null> =>
      ipcRenderer.invoke('dialog:openFile', options),
  },

  material: {
    list: (query?: ListQuery): Invoke<ListResult> =>
      ipcRenderer.invoke('material:list', query),
    get: (id: string): Invoke<Material | null> =>
      ipcRenderer.invoke('material:get', id),
    upload: (filePath: string, groupId?: string, title?: string, description?: string): Invoke<Material> =>
      ipcRenderer.invoke('material:upload', { filePath, groupId, title, description }),
    delete: (id: string): Invoke<void> =>
      ipcRenderer.invoke('material:delete', id),
    batchDelete: (ids: string[]): Invoke<BatchDeleteResult> =>
      ipcRenderer.invoke('material:batchDelete', ids),
    download: (ids: string[], targetDir: string): Invoke<void> =>
      ipcRenderer.invoke('material:download', ids, targetDir),
    moveToGroup: (ids: string[], groupId: string | null): Invoke<{ success: string[]; failed: string[] }> =>
      ipcRenderer.invoke('material:moveToGroup', ids, groupId),
    getLibraryPath: (): Invoke<string> =>
      ipcRenderer.invoke('material:getLibraryPath'),
    setLibraryPath: (path: string): Invoke<void> =>
      ipcRenderer.invoke('material:setLibraryPath', path),
    regenerateThumbnails: (): Invoke<{ success: number; failed: number }> =>
      ipcRenderer.invoke('material:regenerateThumbnails'),
    openInFolder: (filePath: string): Invoke<void> =>
      ipcRenderer.invoke('material:openInFolder', filePath),
    captureFrame: (filePath: string, timestamp?: string): Invoke<{ imagePath: string }> =>
      ipcRenderer.invoke('material:captureFrame', { filePath, timestamp }),
  },

  materialGroup: {
    list: (): Invoke<MaterialGroup[]> =>
      ipcRenderer.invoke('materialGroup:list'),
    create: (name: string, color?: string): Invoke<MaterialGroup> =>
      ipcRenderer.invoke('materialGroup:create', name, color),
    delete: (id: string): Invoke<void> =>
      ipcRenderer.invoke('materialGroup:delete', id),
  },

  update: {
    check: () =>
      ipcRenderer.invoke('update:check'),
    download: () =>
      ipcRenderer.invoke('update:download'),
    install: () =>
      ipcRenderer.invoke('update:install'),
    getStatus: () =>
      ipcRenderer.invoke('update:getStatus'),
  },

  data: {
    createBackup: (): Invoke<import('./data/Database').BackupInfo> =>
      ipcRenderer.invoke('data:createBackup'),
    listBackups: (): Invoke<import('./data/Database').BackupInfo[]> =>
      ipcRenderer.invoke('data:listBackups'),
    restoreBackup: (backupId: string): Invoke<null> =>
      ipcRenderer.invoke('data:restoreBackup', backupId),
    deleteBackup: (backupId: string): Invoke<null> =>
      ipcRenderer.invoke('data:deleteBackup', backupId),
    clearData: (type: 'logs' | 'cache' | 'all'): Invoke<null> =>
      ipcRenderer.invoke('data:clear', type),
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      console.warn(`IPC channel "${channel}" not in allowlist`);
      return () => {};
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  onPublishStatus: (callback: (batch: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.has('publish:status')) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, batch: unknown[]) =>
      callback(batch);
    ipcRenderer.on('publish:status', handler);
    return () => ipcRenderer.removeListener('publish:status', handler);
  },

  onTaskProgress: (callback: (taskId: string, progress: number, message?: string) => void) => {
    if (!ALLOWED_CHANNELS.has('task:progress')) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, taskId: string, progress: number, message?: string) =>
      callback(taskId, progress, message);
    ipcRenderer.on('task:progress', handler);
    return () => ipcRenderer.removeListener('task:progress', handler);
  },

  onTaskStatusChange: (callback: (taskId: string, status: string, data?: unknown) => void) => {
    if (!ALLOWED_CHANNELS.has('task:status-change')) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, taskId: string, status: string, data?: unknown) =>
      callback(taskId, status, data);
    ipcRenderer.on('task:status-change', handler);
    return () => ipcRenderer.removeListener('task:status-change', handler);
  },

  onWatchdogEvent: (callback: (event: string, taskId: string, message: string) => void) => {
    if (!ALLOWED_CHANNELS.has('watchdog:warn')) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, event: string, taskId: string, message: string) =>
      callback(event, taskId, message);
    for (const ch of ['watchdog:warn', 'watchdog:escalate', 'watchdog:abandon']) {
      ipcRenderer.on(ch, handler);
    }
    return () => {
      for (const ch of ['watchdog:warn', 'watchdog:escalate', 'watchdog:abandon']) {
        ipcRenderer.removeListener(ch, handler);
      }
    };
  },
};

contextBridge.exposeInMainWorld('matrixflow', api);

export type MatrixFlowAPI = typeof api;
