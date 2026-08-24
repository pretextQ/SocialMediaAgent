import { ipcMain, BrowserWindow } from 'electron';
import { AccountLoginService, type UserProfile } from './account-login';
import type { LoginResult, LoginStartPayload, Platform, BrowserConfig } from './types';
import { getDatabase } from '../data/Database';
import { normalizePlatformId } from './platform-normalizer';

let loginService: AccountLoginService | null = null;

function persistAccountProfile(
  db: ReturnType<typeof getDatabase>,
  accountId: string,
  platform: Platform,
  storagePath: string,
  profile: UserProfile | undefined,
  browserMode: string
): string {
  const normalizedPlatform = normalizePlatformId(platform);
  const now = new Date().toISOString();
  const nickname = profile?.nickname?.trim() || `账号-${accountId.slice(0, 8)}`;
  const avatarUrl = profile?.avatarUrl || null;
  const homepageUrl = profile?.homepageUrl || null;

  if (profile?.nickname) {
    const dup = db.prepare('SELECT id FROM accounts WHERE platform = ? AND nickname = ? AND cookie_valid = 1 LIMIT 1').get(normalizedPlatform, profile.nickname) as { id: string } | undefined;
    if (dup) {
      console.log(`[AccountLogin] duplicate account: platform=${normalizedPlatform}, nickname=${profile.nickname}, existingId=${dup.id}`);
      db.prepare(
        `UPDATE accounts
         SET nickname = COALESCE(?, nickname),
             avatar_url = COALESCE(?, avatar_url),
             cookie_path = ?,
             cookie_valid = 1,
             status = 'active',
             browser_mode = ?,
             homepage_url = COALESCE(?, homepage_url),
             last_login = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        profile.nickname,
        avatarUrl,
        storagePath,
        browserMode,
        homepageUrl,
        now,
        now,
        dup.id
      );
      return dup.id;
    }
  }

  console.log(`[AccountLogin] createAccount: accountId=${accountId}, platform=${normalizedPlatform}, nickname=${nickname}, browserMode=${browserMode}, homepageUrl=${homepageUrl}`);
  db.prepare(
    `INSERT INTO accounts (id, platform, nickname, avatar_url, cookie_path, cookie_valid, status, group_id, browser_mode, homepage_url, last_login, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?)`
  ).run(
    accountId, normalizedPlatform, nickname, avatarUrl, storagePath,
    null, browserMode, homepageUrl, now, now, now
  );
  console.log(`[AccountLogin] createAccount success: accountId=${accountId}`);
  return accountId;
}

function updateAccountLoginProfile(
  db: ReturnType<typeof getDatabase>,
  accountId: string,
  status: string,
  storagePath: string | undefined,
  profile: UserProfile | undefined,
  browserMode: string | undefined
): string {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE accounts
     SET nickname = COALESCE(?, nickname),
         avatar_url = COALESCE(?, avatar_url),
         cookie_path = COALESCE(?, cookie_path),
         cookie_valid = 1,
         status = ?,
         browser_mode = COALESCE(?, browser_mode),
         homepage_url = COALESCE(?, homepage_url),
         last_login = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    profile?.nickname?.trim() || null,
    profile?.avatarUrl || null,
    storagePath || null,
    status === 'online' ? 'active' : status,
    browserMode || null,
    profile?.homepageUrl || null,
    now,
    now,
    accountId
  );
  return accountId;
}

function getLoginService(): AccountLoginService {
  if (!loginService) {
    loginService = new AccountLoginService({
      sendIPC: (channel: string, data: unknown) => {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          win.webContents.send(channel, data);
        });
      },
      onLog: (message: string, data?: Record<string, unknown>) => {
        console.log(`[AccountLogin] ${message}`, data || '');
      },
      getExistingAccounts: async (platform: Platform) => {
        const normalizedPlatform = normalizePlatformId(platform);
        const rows = getDatabase().prepare('SELECT id, nickname FROM accounts WHERE platform = ?').all(normalizedPlatform) as Array<{ id: string; nickname?: string | null }>;
        return rows.map(row => ({ id: row.id, nickname: row.nickname || undefined }));
      },
      updateAccountStatus: async (accountId: string, status: string, storagePath?: string, profile?: UserProfile, browserMode?: string): Promise<string> => {
        return updateAccountLoginProfile(getDatabase(), accountId, status, storagePath, profile, browserMode);
      },
      createAccount: async (accountId: string, platform: Platform, storagePath: string, profile: UserProfile | undefined, browserMode: string): Promise<string> => {
        const db = getDatabase();
        return persistAccountProfile(db, accountId, platform, storagePath, profile, browserMode);
      },
    });
  }
  return loginService;
}

export async function startAccountLogin(payload: LoginStartPayload): Promise<LoginResult> {
  const service = getLoginService();
  return service.startLogin({
    ...payload,
    platform: normalizePlatformId(String(payload.platform)),
  });
}

export function registerAccountLoginHandlers(): void {
  ipcMain.handle('accounts:startLogin', async (_event, payload: LoginStartPayload) => {
    try {
      const result = await startAccountLogin(payload);
      return result.success
        ? { success: true, data: result }
        : { success: false, data: result, message: result.error || '登录失败' };
    } catch (error) {
      return { success: false, message: String(error) };
    }
  });

  ipcMain.handle('accounts:cancelLogin', async () => {
    try {
      const service = getLoginService();
      service.cancelLogin();
      return { success: true };
    } catch (error) {
      return { success: false, message: String(error) };
    }
  });
}

export function createAccountLoginService(
  options: {
    getExistingAccounts?: (platform: Platform) => Promise<Array<{ id: string; nickname?: string }>>;
    updateAccountStatus?: (accountId: string, status: string, storagePath?: string, profile?: UserProfile, browserMode?: string) => Promise<string | void>;
    createAccount?: (accountId: string, platform: Platform, storagePath: string, profile: UserProfile | undefined, browserMode: string) => Promise<string>;
  }
): AccountLoginService {
  loginService = new AccountLoginService({
    sendIPC: (channel: string, data: unknown) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        win.webContents.send(channel, data);
      });
    },
    onLog: (message: string, data?: Record<string, unknown>) => {
      console.log(`[AccountLogin] ${message}`, data || '');
    },
    ...options,
  });
  return loginService;
}
