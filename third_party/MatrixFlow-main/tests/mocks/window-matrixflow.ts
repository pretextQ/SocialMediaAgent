import { vi } from 'vitest';

/**
 * Complete mock for window.matrixflow IPC API.
 * Based on electron/preload.ts exposed channels.
 *
 * Usage in tests:
 *   import { createMatrixflowMock } from '../mocks/window-matrixflow';
 *   const mock = createMatrixflowMock();
 *   // Override specific handlers:
 *   mock.accounts.list.mockResolvedValue([...]);
 */

export interface MatrixflowMock {
  account: {
    list: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
    setFingerprint: ReturnType<typeof vi.fn>;
    setProxy: ReturnType<typeof vi.fn>;
  };
  accounts: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    checkCookie: ReturnType<typeof vi.fn>;
    getQRCode: ReturnType<typeof vi.fn>;
  };
  content: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    uploadVideo: ReturnType<typeof vi.fn>;
  };
  publish: {
    submit: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    preCheck: ReturnType<typeof vi.fn>;
    history: ReturnType<typeof vi.fn>;
    createTask: ReturnType<typeof vi.fn>;
    updateTask: ReturnType<typeof vi.fn>;
    cancelTask: ReturnType<typeof vi.fn>;
    deleteTask: ReturnType<typeof vi.fn>;
    retryTask: ReturnType<typeof vi.fn>;
    listTasks: ReturnType<typeof vi.fn>;
  };
  task: {
    list: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  };
  platform: {
    list: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    coverRatios: ReturnType<typeof vi.fn>;
  };
  platforms: {
    list: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    getCapabilities: ReturnType<typeof vi.fn>;
  };
  groups: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    sort: ReturnType<typeof vi.fn>;
    bindAccounts: ReturnType<typeof vi.fn>;
  };
  settings: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };
  stats: {
    getOverview: ReturnType<typeof vi.fn>;
    getPlatformStats: ReturnType<typeof vi.fn>;
    getTrend: ReturnType<typeof vi.fn>;
  };
  ai: {
    prePublishCheck: ReturnType<typeof vi.fn>;
    optimizeRule: ReturnType<typeof vi.fn>;
    getCostSummary: ReturnType<typeof vi.fn>;
    getAlerts: ReturnType<typeof vi.fn>;
    dismissAlert: ReturnType<typeof vi.fn>;
  };
  monitor: {
    createPlan: ReturnType<typeof vi.fn>;
    updatePlan: ReturnType<typeof vi.fn>;
    deletePlan: ReturnType<typeof vi.fn>;
    listPlans: ReturnType<typeof vi.fn>;
    getAlerts: ReturnType<typeof vi.fn>;
  };
  report: {
    generate: ReturnType<typeof vi.fn>;
    getLatest: ReturnType<typeof vi.fn>;
  };
  panel: {
    open: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  draft: {
    save: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    duplicate: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  comment: {
    template: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
    };
    schedule: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    task: {
      list: ReturnType<typeof vi.fn>;
    };
  };
  license: {
    status: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    activateOffline: ReturnType<typeof vi.fn>;
    offlineRequest: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  proxy: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    check: ReturnType<typeof vi.fn>;
  };
  fingerprint: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  update: {
    check: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    install: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };
  data: {
    createBackup: ReturnType<typeof vi.fn>;
    listBackups: ReturnType<typeof vi.fn>;
    restoreBackup: ReturnType<typeof vi.fn>;
    deleteBackup: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  notification: {
    getPreferences: ReturnType<typeof vi.fn>;
    updatePreferences: ReturnType<typeof vi.fn>;
    test: ReturnType<typeof vi.fn>;
  };
  /** Push event listeners (ipcRenderer.on channels) */
  on: Record<string, ReturnType<typeof vi.fn>>;
  off: Record<string, ReturnType<typeof vi.fn>>;
}

function fn<T = unknown>(defaultValue?: T) {
  if (defaultValue !== undefined) {
    return vi.fn().mockResolvedValue(defaultValue);
  }
  return vi.fn().mockResolvedValue(undefined);
}

function okResult<T>(data: T) {
  return { success: true, data };
}

/**
 * Create a complete window.matrixflow mock with sensible defaults.
 * All IPC calls return resolved promises by default.
 */
export function createMatrixflowMock(): MatrixflowMock {
  const eventListeners: Record<string, ReturnType<typeof vi.fn>> = {};

  const mock: MatrixflowMock = {
    // account (standard IpcResult channels)
    account: {
      list: fn(okResult([])),
      add: fn(okResult({})),
      remove: fn(okResult(undefined)),
      validate: fn(okResult(true)),
      setFingerprint: fn(okResult(undefined)),
      setProxy: fn(okResult(undefined)),
    },

    // accounts (bare return channels - legacy compat)
    accounts: {
      list: fn([]),
      create: fn({ success: true, data: {} }),
      delete: fn({ success: true }),
      login: fn({ success: true, data: {} }),
      checkCookie: fn({ success: true, valid: true }),
      getQRCode: fn({ success: true, data: null }),
    },

    // content (bare return)
    content: {
      list: fn([]),
      create: fn({ success: true, data: {} }),
      update: fn({ success: true, data: {} }),
      delete: fn({ success: true }),
      uploadVideo: fn({ success: true, data: {} }),
    },

    // publish (mixed)
    publish: {
      submit: fn(okResult({})),
      cancel: fn(okResult(undefined)),
      status: fn(okResult({})),
      preCheck: fn(okResult({ healthy: [], unhealthy: [] })),
      history: fn(okResult([])),
      createTask: fn({ success: true, data: {} }),
      updateTask: fn({ success: true }),
      cancelTask: fn({ success: true }),
      deleteTask: fn({ success: true }),
      retryTask: fn({ success: true }),
      listTasks: fn({ items: [], total: 0 }),
    },

    task: {
      list: fn(okResult([])),
      retry: fn(okResult({})),
    },

    platform: {
      list: fn(okResult([])),
      login: fn(okResult({})),
      coverRatios: fn(['1:1', '16:9', '3:4']),
    },

    platforms: {
      list: fn(['douyin', 'xiaohongshu', 'channels', 'kuaishou', 'bilibili']),
      getConfig: fn(null),
      getCapabilities: fn(null),
    },

    groups: {
      list: fn([]),
      create: fn({ success: true, data: {} }),
      update: fn({ success: true }),
      delete: fn({ success: true }),
      sort: fn({ success: true }),
      bindAccounts: fn({ success: true }),
    },

    settings: {
      get: fn(null),
      set: fn({ success: true }),
    },

    stats: {
      getOverview: fn({}),
      getPlatformStats: fn({}),
      getTrend: fn([]),
    },

    ai: {
      prePublishCheck: fn({ score: 0, issues: [], suggestions: [] }),
      optimizeRule: fn({ suggestions: [] }),
      getCostSummary: fn({ totalCost: 0, totalTokens: 0, records: [] }),
      getAlerts: fn([]),
      dismissAlert: fn(true),
    },

    monitor: {
      createPlan: fn({}),
      updatePlan: fn({}),
      deletePlan: fn(true),
      listPlans: fn([]),
      getAlerts: fn([]),
    },

    report: {
      generate: fn({}),
      getLatest: fn(null),
    },

    panel: {
      open: fn(okResult({})),
      close: fn(okResult(null)),
      focus: fn(okResult(null)),
      list: fn(okResult([])),
    },

    draft: {
      save: fn(okResult({ id: 'draft-1' })),
      get: fn(okResult({})),
      create: fn(okResult({})),
      update: fn(okResult({})),
      delete: fn(okResult(null)),
      list: fn(okResult([])),
      duplicate: fn(okResult({})),
      publish: fn(okResult(null)),
      revoke: fn(okResult(null)),
    },

    comment: {
      template: {
        create: fn(okResult({})),
        update: fn(okResult({})),
        delete: fn(okResult(null)),
        list: fn(okResult([])),
      },
      schedule: fn(okResult({})),
      execute: fn(okResult(null)),
      task: {
        list: fn(okResult([])),
      },
    },

    license: {
      status: fn(okResult({ valid: false, license: null })),
      activate: fn({ success: true }),
      activateOffline: fn({ success: true }),
      offlineRequest: fn(okResult('/tmp/offline-request.txt')),
      deactivate: fn(okResult(null)),
    },

    proxy: {
      list: fn(okResult([])),
      get: fn(okResult({})),
      create: fn(okResult({})),
      update: fn(okResult({})),
      delete: fn(okResult(undefined)),
      check: fn(okResult({ connected: true, latency: 50 })),
    },

    fingerprint: {
      list: fn(okResult([])),
      get: fn(okResult({})),
      create: fn(okResult({})),
      update: fn(okResult({})),
      delete: fn(okResult(undefined)),
    },

    update: {
      check: fn(okResult({ available: false })),
      download: fn(okResult(null)),
      install: fn(okResult(null)),
      getStatus: fn(okResult({ status: 'up-to-date' })),
    },

    data: {
      createBackup: fn(okResult({})),
      listBackups: fn(okResult([])),
      restoreBackup: fn(okResult(null)),
      deleteBackup: fn(okResult(null)),
      clear: fn(okResult(null)),
    },

    notification: {
      getPreferences: fn(okResult({})),
      updatePreferences: fn(okResult({})),
      test: fn(okResult(null)),
    },

    on: new Proxy(eventListeners, {
      get: (target, prop: string) => {
        if (!target[prop]) {
          target[prop] = vi.fn();
        }
        return target[prop];
      },
    }),

    off: new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get: (target, prop: string) => {
        if (!target[prop]) {
          target[prop] = vi.fn();
        }
        return target[prop];
      },
    }),
  };

  return mock;
}

/**
 * Install window.matrixflow mock on globalThis.
 * Call in beforeEach or test setup.
 */
export function installMatrixflowMock(): MatrixflowMock {
  const mock = createMatrixflowMock();
  (globalThis as any).window = { matrixflow: mock };
  return mock;
}

/**
 * Remove window.matrixflow mock.
 * Call in afterEach to clean up.
 */
export function removeMatrixflowMock() {
  if ((globalThis as any).window) {
    delete (globalThis as any).window.matrixflow;
  }
}
