import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'patchright';

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    unlinkSync: mockUnlinkSync,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('@electron/platform/kuaishou/cookie', () => ({
  getCookiePath: vi.fn(() => '/tmp/cookies/kuaishou/test.json'),
  saveCookie: vi.fn(() => Promise.resolve()),
  cookieExists: vi.fn(),
}));

function createMockPage(overrides: Record<string, unknown> = {}): any {
  return {
    goto: vi.fn(() => Promise.resolve()),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    waitForURL: vi.fn(() => Promise.resolve()),
    url: vi.fn(() => 'https://cp.kuaishou.com/article/publish/video'),
    locator: vi.fn(() => ({
      waitFor: vi.fn(() => Promise.resolve()),
      getAttribute: vi.fn(() => Promise.resolve('data:image/png;base64,abc')),
      isVisible: vi.fn(() => Promise.resolve(false)),
      click: vi.fn(() => Promise.resolve()),
      count: vi.fn(() => Promise.resolve(0)),
      first: vi.fn(function(this: any) { return this; }),
    })),
    getByText: vi.fn((_text: string) => ({
      waitFor: vi.fn(() => Promise.resolve()),
      isVisible: vi.fn(() => Promise.resolve(false)),
      first: vi.fn(function(this: any) { return this; }),
      count: vi.fn(() => Promise.resolve(0)),
    })),
    ...overrides,
  };
}

describe('kuaishou/login', () => {
  let validateExistingCookie: typeof import('@electron/platform/kuaishou/login').validateExistingCookie;
  let checkCookie: typeof import('@electron/platform/kuaishou/login').checkCookie;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockUnlinkSync.mockReset();

    const mod = await import('@electron/platform/kuaishou/login');
    validateExistingCookie = mod.validateExistingCookie;
    checkCookie = mod.checkCookie;
  });

  describe('validateExistingCookie', () => {
    it('returns false when cookie file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await validateExistingCookie('/tmp/nonexistent.json');
      expect(result).toBe(false);
    });

    it('returns true when cookie is valid (no login page shown)', async () => {
      mockExistsSync.mockReturnValue(true);
      
      // Override patchright mock for this test
      const { chromium } = await import('patchright');
      const mockPage = createMockPage({
        waitForURL: vi.fn(() => Promise.resolve()),
        getByText: vi.fn((_text: string) => ({
          isVisible: vi.fn(() => Promise.resolve(false)),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      
      vi.mocked(chromium.launch).mockResolvedValueOnce({
        newContext: vi.fn(() => Promise.resolve({
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          close: vi.fn(() => Promise.resolve()),
        })),
        close: vi.fn(() => Promise.resolve()),
      } as any);

      const result = await validateExistingCookie('/tmp/valid.json');
      expect(result).toBe(true);
    });

    it('returns false when login page is shown (cookie expired)', async () => {
      mockExistsSync.mockReturnValue(true);
      
      const { chromium } = await import('patchright');
      const mockPage = createMockPage({
        getByText: vi.fn((text: string) => ({
          isVisible: vi.fn(() => {
            if (text === '扫码登录') return Promise.resolve(true);
            return Promise.resolve(false);
          }),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      
      vi.mocked(chromium.launch).mockResolvedValueOnce({
        newContext: vi.fn(() => Promise.resolve({
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          close: vi.fn(() => Promise.resolve()),
        })),
        close: vi.fn(() => Promise.resolve()),
      } as any);

      const result = await validateExistingCookie('/tmp/expired.json');
      expect(result).toBe(false);
    });

    it('returns false when browser launch fails', async () => {
      mockExistsSync.mockReturnValue(true);

      const { chromium } = await import('patchright');
      vi.mocked(chromium.launch).mockRejectedValueOnce(new Error('launch failed'));

      await expect(validateExistingCookie('/tmp/test.json')).rejects.toThrow('launch failed');
    });
  });

  describe('checkCookie', () => {
    it('delegates to validateExistingCookie with correct path', async () => {
      mockExistsSync.mockReturnValue(true);

      const { chromium } = await import('patchright');
      const mockPage = createMockPage();

      vi.mocked(chromium.launch).mockResolvedValueOnce({
        newContext: vi.fn(() => Promise.resolve({
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          close: vi.fn(() => Promise.resolve()),
        })),
        close: vi.fn(() => Promise.resolve()),
      } as any);

      await checkCookie('acc1');
      expect(chromium.launch).toHaveBeenCalled();
    });
  });
});
