import { ipcMain, BrowserWindow, dialog, session as electronSession } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PlatformRegistry } from '../platform/base/PlatformRegistry';
import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { accountService } from '../services/AccountService';
import { publishService } from '../services/PublishService';
import { contentService } from '../services/ContentService';
import { groupService } from '../services/GroupService';
import { statsService } from '../services/StatsService';
import { getDatabase, createBackup, listBackups, restoreBackup, deleteBackup, clearData } from '../data/Database';
import type { BackupInfo } from '../data/Database';
import { getAIService } from '../ai/AIService';
import { anomalyService } from '../services/AnomalyService';
import { monitorService } from '../services/MonitorService';
import { weeklyReportService } from '../services/WeeklyReportService';
import { multiPanelService } from '../services/MultiPanelService';
import { draftService } from '../services/DraftService';
import { commentService } from '../services/CommentService';
import { licenseService } from '../services/LicenseService';
import { proxyService } from '../services/ProxyService';
import { materialService } from '../services/MaterialService';
import { SessionManager } from '../services/session-manager';
import { accountPublishPresetService } from '../services/AccountPublishPresetService';
import type { PublishPreset, SavePublishPresetInput } from '../services/AccountPublishPresetService';
import { fingerprintTemplateRepo } from '../data/repositories/FingerprintTemplateRepository';
import { getIPLimitSettingsService } from '../services/ip-limit-settings';
import { getAIRiskSettingsService } from '../services/ai-risk-settings';
import { normalizePlatformId } from '../services/platform-normalizer';
import type { RiskContext } from '../services/ai-risk-settings';
import {
  generateFingerprintSeed,
  getDefaultPlatform,
  getDefaultTimezone,
  getDefaultLang,
  getDefaultAcceptLang,
  createDefaultTemplate,
  generateHardwareFromSeed,
  generateTemplateFromSeed,
} from '../services/FingerprintService';
import { autoUpdaterService } from '../core/AutoUpdater';
import { notificationService } from '../core/NotificationService';
import type { PrePublishContext, RuleOptimizationContext } from '../ai/types';
import type { Account } from '../services/types/account';
import type { Material, MaterialGroup, ListQuery, ListResult, BatchDeleteResult } from '../services/types/material';
import type {
  PublishTask,
  PublishResult,
  PublishTaskStatusDetail,
  PublishRequest,
  BatchPublishRequest,
  TaskFilter,
} from '../services/types/publish';
import type { PlatformConfig, PlatformCapabilities, CookieResult } from '../platform/base/types';
import type { PublishEvent } from '../core/types/eventbus';

import { createBrowserLauncher } from '../services/browser-launcher';
import { startAccountLogin } from '../services/ipc-handlers';
import type { BrowserType, IBrowserLauncher } from '../services/types';
import { PLATFORM_COOKIE_CONFIGS } from '../services/types';
import type { BrowserContext } from 'patchright';

const logger = new Logger('IPC');

// Module-level map for account browser contexts that must stay alive after IPC returns.
const accountBrowserContexts = new Map<string, { launcher: IBrowserLauncher; context: BrowserContext }>();

const CHANNEL = {
  ACCOUNT_LIST: 'account:list',
  ACCOUNT_ADD: 'account:add',
  ACCOUNT_REMOVE: 'account:remove',
  ACCOUNT_VALIDATE: 'account:validate',

  PUBLISH_SUBMIT: 'publish:submit',
  PUBLISH_CANCEL: 'publish:cancel',
  PUBLISH_STATUS: 'publish:status',

  TASK_LIST: 'task:list',
  TASK_RETRY: 'task:retry',
  TASK_REPUBLISH: 'task:republish',
  TASK_BATCH_RETRY: 'task:batchRetry',
  TASK_BATCH_CANCEL: 'task:batchCancel',
  TASK_BATCH_DELETE: 'task:batchDelete',

  DRAFT_SAVE: 'draft:save',
  DRAFT_GET: 'draft:get',
  DRAFT_LIST: 'draft:list',
  DRAFT_DELETE: 'draft:delete',
  DRAFT_PUBLISH: 'draft:publish',
  DRAFT_REVOKE: 'draft:revoke',

  PLATFORM_LIST: 'platform:list',
  PLATFORM_LOGIN: 'platform:login',

  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_CREATE: 'accounts:create',
  ACCOUNTS_DELETE: 'accounts:delete',
  ACCOUNTS_LOGIN: 'accounts:login',
  ACCOUNTS_CHECK_COOKIE: 'accounts:checkCookie',
  ACCOUNTS_GET_QR_CODE: 'accounts:getQRCode',
  CONTENT_LIST: 'content:list',
  CONTENT_CREATE: 'content:create',
  CONTENT_DELETE: 'content:delete',
  CONTENT_UPDATE: 'content:update',
  CONTENT_UPLOAD_VIDEO: 'content:uploadVideo',
  GROUPS_LIST: 'groups:list',
  GROUPS_CREATE: 'groups:create',
  GROUPS_UPDATE: 'groups:update',
  GROUPS_DELETE: 'groups:delete',
  GROUPS_SORT: 'groups:sort',
  GROUPS_BIND_ACCOUNTS: 'groups:bindAccounts',
  PUBLISH_CREATE_TASK: 'publish:createTask',
  PUBLISH_UPDATE_TASK: 'publish:updateTask',
  PUBLISH_DELETE_TASK: 'publish:deleteTask',
  PUBLISH_CANCEL_TASK: 'publish:cancelTask',
  PUBLISH_RETRY_TASK: 'publish:retryTask',
  PUBLISH_LIST_TASKS: 'publish:listTasks',
  PLATFORMS_LIST: 'platforms:list',
  PLATFORMS_GET_CONFIG: 'platforms:getConfig',
  PLATFORMS_GET_CAPABILITIES: 'platforms:getCapabilities',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  APP_GET_VERSION: 'app:getVersion',
  APP_GET_ELECTRON_VERSION: 'app:getElectronVersion',
  APP_GET_CHROME_VERSION: 'app:getChromeVersion',
  APP_GET_BUILD_DATE: 'app:getBuildDate',
  STATS_OVERVIEW: 'stats:overview',
  STATS_PLATFORM: 'stats:platform',
  STATS_TREND: 'stats:trend',

  AI_PREPUBLISH_CHECK: 'ai:prePublishCheck',
  AI_OPTIMIZE_RULE: 'ai:optimizeRule',
  AI_GET_COST_SUMMARY: 'ai:getCostSummary',
  AI_GET_ALERTS: 'ai:getAlerts',
  AI_DISMISS_ALERT: 'ai:dismissAlert',
  MONITOR_CREATE_PLAN: 'monitor:createPlan',
  MONITOR_UPDATE_PLAN: 'monitor:updatePlan',
  MONITOR_DELETE_PLAN: 'monitor:deletePlan',
  MONITOR_LIST_PLANS: 'monitor:listPlans',
  MONITOR_GET_ALERTS: 'monitor:getAlerts',
  REPORT_GENERATE: 'report:generate',
  REPORT_GET_LATEST: 'report:getLatest',
  PANEL_OPEN: 'panel:open',
  PANEL_CLOSE: 'panel:close',
  PANEL_FOCUS: 'panel:focus',
  PANEL_LIST: 'panel:list',
  PANEL_HIDE_ALL: 'panel:hideAll',
  PANEL_SHOW_ALL: 'panel:showAll',
  COMMENT_TEMPLATE_CREATE: 'comment:template:create',
  COMMENT_TEMPLATE_UPDATE: 'comment:template:update',
  COMMENT_TEMPLATE_DELETE: 'comment:template:delete',
  COMMENT_TEMPLATE_LIST: 'comment:template:list',
  COMMENT_SCHEDULE: 'comment:schedule',
  COMMENT_EXECUTE: 'comment:execute',
  COMMENT_TASK_LIST: 'comment:task:list',
  LICENSE_STATUS: 'license:status',
  LICENSE_ACTIVATE: 'license:activate',
  LICENSE_ACTIVATE_OFFLINE: 'license:activate:offline',
  LICENSE_OFFLINE_REQUEST: 'license:offline:request',
  LICENSE_DEACTIVATE: 'license:deactivate',

  PROXY_LIST: 'proxy:list',
  PROXY_GET: 'proxy:get',
  PROXY_CREATE: 'proxy:create',
  PROXY_UPDATE: 'proxy:update',
  PROXY_DELETE: 'proxy:delete',
  PROXY_CHECK: 'proxy:check',
  PROXY_BATCH_CHECK: 'proxy:batchCheck',
  PROXY_IMPORT: 'proxy:import',
  PROXY_EXPORT: 'proxy:export',
  PROXY_GET_BOUND_ACCOUNTS: 'proxy:getBoundAccounts',
  PROXY_SET_ACCOUNTS: 'proxy:setAccounts',
  PROXY_UNBIND_ACCOUNT: 'proxy:unbindAccount',

  FINGERPRINT_LIST: 'fingerprint:list',
  FINGERPRINT_GET: 'fingerprint:get',
  FINGERPRINT_CREATE: 'fingerprint:create',
  FINGERPRINT_UPDATE: 'fingerprint:update',
  FINGERPRINT_DELETE: 'fingerprint:delete',
  FINGERPRINT_GENERATE_SEED: 'fingerprint:generateSeed',
  FINGERPRINT_GET_DEFAULTS: 'fingerprint:getDefaults',
  FINGERPRINT_GENERATE_HARDWARE: 'fingerprint:generateHardware',
  FINGERPRINT_GENERATE_FROM_SEED: 'fingerprint:generateFromSeed',

  IP_LIMIT_GET: 'ipLimit:get',
  IP_LIMIT_SAVE: 'ipLimit:save',
  IP_LIMIT_CHECK: 'ipLimit:check',

  ACCOUNT_SET_FINGERPRINT: 'account:setFingerprint',
  ACCOUNT_SET_PROXY: 'account:setProxy',

  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_GET_STATUS: 'update:getStatus',

  DATA_CREATE_BACKUP: 'data:createBackup',
  DATA_LIST_BACKUPS: 'data:listBackups',
  DATA_RESTORE_BACKUP: 'data:restoreBackup',
  DATA_DELETE_BACKUP: 'data:deleteBackup',
  DATA_CLEAR: 'data:clear',

  NOTIFICATION_GET_PREFERENCES: 'notification:getPreferences',
  NOTIFICATION_UPDATE_PREFERENCES: 'notification:updatePreferences',
  NOTIFICATION_TEST: 'notification:test',

  PUBLISH_PRE_CHECK: 'publish:preCheck',
  PUBLISH_HISTORY: 'publish:history',
  PLATFORM_COVER_RATIOS: 'platform:coverRatios',

  MATERIAL_LIST: 'material:list',
  MATERIAL_GET: 'material:get',
  MATERIAL_UPLOAD: 'material:upload',
  MATERIAL_DELETE: 'material:delete',
  MATERIAL_BATCH_DELETE: 'material:batchDelete',
  MATERIAL_DOWNLOAD: 'material:download',
  MATERIAL_MOVE_TO_GROUP: 'material:moveToGroup',
  MATERIAL_GET_LIBRARY_PATH: 'material:getLibraryPath',
  MATERIAL_SET_LIBRARY_PATH: 'material:setLibraryPath',
  MATERIAL_REGENERATE_THUMBNAILS: 'material:regenerateThumbnails',
  MATERIAL_CAPTURE_FRAME: 'material:captureFrame',
  MATERIAL_OPEN_IN_FOLDER: 'material:openInFolder',

  MATERIAL_GROUP_LIST: 'materialGroup:list',
  MATERIAL_GROUP_CREATE: 'materialGroup:create',
  MATERIAL_GROUP_DELETE: 'materialGroup:delete',

  DIALOG_OPEN_FILE: 'dialog:openFile',
  BROWSER_OPEN_URL: 'browser:openUrl',
  ACCOUNT_OPEN_BROWSER: 'account:openBrowser',

  DASHBOARD_OVERVIEW: 'dashboard:overview',

  ACCOUNT_PUBLISH_PRESET_GET: 'accountPublishPreset:get',
  ACCOUNT_PUBLISH_PRESET_LIST: 'accountPublishPreset:list',
  ACCOUNT_PUBLISH_PRESET_SAVE: 'accountPublishPreset:save',
  ACCOUNT_PUBLISH_PRESET_DELETE: 'accountPublishPreset:delete',
} as const;

export interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function fail<T = never>(message: string): IpcResult<T> {
  return { success: false, message } as IpcResult<T>;
}

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    return fail(String(e));
  }
}

interface ThrottledPushState {
  queue: PublishEvent[];
  timer: ReturnType<typeof setTimeout> | null;
  lastFlush: number;
}

const THROTTLE_MS = 500;
const pushState: ThrottledPushState = { queue: [], timer: null, lastFlush: 0 };

function throttledPush(event: PublishEvent, window: BrowserWindow | null): void {
  pushState.queue.push(event);

  if (pushState.queue.length > 100) {
    pushState.queue.splice(0, pushState.queue.length - 100);
  }

  const now = Date.now();
  const elapsed = now - pushState.lastFlush;

  if (elapsed >= THROTTLE_MS) {
    flushToRenderer(window);
  } else if (!pushState.timer) {
    pushState.timer = setTimeout(() => {
      pushState.timer = null;
      flushToRenderer(window);
    }, THROTTLE_MS - elapsed);
  }
}

function flushToRenderer(window: BrowserWindow | null): void {
  pushState.lastFlush = Date.now();
  if (pushState.queue.length === 0) return;

  const batch = pushState.queue.splice(0);
  if (window && !window.isDestroyed()) {
    window.webContents.send('publish:status', batch);
  }
}

export interface PlatformInfo {
  platformId: string;
  config: PlatformConfig;
  capabilities: PlatformCapabilities;
}

