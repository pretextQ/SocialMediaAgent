import { describe, expect, it, vi } from 'vitest';
import {
  buildChannelsLoginProbeScript,
  detectChannelsLoginInWebContents,
  detectChannelsProfileInWebContents,
  hasRequiredChannelsCookies,
  isChannelsAuthDataLoggedIn,
  isChannelsInternalUrl,
  isChannelsUrl,
  normalizeChannelsProfile,
  validateChannelsCookieSession,
} from '@electron/platform/channels/login-detection';

describe('channels login detection', () => {
  it('identifies channels urls', () => {
    expect(isChannelsUrl('https://channels.weixin.qq.com/')).toBe(true);
    expect(isChannelsUrl('https://channels.weixin.qq.com/platform')).toBe(true);
    expect(isChannelsUrl('https://creator.douyin.com/')).toBe(false);
  });

  it('identifies platform and account urls as internal pages', () => {
    expect(isChannelsInternalUrl('https://channels.weixin.qq.com/platform')).toBe(true);
    expect(isChannelsInternalUrl('https://channels.weixin.qq.com/platform/post/create')).toBe(true);
    expect(isChannelsInternalUrl('https://channels.weixin.qq.com/account')).toBe(true);
    expect(isChannelsInternalUrl('https://channels.weixin.qq.com/')).toBe(false);
  });

  it('probes internal pages instead of treating the URL itself as logged in', async () => {
    const webContents = {
      executeJavaScript: vi.fn().mockResolvedValue({ loggedIn: false, reason: 'login_marker' }),
    };

    const result = await detectChannelsLoginInWebContents(
      webContents,
      'https://channels.weixin.qq.com/platform'
    );

    expect(result).toMatchObject({
      loggedIn: false,
      reason: 'login_marker',
      currentUrl: 'https://channels.weixin.qq.com/platform',
    });
    expect(webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  });

  it('detects login on the root page when logged-in page markers are present', async () => {
    const webContents = {
      executeJavaScript: vi.fn().mockResolvedValue({ loggedIn: true, reason: 'page_marker' }),
    };

    const result = await detectChannelsLoginInWebContents(
      webContents,
      'https://channels.weixin.qq.com/'
    );

    expect(result).toMatchObject({
      loggedIn: true,
      reason: 'page_marker',
      currentUrl: 'https://channels.weixin.qq.com/',
    });
    expect(webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  });

  it('does not treat visible QR login markers as logged in', async () => {
    const webContents = {
      executeJavaScript: vi.fn().mockResolvedValue({ loggedIn: false, reason: 'login_marker' }),
    };

    const result = await detectChannelsLoginInWebContents(
      webContents,
      'https://channels.weixin.qq.com/'
    );

    expect(result).toMatchObject({
      loggedIn: false,
      reason: 'login_marker',
    });
  });

  it('uses auth_data instead of get_auth_info for login validation', () => {
    const script = buildChannelsLoginProbeScript();

    expect(script).toContain('/auth/auth_data');
    expect(script).not.toContain('/auth/get_auth_info');
    expect(script).not.toContain("loggedIn: true, reason: 'page_marker'");
  });

  it('requires both sessionid and wxuin', () => {
    expect(hasRequiredChannelsCookies([
      { name: 'sessionid', value: 'session-value' },
      { name: 'wxuin', value: 'uin-value' },
    ])).toBe(true);
    expect(hasRequiredChannelsCookies([
      { name: 'wxuin', value: 'uin-value' },
    ])).toBe(false);
  });

  it('does not accept auth_data errCode 0 without a finder identity', () => {
    expect(isChannelsAuthDataLoggedIn({ errCode: 0, data: {} })).toBe(false);
    expect(isChannelsAuthDataLoggedIn({
      errCode: '0',
      data: { finderUser: { uniqId: 'finder-001' } },
    })).toBe(true);
  });

  it('validates a cookie session against auth_data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        errCode: 0,
        data: { finderUser: { uniqId: 'finder-001' } },
      }),
    });

    const result = await validateChannelsCookieSession([
      { name: 'sessionid', value: 'session-value' },
      { name: 'wxuin', value: 'uin-value' },
    ], fetchImpl as unknown as typeof fetch);

    expect(result).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/auth_data',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('skips page probing for non-channels urls', async () => {
    const webContents = {
      executeJavaScript: vi.fn(),
    };

    const result = await detectChannelsLoginInWebContents(
      webContents,
      'https://creator.douyin.com/'
    );

    expect(result).toMatchObject({
      loggedIn: false,
      reason: 'not_channels',
    });
    expect(webContents.executeJavaScript).not.toHaveBeenCalled();
  });

  it('normalizes finder user profile from auth info', () => {
    const result = normalizeChannelsProfile({
      nickname: '视频号作者',
      avatarUrl: 'https://wx.qlogo.cn/avatar.jpg',
      homepageUrl: '',
      userId: 'finder-001',
    });

    expect(result).toEqual({
      nickname: '视频号作者',
      avatarUrl: 'https://wx.qlogo.cn/avatar.jpg',
      homepageUrl: 'https://channels.weixin.qq.com/platform',
      userId: 'finder-001',
    });
  });

  it('normalizes raw get_auth_info responses from finderUser', () => {
    const result = normalizeChannelsProfile({
      errCode: 0,
      data: {
        finderUser: {
          uniqId: 'finder-001',
          nickname: '视频号作者',
          headImgUrl: 'https://wx.qlogo.cn/avatar.jpg',
        },
      },
    });

    expect(result).toEqual({
      nickname: '视频号作者',
      avatarUrl: 'https://wx.qlogo.cn/avatar.jpg',
      homepageUrl: 'https://channels.weixin.qq.com/platform',
      userId: 'finder-001',
    });
  });

  it('normalizes deeply nested channels profile objects', () => {
    const result = normalizeChannelsProfile({
      errCode: 0,
      data: {
        authInfo: {
          account: {
            nickName: '深层视频号',
            head_url: 'https://wx.qlogo.cn/deep.jpg',
            finderUsername: 'finder-deep',
          },
        },
      },
    });

    expect(result).toEqual({
      nickname: '深层视频号',
      avatarUrl: 'https://wx.qlogo.cn/deep.jpg',
      homepageUrl: 'https://channels.weixin.qq.com/platform',
      userId: 'finder-deep',
    });
  });

  it('normalizes fallback name and avatar profile fields', () => {
    const result = normalizeChannelsProfile({
      name: '视频号作者',
      avatar: '//wx.qlogo.cn/avatar.jpg',
    });

    expect(result).toEqual({
      nickname: '视频号作者',
      avatarUrl: '//wx.qlogo.cn/avatar.jpg',
      homepageUrl: 'https://channels.weixin.qq.com/platform',
      userId: undefined,
    });
  });

  it('extracts profile on channels pages', async () => {
    const webContents = {
      executeJavaScript: vi.fn().mockResolvedValue({
        nickname: '视频号作者',
        avatarUrl: 'https://wx.qlogo.cn/avatar.jpg',
        homepageUrl: 'https://channels.weixin.qq.com/platform',
      }),
    };

    const result = await detectChannelsProfileInWebContents(
      webContents,
      'https://channels.weixin.qq.com/platform'
    );

    expect(result).toMatchObject({
      nickname: '视频号作者',
      avatarUrl: 'https://wx.qlogo.cn/avatar.jpg',
      homepageUrl: 'https://channels.weixin.qq.com/platform',
    });
  });
});
