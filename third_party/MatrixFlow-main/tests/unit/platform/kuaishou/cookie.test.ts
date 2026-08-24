import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockStatSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    unlinkSync: mockUnlinkSync,
    statSync: mockStatSync,
    writeFileSync: mockWriteFileSync,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  unlinkSync: mockUnlinkSync,
  statSync: mockStatSync,
  writeFileSync: mockWriteFileSync,
}));

describe('kuaishou/cookie', () => {
  let getCookiePath: typeof import('@electron/platform/kuaishou/cookie').getCookiePath;
  let cookieExists: typeof import('@electron/platform/kuaishou/cookie').cookieExists;
  let deleteCookie: typeof import('@electron/platform/kuaishou/cookie').deleteCookie;
  let saveCookie: typeof import('@electron/platform/kuaishou/cookie').saveCookie;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockUnlinkSync.mockReset();
    mockStatSync.mockReset();
    mockWriteFileSync.mockReset();
    const mod = await import('@electron/platform/kuaishou/cookie');
    getCookiePath = mod.getCookiePath;
    cookieExists = mod.cookieExists;
    deleteCookie = mod.deleteCookie;
    saveCookie = mod.saveCookie;
  });

  describe('getCookiePath', () => {
    it('returns path under userData/cookies/kuaishou', () => {
      mockExistsSync.mockReturnValue(true);
      const result = getCookiePath('account-001');
      expect(result).toContain('cookies');
      expect(result).toContain('kuaishou');
      expect(result).toContain('account-001.json');
      expect(result).toMatch(/cookies.*kuaishou/);
    });

    it('creates cookie directory if it does not exist', () => {
      // ensureDir iterates segments, calling existsSync for each
      // First call: checking if cookieDir exists → false
      // Subsequent calls: checking each path segment
      mockExistsSync.mockReturnValue(false);
      getCookiePath('account-002');
      // ensureDir should call mkdirSync for missing segments
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('does not create directory if it already exists', () => {
      // First existsSync call (checking cookieDir) returns true
      mockExistsSync.mockReturnValue(true);
      getCookiePath('account-003');
      // No mkdirSync should be called since dir exists
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

      await saveCookie(context, '/cookies/kuaishou/account.json');
      expect(storageState).toHaveBeenCalledWith({ path: '/cookies/kuaishou/account.json' });
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
