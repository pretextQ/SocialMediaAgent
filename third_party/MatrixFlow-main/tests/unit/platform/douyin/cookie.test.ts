import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockUnlinkSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    unlinkSync: mockUnlinkSync,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  unlinkSync: mockUnlinkSync,
}));

describe('douyin/cookie', () => {
  let getCookiePath: typeof import('@electron/platform/douyin/cookie').getCookiePath;
  let cookieExists: typeof import('@electron/platform/douyin/cookie').cookieExists;
  let deleteCookie: typeof import('@electron/platform/douyin/cookie').deleteCookie;
  let saveCookie: typeof import('@electron/platform/douyin/cookie').saveCookie;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockUnlinkSync.mockReset();
    const mod = await import('@electron/platform/douyin/cookie');
    getCookiePath = mod.getCookiePath;
    cookieExists = mod.cookieExists;
    deleteCookie = mod.deleteCookie;
    saveCookie = mod.saveCookie;
  });

  describe('getCookiePath', () => {
    it('returns path under userData/cookies/douyin', () => {
      mockExistsSync.mockReturnValue(true);
      const result = getCookiePath('account-001');
      expect(result).toContain('cookies');
      expect(result).toContain('douyin');
      expect(result).toContain('account-001.json');
      expect(result).toMatch(/cookies.*douyin/);
    });

    it('creates cookie directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      getCookiePath('account-002');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('douyin'),
        { recursive: true },
      );
    });

    it('does not create directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true);
      getCookiePath('account-003');
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('cookieExists', () => {
    it('returns true when cookie file exists', () => {
      mockExistsSync.mockReturnValue(true);
      expect(cookieExists('/some/path.json')).toBe(true);
    });

    it('returns false when cookie file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(cookieExists('/missing/path.json')).toBe(false);
    });
  });

  describe('saveCookie', () => {
    it('calls storageState with the cookie path', async () => {
      const storageState = vi.fn().mockResolvedValue(undefined);
      const context = { storageState } as unknown as import('patchright').BrowserContext;

      await saveCookie(context, '/cookies/douyin/account.json');
      expect(storageState).toHaveBeenCalledWith({ path: '/cookies/douyin/account.json' });
    });
  });

  describe('deleteCookie', () => {
    it('deletes cookie file and returns true when file exists', () => {
      mockExistsSync.mockReturnValue(true);
      const result = deleteCookie('account-001');
      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('returns false when cookie file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = deleteCookie('account-001');
      expect(result).toBe(false);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});
