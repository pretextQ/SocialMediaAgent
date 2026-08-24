import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  cookieExists: vi.fn(),
  chromiumLaunch: vi.fn(),
  recordStep: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: mocks.existsSync,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('patchright', () => ({
  chromium: {
    launch: mocks.chromiumLaunch,
  },
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

vi.mock('@electron/platform/channels/cookie', () => ({
  getCookiePath: vi.fn((accountId: string) => `/tmp/cookies/channels/${accountId}.json`),
  saveCookie: vi.fn(() => Promise.resolve()),
  cookieExists: mocks.cookieExists,
}));

vi.mock('@electron/platform/base/DebugRecorder', () => ({
  getDebugRecorder: () => ({
    setSessionId: vi.fn(),
    recordStep: mocks.recordStep,
  }),
}));

vi.mock('@electron/services/AccountService', () => ({
  accountService: {
    updateStatus: mocks.updateStatus,
  },
}));

function mockBrowserWithDetection(
  detection: Record<string, unknown>,
  currentUrl = 'https://channels.weixin.qq.com/platform/post/create',
  cookies = [
    { name: 'sessionid', value: 'session-value' },
    { name: 'wxuin', value: 'uin-value' },
  ]
) {
  const page = {
    goto: vi.fn(() => Promise.resolve()),
    url: vi.fn(() => currentUrl),
    evaluate: vi.fn(() => Promise.resolve(detection)),
  };
  const context = {
    cookies: vi.fn(() => Promise.resolve(cookies)),
    newPage: vi.fn(() => Promise.resolve(page)),
  };
  const browser = {
    newContext: vi.fn(() => Promise.resolve(context)),
    close: vi.fn(() => Promise.resolve()),
  };

  mocks.chromiumLaunch.mockResolvedValueOnce(browser);
  return { browser, context, page };
}

describe('channels/login', () => {
  let validateExistingCookie: typeof import('@electron/platform/channels/login').validateExistingCookie;
  let qrCodeLogin: typeof import('@electron/platform/channels/login').qrCodeLogin;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.recordStep.mockImplementation((_name: string, action: () => Promise<unknown>) => action());

    const mod = await import('@electron/platform/channels/login');
    validateExistingCookie = mod.validateExistingCookie;
    qrCodeLogin = mod.qrCodeLogin;
  });

  describe('validateExistingCookie', () => {
    it('returns false when cookie file does not exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await validateExistingCookie('/tmp/missing.json');

      expect(result).toBe(false);
      expect(mocks.chromiumLaunch).not.toHaveBeenCalled();
    });

    it('returns true only when channels probe has positive login evidence', async () => {
      mocks.existsSync.mockReturnValue(true);
      const { browser, page } = mockBrowserWithDetection({ loggedIn: true, reason: 'auth_data', errCode: 0 });

      const result = await validateExistingCookie('/tmp/valid.json');

      expect(result).toBe(true);
      expect(browser.newContext).toHaveBeenCalledWith({ storageState: '/tmp/valid.json' });
      expect(page.goto).toHaveBeenCalledWith('https://channels.weixin.qq.com/platform/post/create', {
        timeout: 15000,
        waitUntil: 'load',
      });
      expect(browser.close).toHaveBeenCalled();
    });

    it('returns false before page probing when required session cookies are missing', async () => {
      mocks.existsSync.mockReturnValue(true);
      const { page } = mockBrowserWithDetection(
        { loggedIn: true, reason: 'auth_data', errCode: 0 },
        'https://channels.weixin.qq.com/platform/post/create',
        [{ name: 'wxuin', value: 'uin-value' }]
      );

      const result = await validateExistingCookie('/tmp/incomplete.json');

      expect(result).toBe(false);
      expect(page.goto).not.toHaveBeenCalled();
    });

    it('returns false when the page has no positive login evidence', async () => {
      mocks.existsSync.mockReturnValue(true);
      mockBrowserWithDetection({ loggedIn: false, reason: 'no_positive_marker' });

      const result = await validateExistingCookie('/tmp/stale.json');

      expect(result).toBe(false);
    });

    it('returns false when the channels page shows login markers', async () => {
      mocks.existsSync.mockReturnValue(true);
      mockBrowserWithDetection({ loggedIn: false, reason: 'login_marker' }, 'https://channels.weixin.qq.com/');

      const result = await validateExistingCookie('/tmp/expired.json');

      expect(result).toBe(false);
    });
  });

  describe('qrCodeLogin', () => {
    it('does not mark account active from the existing-cookie shortcut', async () => {
      mocks.cookieExists.mockReturnValue(true);
      mocks.existsSync.mockReturnValue(true);
      mockBrowserWithDetection({ loggedIn: true, reason: 'auth_data', errCode: 0 });

      const result = await qrCodeLogin('channels_acc', true);

      expect(result).toMatchObject({
        success: true,
        cookiePath: '/tmp/cookies/channels/channels_acc.json',
        message: 'Cookie 有效',
      });
      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it('skips the existing-cookie shortcut for an explicit relogin', async () => {
      mocks.cookieExists.mockReturnValue(true);
      mocks.chromiumLaunch.mockRejectedValueOnce(new Error('stop after shortcut check'));

      await expect(
        qrCodeLogin('channels_acc', true, undefined, undefined, { force: true })
      ).rejects.toThrow('stop after shortcut check');

      expect(mocks.recordStep).not.toHaveBeenCalledWith(
        'validate_existing_cookie',
        expect.any(Function),
        expect.anything()
      );
    });
  });
});
