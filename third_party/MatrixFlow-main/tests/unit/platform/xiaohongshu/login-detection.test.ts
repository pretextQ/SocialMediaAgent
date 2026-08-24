import { describe, expect, it, vi } from 'vitest';
import {
  buildXhsProfileProbeScript,
  detectXhsProfileInWebContents,
  hasRequiredXhsCookies,
  isXhsUrl,
  normalizeXhsProfile,
} from '@electron/platform/xiaohongshu/login-detection';

describe('xiaohongshu login detection', () => {
  it('identifies creator center urls', () => {
    expect(isXhsUrl('https://creator.xiaohongshu.com/login')).toBe(true);
    expect(isXhsUrl('https://www.xiaohongshu.com/user/profile/123')).toBe(true);
    expect(isXhsUrl('https://creator.douyin.com/')).toBe(false);
  });

  it('accepts the creator-center cookie set produced by a real login', () => {
    expect(hasRequiredXhsCookies([
      { name: 'a1', value: 'device-cookie' },
      { name: 'customer-sso-sid', value: 'session-cookie' },
    ])).toBe(true);

    expect(hasRequiredXhsCookies([
      { name: 'a1', value: 'device-cookie' },
      { name: 'access-token-creator.xiaohongshu.com', value: 'access-token' },
    ])).toBe(true);
  });

  it('does not treat the device cookie alone as an authenticated session', () => {
    expect(hasRequiredXhsCookies([
      { name: 'a1', value: 'device-cookie' },
    ])).toBe(false);
  });

  it('normalizes deeply nested creator profile data', () => {
    expect(normalizeXhsProfile({
      code: 0,
      data: {
        account: {
          accountName: '小红书作者',
          avatar_url: 'https://sns-avatar-qc.xhscdn.com/avatar/test.jpg',
          user_id: 'xhs-user-1',
        },
      },
    })).toEqual({
      nickname: '小红书作者',
      avatarUrl: 'https://sns-avatar-qc.xhscdn.com/avatar/test.jpg',
      homepageUrl: 'https://creator.xiaohongshu.com',
      userId: 'xhs-user-1',
    });
  });

  it('prefers a nested nickname over an unrelated top-level logo', () => {
    expect(normalizeXhsProfile({
      logo: 'https://creator.xiaohongshu.com/logo.png',
      data: {
        user: {
          nickname: '真实账号名',
        },
      },
    })?.nickname).toBe('真实账号名');
  });

  it('builds a valid probe with creator nickname selectors and state fallback', () => {
    const script = buildXhsProfileProbeScript();

    expect(() => new Function(`return ${script};`)).not.toThrow();
    expect(script).toContain('.top-nickname');
    expect(script).toContain('.user-info-nickname');
    expect(script).toContain('localStorage');
  });

  it('extracts a profile through webContents', async () => {
    const webContents = {
      executeJavaScript: vi.fn().mockResolvedValue({
        nickname: '小红书作者',
        avatarUrl: 'https://sns-avatar-qc.xhscdn.com/avatar/test.jpg',
        homepageUrl: 'https://creator.xiaohongshu.com',
      }),
    };

    const profile = await detectXhsProfileInWebContents(
      webContents,
      'https://creator.xiaohongshu.com/new/home'
    );

    expect(profile?.nickname).toBe('小红书作者');
    expect(webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  });
});
