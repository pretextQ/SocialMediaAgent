import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Cookie } from 'electron';
import { SessionManager } from '@electron/services/session-manager';

describe('SessionManager', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
  });

  it('preserves Electron cookie metadata and localStorage in storageState', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-session-'));
    tempDirs.push(baseDir);
    const manager = new SessionManager(baseDir);
    const expires = Math.floor(Date.now() / 1000) + 3600;

    const storagePath = await manager.saveFromElectronCookies([
      {
        name: 'customer-sso-sid',
        value: 'session-cookie',
        domain: '.xiaohongshu.com',
        path: '/',
        secure: true,
        httpOnly: true,
        session: false,
        expirationDate: expires,
        sameSite: 'no_restriction',
      } as Cookie,
    ], 'xhs-account', 'xiaohongshu', [{
      origin: 'https://creator.xiaohongshu.com',
      localStorage: [{ name: 'USER_INFO', value: '{"userId":"xhs-user-1"}' }],
    }]);

    const stored = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    expect(stored.cookies[0]).toMatchObject({
      name: 'customer-sso-sid',
      expires,
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    });
    expect(stored.origins).toEqual([{
      origin: 'https://creator.xiaohongshu.com',
      localStorage: [{ name: 'USER_INFO', value: '{"userId":"xhs-user-1"}' }],
    }]);
  });
});
