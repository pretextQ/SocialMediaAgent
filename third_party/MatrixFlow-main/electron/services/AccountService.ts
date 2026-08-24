import * as crypto from 'crypto';
import { session as electronSession, BrowserWindow } from 'electron';
import { Logger } from '../core/Logger';
import { EventBus } from '../core/EventBus';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import { PlatformRegistry } from '../platform/base/PlatformRegistry';
import type { PlatformAdapter } from '../platform/base/interfaces';
import { validateChannelsCookieSession } from '../platform/channels/login-detection';
import { normalizePlatformId } from './platform-normalizer';
import type {
  Account,
  AccountRow,
  AccountStatus,
  IAccountService,
  LoginStatus,
  QRLoginSession,
  AccountBoundPayload,
  AccountStatusPayload,
  CookieValidatedPayload,
  GroupChangedPayload,
} from './types/account';
import { AccountEvent } from './types/account';

const logger = new Logger('AccountService');

const ACTIVE_LOGIN_SESSIONS = new Map<string, QRLoginSession>();

const COOKIE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const QR_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export class AccountService implements IAccountService {
  private static instance: AccountService;
  private cookieCheckTimer: ReturnType<typeof setInterval> | null = null;
  private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): AccountService {
    if (!AccountService.instance) {
      AccountService.instance = new AccountService();
    }
    return AccountService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.ensureSchema();
    this.startCookiePeriodicCheck();
    this.startSessionCleanup();

    this.initialized = true;
    logger.info('账号管理服务初始化完成');
  }

  dispose(): void {
    if (this.cookieCheckTimer) {
      clearTimeout(this.cookieCheckTimer as unknown as ReturnType<typeof setTimeout>);
      this.cookieCheckTimer = null;
    }
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
    }
    ACTIVE_LOGIN_SESSIONS.clear();
    this.initialized = false;
    logger.info('账号管理服务已释放');
  }

  // ─── 账号绑定 ──────────────────────────────────────────

  async bindAccount(platform: string, groupId?: string): Promise<Account> {
    const normalizedPlatform = normalizePlatformId(platform);
    const adapter = this.requireAdapter(normalizedPlatform);

    const sessionId = crypto.randomUUID();
    const session: QRLoginSession = {
      sessionId,
      platform: normalizedPlatform,
      groupId,
      startedAt: new Date(),
      status: 'waiting',
    };

    ACTIVE_LOGIN_SESSIONS.set(sessionId, session);

    try {
      const qrPath = await adapter.getQRCode(sessionId);
      session.qrPath = qrPath;

      const eventBus = EventBus.getInstance();
      eventBus.emit(AccountEvent.LOGIN_STATUS_UPDATED, {
        sessionId,
        status: 'waiting',
        qrPath,
      });

      logger.info(`扫码会话已创建: sessionId=${sessionId}, platform=${normalizedPlatform}`);

      const loginResult = await adapter.login(sessionId, false);

      if (!loginResult.success) {
        session.status = 'error';
        ACTIVE_LOGIN_SESSIONS.delete(sessionId);
        throw new Error(`登录失败: ${loginResult.message}`);
      }

      session.status = 'confirmed';
      ACTIVE_LOGIN_SESSIONS.delete(sessionId);

      const accountId = crypto.randomUUID();
      const now = new Date().toISOString();

      const db = this.requireDatabase();
      db.prepare(
        `INSERT INTO accounts (id, platform, nickname, avatar_url, cookie_path, cookie_valid, last_login, group_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'active', ?, ?)`
      ).run(
        accountId,
        normalizedPlatform,
        loginResult.nickname || `账号-${accountId.slice(0, 8)}`,
        loginResult.avatarUrl || null,
        loginResult.cookiePath || '',
        now,
        groupId ?? null,
        now,
        now
      );

      const account = await this.getAccount(accountId);

      const payload: AccountBoundPayload = { accountId, platform: normalizedPlatform, groupId };
      EventBus.getInstance().emit(AccountEvent.ACCOUNT_BOUND, payload);

      logger.info(`账号绑定成功: accountId=${accountId}, platform=${normalizedPlatform}`);
      return account!;
    } catch (err) {
      session.status = 'error';
      ACTIVE_LOGIN_SESSIONS.delete(sessionId);
      logger.error(`账号绑定失败: platform=${platform}`, err);
      throw err;
    }
  }

  async getQRCode(platform: string): Promise<string> {
    const normalizedPlatform = normalizePlatformId(platform);
    const adapter = this.requireAdapter(normalizedPlatform);
    const sessionId = crypto.randomUUID();

    const session: QRLoginSession = {
      sessionId,
      platform: normalizedPlatform,
      startedAt: new Date(),
      status: 'waiting',
    };
    ACTIVE_LOGIN_SESSIONS.set(sessionId, session);

    const qrPath = await adapter.getQRCode(sessionId);
    session.qrPath = qrPath;

    logger.info(`二维码已生成: platform=${normalizedPlatform}, sessionId=${sessionId}`);
    return qrPath;
  }

  async checkLoginStatus(sessionId: string): Promise<LoginStatus> {
    const session = ACTIVE_LOGIN_SESSIONS.get(sessionId);
    if (!session) {
      return { status: 'error' };
    }

    const elapsed = Date.now() - session.startedAt.getTime();
    if (elapsed > QR_SESSION_TIMEOUT_MS) {
      session.status = 'expired';
      ACTIVE_LOGIN_SESSIONS.delete(sessionId);
      return { status: 'expired' };
    }

    return { status: session.status };
  }

  // ─── Cookie 管理 ──────────────────────────────────────

  async validateCookie(accountId: string): Promise<boolean> {
    const db = this.requireDatabase();
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as
      | (AccountRow & { cookie_path?: string | null })
      | undefined;
    if (!row) {
      logger.warn(`validateCookie: 账号不存在 accountId=${accountId}`);
      return false;
    }

    const platform = normalizePlatformId(row.platform);
    const cookiePath = row.cookie_path || undefined;
    let valid = false;

    try {
      const adapter = PlatformRegistry.getAdapter(platform);
      if (adapter) {
        valid = await adapter.checkCookie(accountId, cookiePath);
      } else {
        logger.warn(`validateCookie: 平台未注册 accountId=${accountId}, platform=${platform}`);
      }
    } catch (err) {
      logger.error(`Cookie 验证异常: accountId=${accountId}`, err);
      valid = false;
    }

    if (platform === 'channels') {
      try {
        const storageValid = valid;
        const partition = `persist:${accountId}`;
        const ses = electronSession.fromPartition(partition);
        const partitionCookies = await ses.cookies.get({ url: 'https://channels.weixin.qq.com' });
        const partitionValid = await validateChannelsCookieSession(
          partitionCookies.filter(cookie => !this.isExpired(cookie))
        );
        valid = storageValid && partitionValid;
        logger.info(
          `validateCookie: channels storage=${storageValid}, partition=${partitionValid}`
        );
      } catch (err) {
        logger.error(`Electron partition cookie 检查失败: accountId=${accountId}`, err);
        valid = false;
      }
    } else if (!valid) {
      try {
        const partition = `persist:${accountId}`;
        const ses = electronSession.fromPartition(partition);
        const config = {
          bilibili: { domains: ['.bilibili.com'], required: ['SESSDATA'] },
          kuaishou: { domains: ['.kuaishou.com'], required: ['kuaishou.web.cp.api_ph', 'kuaishou.web.cp.api_st'] },
          douyin: { domains: ['.douyin.com'], required: ['sessionid', 'sid_tt'] },
          xiaohongshu: { domains: ['.xiaohongshu.com'], required: ['a1'] },
        }[platform as 'bilibili' | 'kuaishou' | 'douyin' | 'xiaohongshu'];
        if (config) {
          for (const domain of config.domains) {
            const cookies = await ses.cookies.get({ domain });
            const names = cookies.filter(c => !this.isExpired(c)).map(c => c.name);
            if (config.required.every(required => names.includes(required))) {
              valid = true;
              break;
            }
          }
        }
      } catch (err) {
        logger.error(`Electron partition cookie 检查失败: accountId=${accountId}`, err);
      }
    }

    const newStatus: AccountStatus = valid ? 'active' : 'expired';
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE accounts SET platform = ?, cookie_valid = ?, last_cookie_check = ?, status = ?, updated_at = ? WHERE id = ?`
    ).run(platform, valid ? 1 : 0, now, newStatus, now, accountId);

    if (!valid && row.status !== 'expired') {
      const payload: AccountStatusPayload = {
        accountId,
        oldStatus: row.status as AccountStatus,
        newStatus: 'expired',
      };
      EventBus.getInstance().emit(AccountEvent.STATUS_CHANGED, payload);
    }

    const payload: CookieValidatedPayload = { accountId, valid };
    EventBus.getInstance().emit(AccountEvent.COOKIE_VALIDATED, payload);

    logger.info(`Cookie 验证完成: accountId=${accountId}, valid=${valid}`);
    return valid;
  }

  private isExpired(cookie: Electron.Cookie): boolean {
    if (!cookie.expirationDate) return false;
    return cookie.expirationDate * 1000 < Date.now();
  }

  async refreshCookie(accountId: string): Promise<boolean> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error(`账号不存在: ${accountId}`);
    }

    const adapter = this.requireAdapter(account.platform);
    logger.info(`开始刷新 Cookie: accountId=${accountId}, platform=${account.platform}`);

    const loginResult = await adapter.login(accountId, false, {
      force: true,
      onLoginConfirmed: () => {
        const db = this.requireDatabase();
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
        logger.info(`登录确认，状态已即时更新: accountId=${accountId}`);
      },
    });
    if (!loginResult.success) {
      logger.error(`Cookie 刷新失败: accountId=${accountId}, reason=${loginResult.message}`);
      return false;
    }

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE accounts SET cookie_path = ?, cookie_valid = 1, status = 'active', last_login = ?, updated_at = ?, nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url) WHERE id = ?`
    ).run(loginResult.cookiePath || null, now, now, loginResult.nickname || null, loginResult.avatarUrl || null, accountId);

    EventBus.getInstance().emit(AccountEvent.COOKIE_REFRESHED, { accountId });
    logger.info(`Cookie 刷新成功: accountId=${accountId}`);
    return true;
  }

  // ─── 账号查询 ──────────────────────────────────────────

  async getAccount(accountId: string): Promise<Account | null> {
    const db = this.requireDatabase();
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as
      | AccountRow
      | undefined;

    if (!row) return null;
    return this.rowToAccount(row);
  }

  async getAccountsByPlatform(platform: string): Promise<Account[]> {
    const db = this.requireDatabase();
    const rows = db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC').all(platform) as AccountRow[];
    return rows.map((r) => this.rowToAccount(r));
  }

  async getAccountsByGroup(groupId: string): Promise<Account[]> {
    const db = this.requireDatabase();
    const rows = db.prepare('SELECT * FROM accounts WHERE group_id = ? ORDER BY created_at DESC').all(groupId) as AccountRow[];
    return rows.map((r) => this.rowToAccount(r));
  }

  async getAllAccounts(): Promise<Account[]> {
    const db = this.requireDatabase();
    const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as AccountRow[];
    return rows.map((r) => this.rowToAccount(r));
  }

  // ─── 分组操作 ──────────────────────────────────────────

  async setGroup(accountId: string, groupId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE accounts SET group_id = ?, updated_at = ? WHERE id = ?').run(
      groupId,
      now,
      accountId
    );

    const payload: GroupChangedPayload = {
      accountId,
      oldGroupId: account.groupId,
      newGroupId: groupId,
    };
    EventBus.getInstance().emit(AccountEvent.GROUP_CHANGED, payload);

    logger.info(`分组设置: accountId=${accountId}, groupId=${groupId}`);
  }

  async setFingerprint(accountId: string, fingerprintId: string | null): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE accounts SET fingerprint_id = ?, updated_at = ? WHERE id = ?').run(
      fingerprintId,
      now,
      accountId
    );

    logger.info(`指纹绑定: accountId=${accountId}, fingerprintId=${fingerprintId}`);
  }

  async setProxy(accountId: string, proxyId: string | null): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE accounts SET proxy_id = ?, updated_at = ? WHERE id = ?').run(
      proxyId,
      now,
      accountId
    );

    logger.info(`代理绑定: accountId=${accountId}, proxyId=${proxyId}`);
  }

  async removeFromGroup(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE accounts SET group_id = NULL, updated_at = ? WHERE id = ?').run(
      now,
      accountId
    );

    const payload: GroupChangedPayload = {
      accountId,
      oldGroupId: account.groupId,
      newGroupId: undefined,
    };
    EventBus.getInstance().emit(AccountEvent.GROUP_CHANGED, payload);

    logger.info(`已移出分组: accountId=${accountId}`);
  }

  // ─── 批量操作 ──────────────────────────────────────────

  async batchValidateCookies(accountIds: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const tasks = accountIds.map(async (id) => {
      const valid = await this.validateCookie(id);
      results.set(id, valid);
    });

    await Promise.allSettled(tasks);
    logger.info(`批量 Cookie 验证完成: count=${accountIds.length}`);
    return results;
  }

  async batchSetGroup(accountIds: string[], groupId: string): Promise<void> {
    const db = this.requireDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE accounts SET group_id = ?, updated_at = ? WHERE id = ?');

    const transaction = db.transaction(() => {
      for (const id of accountIds) {
        stmt.run(groupId, now, id);
      }
    });

    transaction();

    for (const id of accountIds) {
      const payload: GroupChangedPayload = { accountId: id, newGroupId: groupId };
      EventBus.getInstance().emit(AccountEvent.GROUP_CHANGED, payload);
    }

    logger.info(`批量分组设置完成: count=${accountIds.length}, groupId=${groupId}`);
  }

  // ─── 状态管理 ──────────────────────────────────────────

  async updateStatus(accountId: string, status: AccountStatus): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);

    if (account.status === status) return;

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    const cookieValid = (status === 'active') ? 1 : 0;
    db.prepare('UPDATE accounts SET status = ?, cookie_valid = ?, updated_at = ? WHERE id = ?').run(
      status,
      cookieValid,
      now,
      accountId
    );

    const payload: AccountStatusPayload = {
      accountId,
      oldStatus: account.status,
      newStatus: status,
    };
    EventBus.getInstance().emit(AccountEvent.STATUS_CHANGED, payload);

    const rendererStatus = status === 'active'
      ? 'online'
      : status === 'inactive'
        ? 'offline'
        : 'expired';
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('account:login-status', {
        status: rendererStatus,
        accountId,
      });
    });

    logger.info(`状态更新: accountId=${accountId}, ${account.status} -> ${status}`);
  }

  async deleteAccount(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);

    const db = this.requireDatabase();
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);

    EventBus.getInstance().emit(AccountEvent.ACCOUNT_DELETED, { accountId });
    logger.info(`账号已删除: accountId=${accountId}, platform=${account.platform}`);
  }

  // ─── 内部方法 ──────────────────────────────────────────

  private ensureSchema(): void {
    if (!isDatabaseAvailable()) {
      logger.warn('数据库不可用，跳过 schema 初始化');
      return;
    }

    const db = getDatabase();

    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        cookie_path TEXT NOT NULL DEFAULT '',
        cookie_valid INTEGER NOT NULL DEFAULT 0,
        last_login TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        group_id TEXT,
        fingerprint_id TEXT,
        proxy_id TEXT,
        browser_mode TEXT,
        homepage_url TEXT,
        remark TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
      CREATE INDEX IF NOT EXISTS idx_accounts_group ON accounts(group_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
    `);

    try {
      db.exec(`ALTER TABLE accounts ADD COLUMN fingerprint_id TEXT`);
    } catch {}
    try {
      db.exec(`ALTER TABLE accounts ADD COLUMN proxy_id TEXT`);
    } catch {}

    logger.info('账号表 schema 已就绪');
  }

  private startCookiePeriodicCheck(): void {
    const check = async () => {
      try {
        const autoCheck = await this.readSetting<boolean>('autoCheckCookie', true);
        if (!autoCheck) {
          logger.info('Cookie 自动检测已关闭，跳过');
          return;
        }

        const accounts = await this.getAllAccounts();
        const activeAccounts = accounts.filter((a) => a.status === 'active');

        if (activeAccounts.length === 0) return;

        logger.info(`定期 Cookie 检查: ${activeAccounts.length} 个活跃账号`);
        const ids = activeAccounts.map((a) => a.id);
        await this.batchValidateCookies(ids);
      } catch (err) {
        logger.error('定期 Cookie 检查失败', err);
      }
    };

    const scheduleNext = async () => {
      const intervalMin = await this.readSetting<number>('cookieCheckInterval', 30);
      const intervalMs = Math.max(intervalMin, 10) * 60 * 1000;
      this.cookieCheckTimer = setTimeout(async () => {
        await check();
        scheduleNext();
      }, intervalMs) as unknown as ReturnType<typeof setInterval>;
    };

    scheduleNext();
  }

  private async readSetting<T>(key: string, fallback: T): Promise<T> {
    try {
      const db = this.requireDatabase();
      const row = db.prepare('SELECT value FROM platform_configs WHERE key = ?').get(key) as any;
      if (row?.value) {
        try {
          return JSON.parse(row.value) as T;
        } catch {
          return row.value as T;
        }
      }
    } catch {}
    return fallback;
  }

  private startSessionCleanup(): void {
    this.sessionCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of ACTIVE_LOGIN_SESSIONS) {
        if (now - session.startedAt.getTime() > QR_SESSION_TIMEOUT_MS) {
          session.status = 'expired';
          ACTIVE_LOGIN_SESSIONS.delete(sessionId);
          logger.info(`扫码会话已过期: sessionId=${sessionId}`);
        }
      }
    }, 60_000);
  }

  private async readCookieFile(cookiePath: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');

    if (!fs.existsSync(cookiePath)) {
      throw new Error(`Cookie 文件不存在: ${cookiePath}`);
    }

    const raw = fs.readFileSync(cookiePath, 'utf-8');
    return raw;
  }

  private requireAdapter(platform: string): PlatformAdapter {
    const normalizedPlatform = normalizePlatformId(platform);
    const adapter = PlatformRegistry.getAdapter(normalizedPlatform);
    if (!adapter) {
      throw new Error(`不支持的平台: ${normalizedPlatform}，可用平台: ${PlatformRegistry.getSupportedPlatforms().join(', ')}`);
    }
    return adapter;
  }

  private requireDatabase(): any {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }
    return getDatabase();
  }

  private rowToAccount(row: AccountRow): Account {
    return {
      id: row.id,
      platform: normalizePlatformId(row.platform),
      name: row.nickname || row.name || '',
      avatar: (row.avatar_url || row.avatar) ?? undefined,
      cookieEncrypted: row.cookie_encrypted || row.cookie_path || '',
      cookieValid: row.cookie_valid === 1,
      lastCookieCheck: row.last_cookie_check ? new Date(row.last_cookie_check) : undefined,
      groupId: row.group_id ?? undefined,
      fingerprintId: row.fingerprint_id ?? undefined,
      proxyId: row.proxy_id ?? undefined,
      status: row.status as AccountStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const accountService = AccountService.getInstance();