export function registerIpcHandlers(): void {
  materialService.initialize().catch(err => {
    console.error('[MaterialService] 初始化失败:', err);
  });

  let mainWindow: BrowserWindow | null = null;

  const getMainWindow = (): BrowserWindow | null => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      const windows = BrowserWindow.getAllWindows();
      mainWindow = windows.length > 0 ? windows[0] : null;
    }
    return mainWindow;
  };

  const eventBus = EventBus.getInstance();
  eventBus.subscribe((event: PublishEvent) => {
    throttledPush(event, getMainWindow());
  });

  // ─── 账号管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.ACCOUNT_LIST, async (): Promise<IpcResult<Account[]>> => {
    return wrap(() => accountService.getAllAccounts());
  });

  ipcMain.handle(CHANNEL.ACCOUNT_ADD, async (_e, platform: string, groupId?: string): Promise<IpcResult<Account>> => {
    return wrap(() => accountService.bindAccount(platform, groupId));
  });

  ipcMain.handle(CHANNEL.ACCOUNT_REMOVE, async (_e, accountId: string): Promise<IpcResult> => {
    return wrap(async () => {
      await accountService.deleteAccount(accountId);
      return undefined;
    });
  });

  ipcMain.handle(CHANNEL.ACCOUNT_VALIDATE, async (_e, accountId: string): Promise<IpcResult<boolean>> => {
    return wrap(() => accountService.validateCookie(accountId));
  });

  // ─── 发布管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.PUBLISH_SUBMIT, async (_e, request: PublishRequest): Promise<IpcResult<PublishTask>> => {
    return wrap(() => publishService.createPublishTask(request));
  });

  ipcMain.handle(CHANNEL.PUBLISH_CANCEL, async (_e, taskId: string): Promise<IpcResult> => {
    return wrap(async () => {
      await publishService.cancelPublish(taskId);
      return undefined;
    });
  });

  ipcMain.handle(CHANNEL.PUBLISH_STATUS, async (_e, taskId: string): Promise<IpcResult<PublishTaskStatusDetail>> => {
    return wrap(() => publishService.getTaskStatus(taskId));
  });

  // ─── 任务管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.TASK_LIST, async (_e, contentId?: string): Promise<IpcResult<PublishTask[]>> => {
    return wrap(() => publishService.getContentTasks(contentId ?? ''));
  });

  ipcMain.handle(CHANNEL.TASK_RETRY, async (_e, taskId: string): Promise<IpcResult<PublishResult>> => {
    return wrap(() => publishService.executeNow(taskId));
  });

  ipcMain.handle(CHANNEL.TASK_REPUBLISH, async (_e, taskId: string): Promise<IpcResult<PublishTask>> => {
    return wrap(() => publishService.republishTask(taskId));
  });

  ipcMain.handle(CHANNEL.TASK_BATCH_RETRY, async (_e, taskIds: string[]): Promise<IpcResult<void>> => {
    return wrap(async () => {
      await publishService.batchRetry(taskIds);
    });
  });

  ipcMain.handle(CHANNEL.TASK_BATCH_CANCEL, async (_e, taskIds: string[]): Promise<IpcResult<void>> => {
    return wrap(async () => {
      await publishService.batchCancel(taskIds);
    });
  });

  ipcMain.handle(CHANNEL.TASK_BATCH_DELETE, async (_e, taskIds: string[]): Promise<IpcResult<void>> => {
    return wrap(async () => {
      await publishService.batchDelete(taskIds);
    });
  });

  // ─── 草稿管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.DRAFT_SAVE, async (_e, { snapshot, existingId }: { snapshot: any; existingId?: string }): Promise<IpcResult<any>> => {
    return wrap(async () => {
      return draftService.saveDraft(snapshot, existingId);
    });
  });

  ipcMain.handle(CHANNEL.DRAFT_GET, async (_e, { id }: { id: string }): Promise<IpcResult<any>> => {
    return wrap(async () => { const d = draftService.getDraft(id); if (!d) throw new Error('草稿不存在'); return d; });
  });

  ipcMain.handle(CHANNEL.DRAFT_DELETE, async (_e, { id }: { id: string }): Promise<IpcResult<void>> => {
    return wrap(async () => {
      await draftService.deleteDraft(id);
    });
  });

  ipcMain.handle(CHANNEL.DRAFT_PUBLISH, async (_e, { id }: { id: string }): Promise<IpcResult<void>> => {
    return wrap(async () => {
      await draftService.publishDraft(id);
    });
  });

  ipcMain.handle(CHANNEL.DRAFT_REVOKE, async (_e, { id }: { id: string }): Promise<IpcResult<void>> => {
    return wrap(async () => {
      await draftService.revokeDraft(id);
    });
  });

  ipcMain.handle(CHANNEL.DRAFT_LIST, async (_e, { filter }: { filter?: any }): Promise<IpcResult<any[]>> => {
    return wrap(async () => draftService.listDrafts(filter));
  });

  // ─── 平台管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.PLATFORM_LIST, async (): Promise<IpcResult<PlatformInfo[]>> => {
    const adapters = PlatformRegistry.getAllAdapters();
    const infos: PlatformInfo[] = adapters.map((a) => ({
      platformId: a.platformId,
      config: a.config,
      capabilities: a.capabilities,
    }));
    return ok(infos);
  });

  ipcMain.handle(CHANNEL.PLATFORM_LOGIN, async (_e, accountId: string): Promise<IpcResult<CookieResult>> => {
    return wrap(async () => {
      const account = await accountService.getAccount(accountId);
      if (!account) throw new Error('账号不存在');
      const adapter = PlatformRegistry.getAdapter(account.platform);
      if (!adapter) throw new Error(`平台 ${account.platform} 未注册`);

      const result = await adapter.login(accountId, false, {
        force: true,
        onLoginConfirmed: () => {
          const db = getDatabase();
          const now = new Date().toISOString();
          db.prepare(
            `UPDATE accounts SET cookie_valid = 1, status = 'active', last_login = ?, updated_at = ? WHERE id = ?`
          ).run(now, now, accountId);

          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('account:login-status', {
              status: 'online',
              accountId,
            });
          });
        },
      });

      if (result.success) {
        const db = getDatabase();
        const now = new Date().toISOString();
        db.prepare(
          `UPDATE accounts SET cookie_path = ?, cookie_valid = 1, status = 'active', last_login = ?, updated_at = ? WHERE id = ?`
        ).run(result.cookiePath || null, now, now, accountId);

        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('account:login-success', {
            accountId,
            platform: account.platform,
          });
        });
      }

      return result;
    });
  });

  // ─── 兼容旧频道 ────────────────────────────────────────

  ipcMain.handle(CHANNEL.ACCOUNTS_LIST, async () => {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as any[];
    const proxyMap = new Map<string, any>();
    try {
      const proxies = db.prepare('SELECT id, name, protocol, host, port FROM proxies').all() as any[];
      proxies.forEach(p => proxyMap.set(p.id, p));
    } catch {}
    const groupMap = new Map<string, any>();
    try {
      const groups = db.prepare('SELECT id, name, color FROM groups').all() as any[];
      groups.forEach(g => groupMap.set(g.id, g));
    } catch {}
    const accountGroupMap = new Map<string, string[]>();
    try {
      const ags = db.prepare('SELECT account_id, group_id FROM account_groups').all() as any[];
      ags.forEach((ag: any) => {
        const list = accountGroupMap.get(ag.account_id) || [];
        list.push(ag.group_id);
        accountGroupMap.set(ag.account_id, list);
      });
    } catch {}
    return rows.map(row => {
      const gids = accountGroupMap.get(row.id) || [];
      const gInfos = gids.map(gid => groupMap.get(gid)).filter(Boolean);
      return {
        id: row.id,
        platform: row.platform,
        nickname: row.nickname || row.name || '',
        avatar: row.avatar_url || row.avatar || undefined,
        cookieValid: row.cookie_valid === 1,
        lastLogin: row.last_login || undefined,
        groupId: row.group_id || undefined,
        fingerprintId: row.fingerprint_id || undefined,
        proxyId: row.proxy_id || undefined,
        browserMode: row.browser_mode || 'embedded',
        browser_mode: row.browser_mode || 'embedded',
        status: row.status === 'expired'
          ? 'expired'
          : row.cookie_valid === 1
            ? 'online'
            : 'offline',
        remark: row.remark || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        proxyInfo: row.proxy_id ? proxyMap.get(row.proxy_id) || null : null,
        groupIds: gids,
        groupInfos: gInfos,
        homepageUrl: row.homepage_url || undefined,
      };
    });
  });

  ipcMain.handle(CHANNEL.ACCOUNTS_CREATE, async (_e, data: { platform: string; groupId?: string }) => {
    try {
      const account = await accountService.bindAccount(data.platform, data.groupId);
      await seedDefaultPresetIfNeeded(account.id, account.platform);
      return { success: true, data: account };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.ACCOUNTS_DELETE, async (_e, id: string) => {
    try {
      await accountService.deleteAccount(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle('accounts:updateRemark', async (_e, id: string, remark: string) => {
    try {
      const db = getDatabase();
      db.prepare('UPDATE accounts SET remark = ?, updated_at = datetime(\'now\') WHERE id = ?').run(remark, id);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.ACCOUNTS_LOGIN, async (_e, accountId: string) => {
    try {
      const row = getDatabase().prepare(
        'SELECT platform, browser_mode FROM accounts WHERE id = ?'
      ).get(accountId) as { platform: string; browser_mode?: string | null } | undefined;
      if (!row) return { success: false, message: '账号不存在' };

      const rawBrowserMode = row.browser_mode || 'embedded';
      const browserType: BrowserType = rawBrowserMode === 'external_chrome'
        ? 'chrome'
        : rawBrowserMode === 'external_fingerprint'
          ? 'fingerprint'
          : rawBrowserMode === 'chrome' || rawBrowserMode === 'fingerprint'
            ? rawBrowserMode
            : 'embedded';

      const result = await startAccountLogin({
        platform: normalizePlatformId(row.platform),
        browserConfig: { type: browserType },
        existingAccountId: accountId,
      });
      return result.success
        ? { success: true }
        : { success: false, message: result.error || '重新登录失败' };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.ACCOUNTS_CHECK_COOKIE, async (_e, accountId: string) => {
    try {
      const valid = await accountService.validateCookie(accountId);
      return { success: true, valid };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.ACCOUNTS_GET_QR_CODE, async (_e, accountId: string) => {
    try {
      const account = await accountService.getAccount(accountId);
      if (!account) return { success: false, message: '账号不存在' };
      const adapter = PlatformRegistry.getAdapter(account.platform);
      if (!adapter) return { success: false, message: `平台 ${account.platform} 未注册` };
      const qrCode = await adapter.getQRCode(accountId);
      return { success: true, data: qrCode };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.CONTENT_LIST, async () => contentService.getAllContents());

  ipcMain.handle(CHANNEL.CONTENT_CREATE, async (_e, data: { filePath: string }) => {
    try {
      const content = await contentService.importContent(data.filePath);
      return { success: true, data: content };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.CONTENT_DELETE, async (_e, id: string) => {
    try {
      await contentService.deleteContent(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.CONTENT_UPDATE, async (_e, id: string, data: any) => {
    try {
      const updated = await contentService.updateContent(id, data);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.CONTENT_UPLOAD_VIDEO, async (_e, data: { filePath: string }) => {
    try {
      const content = await contentService.importContent(data.filePath);
      return { success: true, data: content };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.GROUPS_LIST, async () => groupService.getAllGroups());

  ipcMain.handle(CHANNEL.GROUPS_CREATE, async (_e, data: { name: string; description?: string; color?: string }) => {
    try {
      const group = await groupService.createGroup(data.name, data.description, data.color);
      return { success: true, data: group };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.GROUPS_UPDATE, async (_e, id: string, data: any) => {
    try {
      await groupService.updateGroup(id, data);
      if (Array.isArray(data.accountIds)) {
        await groupService.clearGroupAccounts(id);
        if (data.accountIds.length > 0) {
          await groupService.addAccountsToGroup(id, data.accountIds);
        }
      }
      const updated = await groupService.getGroup(id);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.GROUPS_DELETE, async (_e, id: string) => {
    try {
      await groupService.deleteGroup(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.GROUPS_SORT, async (_e, orderedIds: string[]) => {
    try {
      await groupService.sortGroups(orderedIds);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.GROUPS_BIND_ACCOUNTS, async (_e, groupId: string, accountIds: string[]) => {
    try {
      await groupService.addAccountsToGroup(groupId, accountIds);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.PUBLISH_CREATE_TASK, async (_e, data: PublishRequest) => {
    try {
      const request = { ...data };
      if (typeof request.scheduledAt === 'string') {
        (request as any).scheduledAt = new Date(request.scheduledAt);
      }
      const task = await publishService.createPublishTask(request as PublishRequest);

      const shouldAutoExecute = (request.metadata as Record<string, unknown> | undefined)?.autoExecute !== false;
      if (!request.scheduledAt && shouldAutoExecute) {
        publishService.executeNow(task.id).catch(err => {
          logger.error(`[PUBLISH_CREATE_TASK] 自动执行失败 taskId=${task.id}: ${err}`);
        });
      }

      return { success: true, data: task };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.PUBLISH_UPDATE_TASK, async (_e, taskId: string, data: any) => {
    try {
      await publishService.updateTask(taskId, data);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.PUBLISH_CANCEL_TASK, async (_e, taskId: string) => {
    try {
      await publishService.cancelPublish(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.PUBLISH_DELETE_TASK, async (_e, taskId: string) => {
    try {
      await publishService.deleteTask(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.PUBLISH_RETRY_TASK, async (_e, taskId: string) => {
    try {
      const result = await publishService.retryTask(taskId);
      if (!result.success) {
        return { success: false, data: result, message: result.error || '发布任务执行失败' };
      }
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.PUBLISH_LIST_TASKS, async (_e, filter?: TaskFilter) => {
    try {
      return await publishService.listTasks(filter ?? {});
    } catch (err) {
      logger.error(`[PUBLISH_LIST_TASKS] ${err}`);
      return { items: [], total: 0 };
    }
  });

  ipcMain.handle(CHANNEL.PLATFORMS_LIST, async () => PlatformRegistry.getSupportedPlatforms());

  ipcMain.handle(CHANNEL.PLATFORMS_GET_CONFIG, async (_e, platformId: string) => {
    const adapter = PlatformRegistry.getAdapter(platformId);
    return adapter?.config ?? null;
  });

  ipcMain.handle(CHANNEL.PLATFORMS_GET_CAPABILITIES, async (_e, platformId: string) => {
    const adapter = PlatformRegistry.getAdapter(platformId);
    return adapter?.capabilities ?? null;
  });

  ipcMain.handle(CHANNEL.SETTINGS_GET, async (_e, key: string) => {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT value FROM platform_configs WHERE key = ?');
      const row = stmt.get(key) as any;
      if (row?.value) {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      }
      return null;
    } catch {
      return null;
    }
  });

  ipcMain.handle(CHANNEL.SETTINGS_SET, async (_e, key: string, value: any) => {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO platform_configs (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);
      stmt.run(key, JSON.stringify(value));
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  // ─── App Info ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.APP_GET_VERSION, async () => {
    return process.env.npm_package_version || '0.0.0';
  });

  ipcMain.handle(CHANNEL.APP_GET_ELECTRON_VERSION, async () => {
    return process.versions.electron || '';
  });

  ipcMain.handle(CHANNEL.APP_GET_CHROME_VERSION, async () => {
    return process.versions.chrome || '';
  });

  ipcMain.handle(CHANNEL.APP_GET_BUILD_DATE, async () => {
    return process.env.BUILD_DATE || new Date().toISOString().split('T')[0];
  });

  ipcMain.handle(CHANNEL.STATS_OVERVIEW, async (_, { range }: { range?: string }) => {
    try {
      const days = range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : 90;
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      return await statsService.getOverviewStats({ start, end });
    } catch {
      return null;
    }
  });

  ipcMain.handle(CHANNEL.STATS_PLATFORM, async (_, { platform, range }: { platform: string; range?: string }) => {
    try {
      const days = range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : 90;
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      return await statsService.fetchPlatformStats(platform, { start, end });
    } catch {
      return null;
    }
  });

  ipcMain.handle(CHANNEL.STATS_TREND, async (_, { metric, range }: { metric?: string; range?: string }) => {
    try {
      const days = range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : 90;
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      return await statsService.getTrendData(metric || 'play_count', { start, end });
    } catch {
      return [];
    }
  });

  ipcMain.handle(CHANNEL.AI_PREPUBLISH_CHECK, async (_e, context: PrePublishContext) => {
    try {
      const aiService = getAIService();
      return await aiService.prePublishCheck(context);
    } catch (error) {
      logger.error('AI 预发布检查失败:', error);
      return {
        suggestions: [],
        checks: {
          scheduleReasonable: true,
          accountHealth: true,
          historicalDataAvailable: false,
          conflictsDetected: false,
        },
      };
    }
  });

  ipcMain.handle(CHANNEL.AI_OPTIMIZE_RULE, async (_e, context: RuleOptimizationContext) => {
    try {
      const aiService = getAIService();
      return await aiService.optimizeRule(context);
    } catch (error) {
      logger.error('AI 规则优化失败:', error);
      return { suggestions: [] };
    }
  });

  ipcMain.handle(CHANNEL.AI_GET_COST_SUMMARY, async () => {
    try {
      const aiService = getAIService();
      return aiService.getCostSummary();
    } catch {
      return { totalCost: 0, totalTokens: 0, records: [] };
    }
  });

  ipcMain.handle(CHANNEL.AI_GET_ALERTS, async (_e, accountId?: string) => {
    try {
      if (accountId) {
        return anomalyService.getAlertsByAccount(accountId);
      }
      return anomalyService.getActiveAlerts();
    } catch {
      return [];
    }
  });

  ipcMain.handle(CHANNEL.AI_DISMISS_ALERT, async (_e, alertId: string) => {
    return anomalyService.dismissAlert(alertId);
  });

  ipcMain.handle(CHANNEL.MONITOR_CREATE_PLAN, async (_e, plan: Omit<import('../services/MonitorService').MonitorPlan, 'id' | 'createdAt'>) => {
    try {
      return monitorService.createPlan(plan);
    } catch (error) {
      return { success: false, message: String(error) };
    }
  });

  ipcMain.handle(CHANNEL.MONITOR_UPDATE_PLAN, async (_e, id: string, updates: Partial<import('../services/MonitorService').MonitorPlan>) => {
    return monitorService.updatePlan(id, updates);
  });

  ipcMain.handle(CHANNEL.MONITOR_DELETE_PLAN, async (_e, id: string) => {
    return monitorService.deletePlan(id);
  });

  ipcMain.handle(CHANNEL.MONITOR_LIST_PLANS, async () => {
    return monitorService.getAllPlans();
  });

  ipcMain.handle(CHANNEL.MONITOR_GET_ALERTS, async () => {
    return monitorService.getActiveAlerts();
  });

  ipcMain.handle(CHANNEL.REPORT_GENERATE, async () => {
    try {
      return await weeklyReportService.generateReport();
    } catch (error) {
      return { success: false, message: String(error) };
    }
  });

  ipcMain.handle(CHANNEL.REPORT_GET_LATEST, async () => {
    return await weeklyReportService.getLatestReport();
  });

  ipcMain.handle(CHANNEL.PANEL_OPEN, async (_, { accountId }: { accountId: string }) => {
    const panel = await multiPanelService.openPanel(accountId);
    return panel ? ok(panel) : fail('打开面板失败');
  });

  ipcMain.handle(CHANNEL.PANEL_CLOSE, (_, { panelId }: { panelId: string }) => {
    multiPanelService.closePanel(panelId);
    return ok(null);
  });

  ipcMain.handle(CHANNEL.PANEL_FOCUS, (_, { panelId }: { panelId: string }) => {
    multiPanelService.focusPanel(panelId);
    return ok(null);
  });

  ipcMain.handle(CHANNEL.PANEL_LIST, () => {
    return ok(multiPanelService.getActivePanels());
  });

  ipcMain.handle(CHANNEL.PANEL_HIDE_ALL, () => {
    multiPanelService.hideAllPanels();
    return ok(null);
  });

  ipcMain.handle(CHANNEL.PANEL_SHOW_ALL, () => {
    multiPanelService.showAllPanels();
    return ok(null);
  });

  ipcMain.handle(CHANNEL.COMMENT_TEMPLATE_CREATE, async (_, data) => {
    const template = commentService.createTemplate(data);
    return ok(template);
  });

  ipcMain.handle(CHANNEL.COMMENT_TEMPLATE_UPDATE, async (_, { templateId, updates }) => {
    const template = commentService.updateTemplate(templateId, updates);
    return template ? ok(template) : fail('模板不存在');
  });

  ipcMain.handle(CHANNEL.COMMENT_TEMPLATE_DELETE, async (_, { templateId }) => {
    const success = commentService.deleteTemplate(templateId);
    return success ? ok(null) : fail('删除失败');
  });

  ipcMain.handle(CHANNEL.COMMENT_TEMPLATE_LIST, async (_, { platform }) => {
    return ok(commentService.listTemplates(platform));
  });

  ipcMain.handle(CHANNEL.COMMENT_SCHEDULE, async (_, { templateId, accountId, videoId }) => {
    const task = await commentService.scheduleComment(templateId, accountId, '', videoId);
    return task ? ok(task) : fail('创建评论任务失败');
  });

  ipcMain.handle(CHANNEL.COMMENT_EXECUTE, async (_, { taskId }) => {
    const success = await commentService.executeComment(taskId);
    return success ? ok(null) : fail('执行失败');
  });

  ipcMain.handle(CHANNEL.COMMENT_TASK_LIST, async () => {
    return ok([]);
  });

  ipcMain.handle(CHANNEL.LICENSE_STATUS, () => {
    return ok({
      valid: licenseService.validateLicense(),
      license: licenseService.getLicense(),
    });
  });

  ipcMain.handle(CHANNEL.LICENSE_ACTIVATE, async (_, { key, email }) => {
    const result = await licenseService.activateLicense(key, email);
    return result;
  });

  ipcMain.handle(CHANNEL.LICENSE_ACTIVATE_OFFLINE, async (_, { filePath }) => {
    const result = await licenseService.activateOffline(filePath);
    return result;
  });

  ipcMain.handle(CHANNEL.LICENSE_OFFLINE_REQUEST, async (_, { key, email }) => {
    const requestPath = licenseService.generateOfflineRequest(key, email);
    return ok(requestPath);
  });

  ipcMain.handle(CHANNEL.LICENSE_DEACTIVATE, () => {
    licenseService.deactivate();
    return ok(null);
  });

  ipcMain.handle(CHANNEL.PROXY_LIST, async () => {
    return wrap(() => proxyService.getAllProxies());
  });

  ipcMain.handle(CHANNEL.PROXY_GET, async (_, { id }: { id: string }) => {
    return wrap(() => proxyService.getProxyById(id));
  });

  ipcMain.handle(CHANNEL.PROXY_CREATE, async (_, data: { name: string; protocol: string; host: string; port: number; username?: string; password?: string }) => {
    return wrap(() => proxyService.createProxy(data));
  });

  ipcMain.handle(CHANNEL.PROXY_UPDATE, async (_, { id, data }: { id: string; data: any }) => {
    return wrap(() => proxyService.updateProxy(id, data));
  });

  ipcMain.handle(CHANNEL.PROXY_DELETE, async (_, { id }: { id: string }) => {
    return wrap(async () => {
      await proxyService.deleteProxy(id);
      return undefined;
    });
  });

  ipcMain.handle(CHANNEL.PROXY_CHECK, async (_, { id }: { id: string }) => {
    return wrap(() => proxyService.checkProxy(id));
  });

  ipcMain.handle(CHANNEL.PROXY_BATCH_CHECK, async (_, { ids }: { ids: string[] }) => {
    return wrap(() => proxyService.batchCheck(ids));
  });

  ipcMain.handle(CHANNEL.PROXY_IMPORT, async (_, { content, format }: { content: string; format: 'csv' | 'txt' }) => {
    return wrap(() => proxyService.importProxies(content, format));
  });

  ipcMain.handle(CHANNEL.PROXY_EXPORT, async (_, { scope, ids }: { scope: 'all' | 'available' | 'selected'; ids?: string[] }) => {
    return wrap(() => proxyService.exportProxies(scope, ids));
  });

  ipcMain.handle(CHANNEL.PROXY_GET_BOUND_ACCOUNTS, async (_, { proxyId }: { proxyId: string }) => {
    return wrap(() => proxyService.getBoundAccounts(proxyId));
  });

  ipcMain.handle(CHANNEL.PROXY_SET_ACCOUNTS, async (_, { proxyId, accountIds }: { proxyId: string; accountIds: string[] }) => {
    return wrap(async () => {
      await proxyService.setAccounts(proxyId, accountIds);
      return undefined;
    });
  });

  ipcMain.handle(CHANNEL.PROXY_UNBIND_ACCOUNT, async (_, { proxyId, accountId }: { proxyId: string; accountId: string }) => {
    return wrap(async () => {
      await proxyService.unbindAccount(proxyId, accountId);
      return undefined;
    });
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_LIST, async () => {
    const result = await fingerprintTemplateRepo.findAll();
    return ok(result.data);
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_GET, async (_, { id }: { id: string }) => {
    return wrap(() => fingerprintTemplateRepo.findById(id));
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_CREATE, async (_, data: any) => {
    return wrap(() => fingerprintTemplateRepo.insert(data));
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_UPDATE, async (_, { id, data }: { id: string; data: any }) => {
    return wrap(() => fingerprintTemplateRepo.update(id, data));
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_DELETE, async (_, { id }: { id: string }) => {
    return wrap(() => fingerprintTemplateRepo.deleteById(id));
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_GENERATE_SEED, async () => {
    return ok(generateFingerprintSeed());
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_GET_DEFAULTS, async () => {
    return ok(createDefaultTemplate());
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_GENERATE_HARDWARE, async (_, { seed, platform, brand }: { seed: number; platform: string; brand?: string }) => {
    return ok(generateHardwareFromSeed(seed, platform as 'windows' | 'linux' | 'macos', brand as 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi' | undefined));
  });

  ipcMain.handle(CHANNEL.FINGERPRINT_GENERATE_FROM_SEED, async (_, { seed }: { seed: number }) => {
    return ok(generateTemplateFromSeed(seed));
  });

  ipcMain.handle(CHANNEL.IP_LIMIT_GET, async () => {
    const service = getIPLimitSettingsService();
    const settings = await service.load();
    return ok(settings);
  });

  ipcMain.handle(CHANNEL.IP_LIMIT_SAVE, async (_, settings: Record<string, unknown>) => {
    const service = getIPLimitSettingsService();
    await service.save(settings as any);
    return ok(null);
  });

  ipcMain.handle(CHANNEL.IP_LIMIT_CHECK, async (_, { platform }: { platform: string }) => {
    const service = getIPLimitSettingsService();
    const limit = service.getLimit(platform);
    const accounts = await accountService.getAllAccounts();
    const platformAccounts = accounts.filter((a: Account) => a.platform === platform);
    return ok({
      platformCount: platformAccounts.length,
      platformLimit: limit,
      exceeded: platformAccounts.length >= limit,
    });
  });

  ipcMain.handle(CHANNEL.ACCOUNT_SET_FINGERPRINT, async (_, { accountId, fingerprintId }: { accountId: string; fingerprintId: string | null }) => {
    return wrap(async () => {
      await accountService.setFingerprint(accountId, fingerprintId);
      return undefined;
    });
  });

  ipcMain.handle(CHANNEL.ACCOUNT_SET_PROXY, async (_, { accountId, proxyId }: { accountId: string; proxyId: string | null }) => {
    return wrap(async () => {
      await accountService.setProxy(accountId, proxyId);
      return undefined;
    });
  });

  ipcMain.handle('accounts:setGroup', async (_, { accountId, groupId, action }: { accountId: string; groupId: string; action: 'add' | 'remove' }) => {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      if (action === 'remove') {
        db.prepare('DELETE FROM account_groups WHERE account_id = ? AND group_id = ?').run(accountId, groupId);
        const row = db.prepare('SELECT group_id FROM accounts WHERE id = ?').get(accountId) as { group_id: string | null } | undefined;
        if (row?.group_id === groupId) {
          db.prepare('UPDATE accounts SET group_id = NULL, updated_at = ? WHERE id = ?').run(now, accountId);
        }
      } else {
        db.prepare('INSERT OR IGNORE INTO account_groups (account_id, group_id) VALUES (?, ?)').run(accountId, groupId);
        db.prepare('UPDATE accounts SET group_id = ?, updated_at = ? WHERE id = ?').run(groupId, now, accountId);
      }
      return { success: true };
    } catch (error) {
      return { success: false, message: `${error}` };
    }
  });

  ipcMain.handle(CHANNEL.UPDATE_CHECK, async () => {
    const status = await autoUpdaterService.checkForUpdates();
    return ok(status);
  });

  ipcMain.handle(CHANNEL.UPDATE_DOWNLOAD, async () => {
    await autoUpdaterService.downloadUpdate();
    return ok(null);
  });

  ipcMain.handle(CHANNEL.UPDATE_INSTALL, async () => {
    await autoUpdaterService.installUpdate();
    return ok(null);
  });

  ipcMain.handle(CHANNEL.UPDATE_GET_STATUS, () => {
    return ok(autoUpdaterService.getStatus());
  });

  // ─── 数据管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.DATA_CREATE_BACKUP, async (): Promise<IpcResult<BackupInfo>> => {
    return wrap(async () => createBackup());
  });

  ipcMain.handle(CHANNEL.DATA_LIST_BACKUPS, async (): Promise<IpcResult<BackupInfo[]>> => {
    return wrap(async () => listBackups());
  });

  ipcMain.handle(CHANNEL.DATA_RESTORE_BACKUP, async (_e, backupId: string): Promise<IpcResult<null>> => {
    return wrap(async () => { restoreBackup(backupId); return null; });
  });

  ipcMain.handle(CHANNEL.DATA_DELETE_BACKUP, async (_e, backupId: string): Promise<IpcResult<null>> => {
    return wrap(async () => { deleteBackup(backupId); return null; });
  });

  ipcMain.handle(CHANNEL.DATA_CLEAR, async (_e, type: 'logs' | 'cache' | 'all'): Promise<IpcResult<null>> => {
    return wrap(async () => { clearData(type); return null; });
  });

  ipcMain.handle(CHANNEL.NOTIFICATION_GET_PREFERENCES, async () => {
    return ok(notificationService.getPreferences());
  });

  ipcMain.handle(CHANNEL.NOTIFICATION_UPDATE_PREFERENCES, async (_e, prefs: Record<string, unknown>) => {
    return ok(notificationService.updatePreferences(prefs));
  });

  ipcMain.handle(CHANNEL.NOTIFICATION_TEST, async () => {
    notificationService.sendTest();
    return ok(null);
  });

  ipcMain.handle(CHANNEL.PUBLISH_PRE_CHECK, async (_e, request: BatchPublishRequest) => {
    return wrap(() => publishService.preCheckAccounts(request));
  });

  ipcMain.handle(CHANNEL.PLATFORM_COVER_RATIOS, async (_e, platformId: string) => {
    const adapter = PlatformRegistry.getAdapter(platformId);
    return adapter?.capabilities?.coverRatios ?? [];
  });

  ipcMain.handle(CHANNEL.PUBLISH_HISTORY, async (_e, filters: { platform?: string; accountId?: string; startDate?: string; endDate?: string }) => {
    return wrap(() => publishService.getPublishHistory(filters));
  });

  // ─── 原生对话框 ──────────────────────────────────────

  ipcMain.handle(CHANNEL.DIALOG_OPEN_FILE, async (_e, options?: { title?: string; properties?: string[]; filters?: Electron.FileFilter[] }) => {
    const win = getMainWindow();
    const props = (options?.properties ?? ['openFile']) as Electron.OpenDialogOptions['properties'];
    const result = await dialog.showOpenDialog(win!, {
      title: options?.title,
      properties: props,
      filters: options?.filters,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths.length === 1 ? result.filePaths[0] : result.filePaths;
  });

  ipcMain.handle(CHANNEL.BROWSER_OPEN_URL, async (_e, url: string): Promise<IpcResult<null>> => {
    let chromePath: string | null = null;

    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT value FROM platform_configs WHERE key = ?');
      const row = stmt.get('chromePath') as any;
      if (row?.value) {
        try {
          chromePath = JSON.parse(row.value);
        } catch {
          chromePath = row.value;
        }
      }
    } catch {
    }

    if (!chromePath || !fs.existsSync(chromePath)) {
      const defaultPath = (() => {
        switch (process.platform) {
          case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
          case 'win32': return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
          case 'linux': return '/usr/bin/google-chrome';
          default: return '';
        }
      })();

      if (defaultPath && fs.existsSync(defaultPath)) {
        chromePath = defaultPath;
      }
    }

    if (chromePath && fs.existsSync(chromePath)) {
      try {
        execFile(chromePath, [url]);
        return { success: true };
      } catch (e) {
        return { success: false, message: `启动 Chrome 失败: ${e}` };
      }
    }

    return { success: false, message: 'Chrome 浏览器路径未配置，请在系统设置中配置' };
  });

  // ─── 素材管理 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.MATERIAL_LIST, async (_e, query?: ListQuery): Promise<IpcResult<ListResult>> => {
    return wrap(() => materialService.listMaterials(query));
  });

  ipcMain.handle(CHANNEL.MATERIAL_GET, async (_e, id: string): Promise<IpcResult<Material | null>> => {
    return wrap(() => materialService.getMaterial(id));
  });

  ipcMain.handle(CHANNEL.MATERIAL_UPLOAD, async (_e, payload: { filePath: string; groupId?: string; title?: string; description?: string }): Promise<IpcResult<Material>> => {
    return wrap(() => materialService.uploadMaterial(payload));
  });

  ipcMain.handle(CHANNEL.MATERIAL_DELETE, async (_e, id: string): Promise<IpcResult<void>> => {
    return wrap(async () => { await materialService.deleteMaterial(id); });
  });

  ipcMain.handle(CHANNEL.MATERIAL_BATCH_DELETE, async (_e, ids: string[]): Promise<IpcResult<BatchDeleteResult>> => {
    return wrap(() => materialService.deleteMaterials(ids));
  });

  ipcMain.handle(CHANNEL.MATERIAL_DOWNLOAD, async (_e, ids: string[], targetDir: string): Promise<IpcResult<void>> => {
    return wrap(async () => { await materialService.downloadMaterials(ids, targetDir); });
  });

  ipcMain.handle(CHANNEL.MATERIAL_MOVE_TO_GROUP, async (_e, ids: string[], groupId: string | null): Promise<IpcResult<{ success: string[]; failed: string[] }>> => {
    return wrap(() => materialService.moveToGroup(ids, groupId));
  });

  ipcMain.handle(CHANNEL.MATERIAL_GET_LIBRARY_PATH, async (): Promise<IpcResult<string>> => {
    return ok(materialService.getMaterialLibraryPath());
  });

  ipcMain.handle(CHANNEL.MATERIAL_SET_LIBRARY_PATH, async (_e, path: string): Promise<IpcResult<void>> => {
    return wrap(async () => { await materialService.setMaterialLibraryPath(path); });
  });

  ipcMain.handle(CHANNEL.MATERIAL_REGENERATE_THUMBNAILS, async (): Promise<IpcResult<{ success: number; failed: number }>> => {
    return wrap(() => materialService.regenerateThumbnails());
  });

  ipcMain.handle(CHANNEL.MATERIAL_CAPTURE_FRAME, async (_e, payload: { filePath: string; timestamp?: string }): Promise<IpcResult<{ imagePath: string }>> => {
    return wrap(async () => {
      const { spawn } = await import('child_process');
      const path = await import('path');
      const fs = await import('fs');
      const os = await import('os');

      const videoPath = payload.filePath;
      const timestamp = payload.timestamp || '00:00:00';
      const outputPath = path.join(os.tmpdir(), `matrixflow_capture_${Date.now()}.jpg`);

      return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-y',
          '-ss', timestamp,
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          outputPath,
        ]);

        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
          if (code !== 0) {
            return reject(new Error(`ffmpeg 退出码 ${code}: ${stderr}`));
          }
          if (fs.existsSync(outputPath)) {
            resolve({ imagePath: outputPath });
          } else {
            reject(new Error('截帧图片未生成'));
          }
        });

        proc.on('error', (err) => reject(new Error(`ffmpeg 启动失败: ${err.message}`)));
      });
    });
  });

  ipcMain.handle(CHANNEL.MATERIAL_OPEN_IN_FOLDER, async (_e, filePath: string): Promise<IpcResult<void>> => {
    return wrap(async () => {
      const { shell } = await import('electron');
      await shell.showItemInFolder(filePath);
    });
  });

  // ─── 素材分组 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.MATERIAL_GROUP_LIST, async (): Promise<IpcResult<MaterialGroup[]>> => {
    return wrap(() => materialService.listGroups());
  });

  ipcMain.handle(CHANNEL.MATERIAL_GROUP_CREATE, async (_e, name: string, color?: string): Promise<IpcResult<MaterialGroup>> => {
    return wrap(() => materialService.createGroup(name, color));
  });

  ipcMain.handle(CHANNEL.MATERIAL_GROUP_DELETE, async (_e, id: string): Promise<IpcResult<void>> => {
    return wrap(async () => { await materialService.deleteGroup(id); });
  });

  // ─── AI 风险检测设置 ──────────────────────────────────────

  ipcMain.handle('ai-risk:getSettings', async () => {
    const service = getAIRiskSettingsService();
    return service.get();
  });

  ipcMain.handle('ai-risk:updateSettings', async (_, settings: any) => {
    const service = getAIRiskSettingsService();
    await service.save(settings);
    return { success: true };
  });

  ipcMain.handle('ai-risk:assess', async (_, context: RiskContext) => {
    const service = getAIRiskSettingsService();
    return service.assess(context);
  });

  // ─── 账号浏览器 ──────────────────────────────────────────

  ipcMain.handle(CHANNEL.ACCOUNT_OPEN_BROWSER, async (_e, accountId: string, url: string): Promise<IpcResult<null>> => {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT platform, browser_mode, fingerprint_id FROM accounts WHERE id = ?').get(accountId) as any;
      if (!row) return { success: false, message: '账号不存在' };

      const rawBrowserMode = row.browser_mode || 'embedded';
      const browserMode = rawBrowserMode === 'external_chrome'
        ? 'chrome'
        : rawBrowserMode === 'external_fingerprint'
          ? 'fingerprint'
          : rawBrowserMode;

      const platform = normalizePlatformId(row.platform || 'kuaishou');
      if (browserMode === 'embedded') {
        const cookieConfig = PLATFORM_COOKIE_CONFIGS[platform];
        if (cookieConfig) {
          const partition = `persist:${accountId}`;
          const ses = electronSession.fromPartition(partition);
          const nowSec = Date.now() / 1000;

          let hasValidCookies = false;
          for (const domain of cookieConfig.domains) {
            const cookies = await ses.cookies.get({ domain });
            const unexpired = cookies.filter(c => !c.expirationDate || c.expirationDate > nowSec);
            if (cookieConfig.requiredCookies.every(name => unexpired.some(c => c.name === name))) {
              hasValidCookies = true;
              break;
            }
          }

          if (!hasValidCookies) {
            return { success: false, message: '账号登录态已过期，请重新登录' };
          }
        }

        const { browserManager } = await import('../services/embedded-browser/browser-manager');
        if (browserManager.hasTab(accountId) && !browserManager.hasStandaloneTab(accountId)) {
          await browserManager.closeTab(accountId);
        }

        if (browserManager.hasTab(accountId)) {
          const view = browserManager.getView(accountId);
          if (view) {
            if (url) {
              await view.webContents.loadURL(url);
            }
            browserManager.switchTab(accountId);
            return { success: true };
          }
        }

        await browserManager.createTab(accountId, platform, url);
        return { success: true };
      }

      if (browserMode === 'chrome') {
        let chromePath: string | null = null;
        try {
          const stmt = db.prepare('SELECT value FROM platform_configs WHERE key = ?');
          const cfgRow = stmt.get('chromePath') as any;
          if (cfgRow?.value) {
            try { chromePath = JSON.parse(cfgRow.value); } catch { chromePath = cfgRow.value; }
          }
        } catch {}
        if (!chromePath || !fs.existsSync(chromePath)) {
          const defaults: Record<string, string> = {
            darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            linux: '/usr/bin/google-chrome',
          };
          const d = defaults[process.platform];
          if (d && fs.existsSync(d)) chromePath = d;
        }
        if (chromePath && fs.existsSync(chromePath)) {
          const userDataDir = path.join(process.cwd(), 'storage', 'browser_data', 'chrome', accountId);
          fs.mkdirSync(userDataDir, { recursive: true });
          execFile(chromePath, [`--user-data-dir=${userDataDir}`, url]);
          return { success: true };
        }
        return { success: false, message: '未找到 Chrome 浏览器' };
      }

      if (browserMode === 'fingerprint') {
        const fingerprintId = row.fingerprint_id;
        if (!fingerprintId) return { success: false, message: '账号未绑定指纹浏览器配置' };

        let entry = accountBrowserContexts.get(accountId);
        if (!entry) {
          const launcher = createBrowserLauncher({ type: 'fingerprint', fingerprintId });
          const context = await launcher.launch({ type: 'fingerprint', fingerprintId }, accountId);
          entry = { launcher, context };
          accountBrowserContexts.set(accountId, entry);
        }

        const pages = entry.context.pages();
        const page = pages[0] || await entry.context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return { success: true };
      }

      return { success: false, message: `未知浏览器类型: ${rawBrowserMode}` };
    } catch (e) {
      return { success: false, message: `打开浏览器失败: ${e}` };
    }
  });

  // ─── 仪表盘总览 ──────────────────────────────────────────

  function formatRelativeTime(dateStr: string): string {
    if (!dateStr) return '未知';
    const createdDate = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    const diffMs = Date.now() - createdDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return dateStr.slice(0, 10);
  }

  function platformLabel(platform: string): string {
    const labels: Record<string, string> = {
      douyin: '抖音', xiaohongshu: '小红书', channels: '视频号', kuaishou: '快手',
      weixin: '视频号', weixin_video: '视频号',
    };
    return labels[platform] || platform;
  }

  ipcMain.handle(CHANNEL.DASHBOARD_OVERVIEW, async (): Promise<IpcResult<{
    accountCount: number;
    onlineCount: number;
    contentCount: number;
    aiScore: number;
    aiInsightCount: number;
    weekTrend: number[];
    trendDates: string[];
    recentTasks: Array<{
      id: string;
      platform: string;
      accountName: string;
      title: string;
      status: string;
      time: string;
    }>;
    activities: Array<{
      desc: string;
      time: string;
      color: string;
      type: string;
    }>;
  }>> => {
    return wrap(async () => {
      const db = getDatabase();

      const accRow = db.prepare(
        'SELECT COUNT(*) as total, SUM(CASE WHEN cookie_valid = 1 THEN 1 ELSE 0 END) as online FROM accounts'
      ).get() as { total: number; online: number };

      const contentRow = db.prepare(
        `SELECT COUNT(DISTINCT content_id) as total FROM publish_tasks
         WHERE status IN ('pending', 'scheduled', 'running')`
      ).get() as { total: number };

      let aiScore = 100;
      try {
        const alerts = await anomalyService.getActiveAlerts();
        aiScore = Math.max(50, 100 - alerts.length * 5);
      } catch { /* use default */ }

      let aiInsightCount = 0;
      try {
        const insights = await anomalyService.getActiveAlerts();
        aiInsightCount = insights.length;
      } catch { /* use default */ }

      const trendDates: string[] = [];
      const weekTrend: number[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        trendDates.push(`${dateStr.slice(5)} (${dayNames[d.getDay()]})`);

        const row = db.prepare(
          `SELECT COUNT(*) as cnt FROM publish_tasks WHERE date(created_at) = ?`
        ).get(dateStr) as { cnt: number };
        weekTrend.push(row?.cnt ?? 0);
      }

      const taskRows = db.prepare(
        `SELECT pt.id, pt.platform, pt.account_id, pt.title, pt.status, pt.created_at,
                acc.nickname
         FROM publish_tasks pt
         LEFT JOIN accounts acc ON pt.account_id = acc.id
         ORDER BY pt.created_at DESC
         LIMIT 8`
      ).all() as Array<{
        id: string; platform: string; account_id: string | null;
        title: string; status: string; created_at: string;
        nickname: string | null;
      }>;

      const recentTasks = taskRows.map((row) => ({
        id: row.id,
        platform: row.platform,
        accountName: row.nickname || row.account_id || '未知账号',
        title: row.title || '(无标题)',
        status: row.status,
        time: formatRelativeTime(row.created_at),
      }));

      const activities: Array<{ desc: string; time: string; color: string; type: string }> = [];

      const successRows = db.prepare(
        `SELECT pt.platform, pt.title, acc.nickname, pt.completed_at
         FROM publish_tasks pt
         LEFT JOIN accounts acc ON pt.account_id = acc.id
         WHERE pt.status = 'completed'
         ORDER BY pt.completed_at DESC
         LIMIT 5`
      ).all() as Array<{ platform: string; title: string; nickname: string | null; completed_at: string }>;

      for (const row of successRows) {
        activities.push({
          desc: `${platformLabel(row.platform)}账号「${row.nickname || '未知'}」发布「${row.title || '(无标题)'}」成功`,
          time: formatRelativeTime(row.completed_at),
          color: 'var(--color-success)',
          type: 'publish_success',
        });
      }

      const expiredRows = db.prepare(
        `SELECT id, platform, nickname, updated_at
         FROM accounts
         WHERE cookie_valid = 0 AND status = 'expired'
         ORDER BY updated_at DESC
         LIMIT 3`
      ).all() as Array<{ id: string; platform: string; nickname: string; updated_at: string }>;

      for (const row of expiredRows) {
        activities.push({
          desc: `${platformLabel(row.platform)}账号「${row.nickname || row.id}」Cookie 已过期，请重新授权`,
          time: formatRelativeTime(row.updated_at),
          color: 'var(--color-warning)',
          type: 'cookie_expired',
        });
      }

      const newAccountRows = db.prepare(
        `SELECT id, platform, nickname, created_at
         FROM accounts
         ORDER BY created_at DESC
         LIMIT 3`
      ).all() as Array<{ id: string; platform: string; nickname: string; created_at: string }>;

      const sevenDayAgo = Date.now() - 7 * 86400000;
      for (const row of newAccountRows) {
        const createdMs = new Date(row.created_at + 'Z').getTime();
        if (createdMs > sevenDayAgo) {
          activities.push({
            desc: `${platformLabel(row.platform)}账号「${row.nickname || row.id}」已添加成功`,
            time: formatRelativeTime(row.created_at),
            color: 'var(--color-primary)',
            type: 'account_added',
          });
        }
      }

      const queuedRows = db.prepare(
        `SELECT pt.platform, pt.title, acc.nickname, pt.created_at
         FROM publish_tasks pt
         LEFT JOIN accounts acc ON pt.account_id = acc.id
         WHERE pt.status IN ('pending', 'scheduled')
         ORDER BY pt.created_at DESC
         LIMIT 3`
      ).all() as Array<{ platform: string; title: string; nickname: string | null; created_at: string }>;

      for (const row of queuedRows) {
        activities.push({
          desc: `内容「${row.title || '(无标题)'}」已加入 ${platformLabel(row.platform)} 发布队列`,
          time: formatRelativeTime(row.created_at),
          color: 'var(--color-accent)',
          type: 'queue_added',
        });
      }

      activities.sort((a, b) => a.time.localeCompare(b.time));

      return {
        accountCount: accRow?.total ?? 0,
        onlineCount: accRow?.online ?? 0,
        contentCount: contentRow?.total ?? 0,
        aiScore,
        aiInsightCount,
        weekTrend,
        trendDates,
        recentTasks,
        activities: activities.slice(0, 20),
      };
    });
  });

  ipcMain.handle(CHANNEL.ACCOUNT_PUBLISH_PRESET_GET, async (_e, { accountId, platform }: { accountId: string; platform: string }): Promise<IpcResult<PublishPreset | null>> => {
    return wrap(() => accountPublishPresetService.getPreset(accountId, platform));
  });

  ipcMain.handle(CHANNEL.ACCOUNT_PUBLISH_PRESET_LIST, async (_e, { accountId }: { accountId: string }): Promise<IpcResult<PublishPreset[]>> => {
    return wrap(() => accountPublishPresetService.listPresetsByAccount(accountId));
  });

  ipcMain.handle(CHANNEL.ACCOUNT_PUBLISH_PRESET_SAVE, async (_e, payload: SavePublishPresetInput): Promise<IpcResult<PublishPreset>> => {
    return wrap(() => accountPublishPresetService.upsertPreset(payload));
  });

  ipcMain.handle(CHANNEL.ACCOUNT_PUBLISH_PRESET_DELETE, async (_e, { accountId, platform }: { accountId: string; platform: string }): Promise<IpcResult<boolean>> => {
    return wrap(() => accountPublishPresetService.deletePreset(accountId, platform));
  });

  logger.info('IPC 处理器已注册');
}

async function seedDefaultPresetIfNeeded(accountId: string, platform: string): Promise<void> {
  const existing = await accountPublishPresetService.getPreset(accountId, platform);
  if (existing) return;
  if (platform !== 'channels') return;
  try {
    await accountPublishPresetService.upsertPreset({
      accountId,
      platform,
      defaultTopics: [],
      platformOptions: { declaration: 'original' },
      enabled: false,
    });
    logger.info(`已为视频号账号预填声明原创 preset(默认未启用): accountId=${accountId}`);
  } catch (e) {
    logger.warn(`预填视频号 preset 失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
