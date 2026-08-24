/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron extends the Web File API with a `path` property
interface File {
  readonly path: string;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

interface MatrixFlowAPI {
  account: {
    list: () => Promise<IpcResult<any[]>>;
    add: (platform: string, groupId?: string) => Promise<IpcResult<any>>;
    remove: (accountId: string) => Promise<IpcResult<void>>;
    validate: (accountId: string) => Promise<IpcResult<boolean>>;
    setFingerprint: (accountId: string, fingerprintId: string | null) => Promise<IpcResult<void>>;
    setProxy: (accountId: string, proxyId: string | null) => Promise<IpcResult<void>>;
  };

  accountPublishPreset: {
    get: (accountId: string, platform: string) => Promise<IpcResult<any>>;
    list: (accountId: string) => Promise<IpcResult<any[]>>;
    save: (payload: { accountId: string; platform: string; defaultTopics: string[]; platformOptions: Record<string, unknown>; enabled: boolean }) => Promise<IpcResult<any>>;
    remove: (accountId: string, platform: string) => Promise<IpcResult<boolean>>;
  };

  publish: {
    submit: (request: any) => Promise<IpcResult<any>>;
    cancel: (taskId: string) => Promise<IpcResult<void>>;
    status: (taskId: string) => Promise<IpcResult<any>>;
    preCheck: (request: any) => Promise<IpcResult<any>>;
    history: (filters: any) => Promise<IpcResult<any>>;
    createTask: (data: any) => Promise<any>;
    updateTask: (taskId: string, data: any) => Promise<any>;
    deleteTask: (taskId: string) => Promise<any>;
    cancelTask: (taskId: string) => Promise<any>;
    retryTask: (taskId: string) => Promise<any>;
    republishTask: (taskId: string) => Promise<any>;
    listTasks: (filter?: any) => Promise<any[]>;
    listPlans?: () => Promise<any>;
    batchRetry: (taskIds: string[]) => Promise<any>;
    batchCancel: (taskIds: string[]) => Promise<any>;
    batchDelete: (taskIds: string[]) => Promise<any>;
  };

  task: {
    list: (contentId?: string) => Promise<IpcResult<any[]>>;
    retry: (taskId: string) => Promise<IpcResult<any>>;
  };

  platform: {
    list: () => Promise<IpcResult<any[]>>;
    login: (accountId: string) => Promise<IpcResult<any>>;
    coverRatios: (platformId: string) => Promise<IpcResult<string[]>>;
  };

  accounts: {
    list: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
    updateRemark: (id: string, remark: string) => Promise<IpcResult<void>>;
    setGroup: (accountId: string, groupId: string, action: 'add' | 'remove') => Promise<{ success: boolean; message?: string }>;
    login: (accountId: string) => Promise<any>;
    checkCookie: (accountId: string) => Promise<any>;
    getQRCode: (accountId: string) => Promise<any>;
    startLogin: (data: { platform: string; browserConfig: Record<string, unknown>; existingAccountId?: string }) => Promise<IpcResult<any>>;
    cancelLogin: () => Promise<IpcResult<void>>;
  };

  content: {
    list: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: string, data: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
    uploadVideo: (data: any) => Promise<any>;
  };

  groups: {
    list: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: string, data: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
    sort: (orderedIds: string[]) => Promise<any>;
    bindAccounts: (groupId: string, accountIds: string[]) => Promise<any>;
  };

  platforms: {
    list: () => Promise<any[]>;
    getConfig: (platformId: string) => Promise<any>;
    getCapabilities: (platformId: string) => Promise<any>;
  };

  stats: {
    getOverview: (range?: string) => Promise<any>;
    getPlatformStats: (platform: string, range?: string) => Promise<any>;
    getTrend: (metric?: string, range?: string) => Promise<any>;
  };

  dashboard: {
    getOverview: () => Promise<IpcResult<any>>;
  };

  settings: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<any>;
  };

  app: {
    getVersion: () => Promise<string>;
    getElectronVersion: () => Promise<string>;
    getChromeVersion: () => Promise<string>;
    getBuildDate: () => Promise<string>;
  };

