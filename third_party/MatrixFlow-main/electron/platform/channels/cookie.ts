import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { Logger } from '../../core/Logger';

const logger = new Logger('ChannelsCookie');

export function getCookiePath(accountId: string): string {
  const userDataPath = app.getPath('userData');
  const cookieDir = path.join(userDataPath, 'cookies', 'channels');

  if (!fs.existsSync(cookieDir)) {
    ensureDir(cookieDir);
  }

  return path.join(cookieDir, `${accountId}.json`);
}

function ensureDir(dir: string): void {
  const parts = dir.split(path.sep);
  let current = parts[0] || path.sep;
  for (let i = 1; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (fs.existsSync(current)) {
      if (!fs.statSync(current).isDirectory()) {
        fs.unlinkSync(current);
        fs.mkdirSync(current);
      }
    } else {
      fs.mkdirSync(current);
    }
  }
}

export function cookieExists(cookiePath: string): boolean {
  return fs.existsSync(cookiePath);
}

export async function saveCookie(
  context: import('patchright').BrowserContext,
  cookiePath: string
): Promise<void> {
  await context.storageState({ path: cookiePath });
  logger.info(`Cookie 已保存: ${cookiePath}`);
}

export function deleteCookie(accountId: string): boolean {
  const cookiePath = getCookiePath(accountId);
  if (fs.existsSync(cookiePath)) {
    fs.unlinkSync(cookiePath);
    logger.info(`Cookie 已删除: ${cookiePath}`);
    return true;
  }
  return false;
}