  ai: {
    prePublishCheck: (context: any) => Promise<any>;
    optimizeRule: (context: any) => Promise<any>;
    getCostSummary: () => Promise<{ totalCost: number; totalTokens: number; records: any[] }>;
    getAlerts: (accountId?: string) => Promise<any[]>;
    dismissAlert: (alertId: string) => Promise<boolean>;
  };

  monitor: {
    createPlan: (plan: any) => Promise<any>;
    updatePlan: (id: string, updates: any) => Promise<any>;
    deletePlan: (id: string) => Promise<boolean>;
    listPlans: () => Promise<any[]>;
    getAlerts: () => Promise<any[]>;
  };

  report: {
    generate: () => Promise<any>;
    getLatest: () => Promise<any>;
  };

  panel: {
    open: (accountId: string) => Promise<IpcResult<any>>;
    close: (panelId: string) => Promise<IpcResult<void>>;
    focus: (panelId: string) => Promise<IpcResult<void>>;
    list: () => Promise<IpcResult<any[]>>;
    hideAll: () => Promise<IpcResult<void>>;
    showAll: () => Promise<IpcResult<void>>;
  };

  draft: {
    save: (snapshot: any, existingId?: string) => Promise<IpcResult<any>>;
    get: (id: string) => Promise<IpcResult<any>>;
    list: (filter?: any) => Promise<IpcResult<any[]>>;
    delete: (draftId: string) => Promise<IpcResult<void>>;
    publish: (id: string) => Promise<IpcResult<void>>;
    revoke: (id: string) => Promise<IpcResult<void>>;
  };

  comment: {
    template: {
      create: (data: any) => Promise<IpcResult<any>>;
      update: (templateId: string, updates: any) => Promise<IpcResult<any>>;
      delete: (templateId: string) => Promise<IpcResult<void>>;
      list: (platform?: string) => Promise<IpcResult<any[]>>;
    };
    schedule: (templateId: string, accountId: string, videoId: string) => Promise<IpcResult<any>>;
    execute: (taskId: string) => Promise<IpcResult<any>>;
    task: {
      list: () => Promise<IpcResult<any[]>>;
    };
  };

  license: {
    status: () => Promise<any>;
    activate: (key: string, email: string) => Promise<any>;
    activateOffline: (filePath: string) => Promise<any>;
    offlineRequest: (key: string, email: string) => Promise<any>;
    deactivate: () => Promise<any>;
  };

  update: {
    check: () => Promise<any>;
    download: () => Promise<any>;
    install: () => Promise<any>;
    getStatus: () => Promise<any>;
  };

  data: {
    createBackup: () => Promise<IpcResult<{ id: string; name: string; size: number; createdAt: string }>>;
    listBackups: () => Promise<IpcResult<Array<{ id: string; name: string; size: number; createdAt: string }>>>;
    restoreBackup: (backupId: string) => Promise<IpcResult<null>>;
    deleteBackup: (backupId: string) => Promise<IpcResult<null>>;
    clearData: (type: 'logs' | 'cache' | 'all') => Promise<IpcResult<null>>;
  };

  notification: {
    getPreferences: () => Promise<IpcResult<Record<string, unknown>>>;
    updatePreferences: (prefs: Record<string, unknown>) => Promise<IpcResult<null>>;
    test: () => Promise<IpcResult<null>>;
  };

  fingerprint: {
    list: () => Promise<IpcResult<any[]>>;
    get: (id: string) => Promise<IpcResult<any>>;
    create: (data: any) => Promise<IpcResult<any>>;
    update: (id: string, data: any) => Promise<IpcResult<any>>;
    delete: (id: string) => Promise<IpcResult<void>>;
    generateSeed: () => Promise<IpcResult<number>>;
    getDefaults: () => Promise<IpcResult<any>>;
    generateHardware: (seed: number, platform: string, brand?: string) => Promise<IpcResult<{ hardware_concurrency: number; gpu_vendor: string; gpu_renderer: string; platform_version: string; brand_version: string }>>;
    generateFromSeed: (seed: number) => Promise<IpcResult<Partial<FingerprintTemplate>>>;
  };

  ipLimit: {
    get: () => Promise<IpcResult<any>>;
    save: (settings: Record<string, unknown>) => Promise<IpcResult<null>>;
    check: (platform: string) => Promise<IpcResult<{ platformCount: number; platformLimit: number; exceeded: boolean }>>;
  };

  proxy: {
    list: () => Promise<IpcResult<any[]>>;
    get: (id: string) => Promise<IpcResult<any>>;
    create: (data: any) => Promise<IpcResult<any>>;
    update: (id: string, data: any) => Promise<IpcResult<any>>;
    delete: (id: string) => Promise<IpcResult<void>>;
    check: (id: string) => Promise<IpcResult<{ success: boolean; message: string; latency?: number }>>;
  };

  aiRisk: {
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<{ success: boolean }>;
    assess: (context: { platform: string; sameIPCount: number; limit: number }) => Promise<any>;
  };

  browser: {
    openUrl: (url: string) => Promise<IpcResult<void>>;
    openAccountBrowser: (accountId: string, url: string) => Promise<IpcResult<void>>;
    validatePath: (filePath: string) => Promise<{ valid: boolean; version?: string; error?: string }>;
  };

  dialog: {
    openFile: (options?: { title?: string; properties?: string[]; filters?: { name: string; extensions: string[] }[] }) => Promise<string | string[] | null>;
  };

  material: {
    list: (query?: any) => Promise<IpcResult<any>>;
    get: (id: string) => Promise<IpcResult<any>>;
    upload: (filePath: string, groupId?: string, title?: string, description?: string) => Promise<IpcResult<any>>;
    delete: (id: string) => Promise<IpcResult<void>>;
    batchDelete: (ids: string[]) => Promise<IpcResult<{ success: string[]; failed: string[] }>>;
    download: (ids: string[], targetDir: string) => Promise<IpcResult<void>>;
    moveToGroup: (ids: string[], groupId: string | null) => Promise<IpcResult<{ success: string[]; failed: string[] }>>;
    getLibraryPath: () => Promise<IpcResult<string>>;
    setLibraryPath: (path: string) => Promise<IpcResult<void>>;
    regenerateThumbnails: () => Promise<IpcResult<{ success: number; failed: number }>>;
    captureFrame: (filePath: string, timestamp?: string) => Promise<IpcResult<{ imagePath: string }>>;
    openInFolder: (filePath: string) => Promise<IpcResult<void>>;
  };

  materialGroup: {
    list: () => Promise<IpcResult<any[]>>;
    create: (name: string, color?: string) => Promise<IpcResult<any>>;
    delete: (id: string) => Promise<IpcResult<void>>;
  };

  runPoc: (type: string) => Promise<unknown>;
  launchPatchright: () => Promise<unknown>;
  onStatus: (callback: (msg: string) => void) => void;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  onPublishStatus: (callback: (batch: any[]) => void) => () => void;
  onTaskProgress: (callback: (taskId: string, progress: number, message?: string) => void) => () => void;
  onTaskStatusChange: (callback: (taskId: string, status: string, data?: any) => void) => () => void;
  onWatchdogEvent: (callback: (event: string, taskId: string, message: string) => void) => () => void;
}

declare module 'echarts/core' {
  export const use: (...args: any[]) => void;
}
declare module 'echarts/charts' {
  export const LineChart: any;
  export const BarChart: any;
  export const RadarChart: any;
}
declare module 'echarts/components' {
  export const GridComponent: any;
  export const TooltipComponent: any;
  export const LegendComponent: any;
  export const DataZoomComponent: any;
  export const RadarComponent: any;
}
declare module 'echarts/features' {
  export const LegacyGridContainLabel: any;
}
declare module 'echarts/renderers' {
  export const CanvasRenderer: any;
}
declare module 'vue-echarts' {
  import { DefineComponent } from 'vue';
  const VChart: DefineComponent<any, any, any>;
  export default VChart;
}

interface Window {
  matrixflow: MatrixFlowAPI;
}
