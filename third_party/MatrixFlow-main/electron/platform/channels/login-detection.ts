export interface ChannelsLoginDetectionResult {
  loggedIn: boolean;
  reason: string;
  currentUrl?: string;
  errCode?: number | string;
}

export interface ChannelsProfileResult {
  nickname: string;
  avatarUrl: string;
  homepageUrl: string;
  userId?: string;
  cookieHeader?: string;
}

export interface WebContentsLoginProbe {
  executeJavaScript: (code: string) => Promise<unknown>;
}

export interface PageLoginProbe {
  url: () => string;
  evaluate: <T = unknown>(code: string) => Promise<T>;
}

const CHANNELS_HOST = 'channels.weixin.qq.com';
const CHANNELS_AUTH_DATA_URL =
  'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/auth_data';

export const CHANNELS_REQUIRED_COOKIES = ['sessionid', 'wxuin'] as const;

export interface ChannelsCookieLike {
  name: string;
  value: string;
  expires?: number;
  expirationDate?: number;
}

const LOGIN_MARKER_SELECTORS = [
  'iframe[src*="login-for-iframe"]',
  'div.login-qrcode-wrap',
  'div.qrcode-wrap',
  'img.qrcode',
  'img[src*="qrcode"]',
  'img[src*="qr"]',
  '[class*="qrcode"]',
  '[class*="qr-code"]',
  '[class*="login-box"]',
  '[class*="login-page"]',
];

const LOGIN_MARKER_TEXTS = [
  '微信扫码登录 视频号助手',
  '扫码登录',
  '请使用微信扫描二维码',
  '请使用微信扫码',
  '二维码已过期',
  '二维码已失效',
  '需在手机上进行确认',
  '已扫码',
];

const SUCCESS_MARKER_SELECTORS = [
  'a[href*="/platform/post/create"]',
  'a[href*="/platform/post/list"]',
  'a[href*="/platform/post/manage"]',
  'a[href*="/platform/dataCenter"]',
  '[class*="account"] [class*="name"]',
  '[class*="avatar"] img',
];

const SUCCESS_MARKER_TEXTS = [
  '发表视频',
  '内容管理',
  '数据中心',
  '保存草稿',
  '发布记录',
  '视频管理',
  '动态管理',
];

export function isChannelsUrl(currentUrl: string): boolean {
  try {
    return new URL(currentUrl).hostname === CHANNELS_HOST;
  } catch {
    return false;
  }
}

export function isChannelsInternalUrl(currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    return url.hostname === CHANNELS_HOST && (
      url.pathname.startsWith('/platform/') ||
      url.pathname === '/platform' ||
      url.pathname.startsWith('/account')
    );
  } catch {
    return false;
  }
}

function getValueByPath(record: unknown, path: string[]): unknown {
  let current = record;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readErrCode(source: unknown): unknown {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as Record<string, unknown>;
  return record.errCode ?? record.errcode ?? record.err_code;
}

export function hasRequiredChannelsCookies(cookies: ChannelsCookieLike[]): boolean {
  const nowSeconds = Date.now() / 1000;
  return CHANNELS_REQUIRED_COOKIES.every((requiredName) =>
    cookies.some((cookie) => {
      const expires = cookie.expirationDate ?? cookie.expires;
      const notExpired = typeof expires !== 'number' || expires <= 0 || expires > nowSeconds;
      return cookie.name === requiredName && cookie.value.trim().length > 0 && notExpired;
    })
  );
}

export function isChannelsAuthDataLoggedIn(source: unknown): boolean {
  const errCode = readErrCode(source);
  if (errCode !== 0 && errCode !== '0') return false;

  const finderUser = getValueByPath(source, ['data', 'finderUser']);
  if (!finderUser || typeof finderUser !== 'object') return false;

  return Boolean(readString(finderUser as Record<string, unknown>, [
    'uniqId', 'finderUsername', 'nickname', 'nickName', 'username',
  ]));
}

export async function validateChannelsCookieSession(
  cookies: ChannelsCookieLike[],
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!hasRequiredChannelsCookies(cookies)) return false;

  const cookieHeader = cookies
    .filter(cookie => cookie.value.trim())
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');

  try {
    const response = await fetchImpl(CHANNELS_AUTH_DATA_URL, {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: `https://${CHANNELS_HOST}`,
        Referer: `https://${CHANNELS_HOST}/platform`,
      },
      body: '',
    });
    if (!response.ok) return false;
    return isChannelsAuthDataLoggedIn(await response.json());
  } catch {
    return false;
  }
}

function readString(source: Record<string, unknown>, fields: string[]): string {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function profileScore(source: Record<string, unknown>): number {
  const nickname = readString(source, [
    'nickname', 'nickName', 'name', 'adminNickname', 'finderUsername', 'uniqId', 'username',
  ]);
  const avatarUrl = readString(source, [
    'avatarUrl', 'headImgUrl', 'headimgurl', 'headImg', 'head_img_url', 'head_img', 'headUrl', 'head_url', 'avatar_url', 'avatar', 'logo',
  ]);
  return (nickname ? 1 : 0) + (avatarUrl ? 2 : 0);
}

function findChannelsProfileObject(source: unknown, depth = 0, visited = new Set<unknown>()): Record<string, unknown> | null {
  if (!source || typeof source !== 'object' || visited.has(source) || depth > 6) {
    return null;
  }

  visited.add(source);
  const record = source as Record<string, unknown>;
  let best: Record<string, unknown> | null = profileScore(record) > 0 ? record : null;
  let bestScore = best ? profileScore(best) : 0;

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = findChannelsProfileObject(item, depth + 1, visited);
        const score = candidate ? profileScore(candidate) : 0;
        if (candidate && score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      continue;
    }

    const candidate = findChannelsProfileObject(value, depth + 1, visited);
    const score = candidate ? profileScore(candidate) : 0;
    if (candidate && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function buildChannelsLoginProbeScript(): string {
  return `
(async function () {
  var loginMarkerSelectors = ${JSON.stringify(LOGIN_MARKER_SELECTORS)};
  var loginMarkerTexts = ${JSON.stringify(LOGIN_MARKER_TEXTS)};
  var successMarkerSelectors = ${JSON.stringify(SUCCESS_MARKER_SELECTORS)};
  var successMarkerTexts = ${JSON.stringify(SUCCESS_MARKER_TEXTS)};

  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasVisibleSelector(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var nodes = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < nodes.length; j++) {
          if (isVisible(nodes[j])) return true;
        }
      } catch (error) {}
    }
    return false;
  }

  function hasText(phrases) {
    var bodyText = document.body && document.body.innerText ? document.body.innerText : '';
    for (var i = 0; i < phrases.length; i++) {
      if (bodyText.indexOf(phrases[i]) >= 0) return true;
    }
    return false;
  }

  if (hasVisibleSelector(loginMarkerSelectors) || hasText(loginMarkerTexts)) {
    return { loggedIn: false, reason: 'login_marker' };
  }

  var hasPageMarker = hasVisibleSelector(successMarkerSelectors) || hasText(successMarkerTexts);

  if (window.location.hostname !== '${CHANNELS_HOST}') {
    return { loggedIn: false, reason: 'not_channels' };
  }

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? window.setTimeout(function () { controller.abort(); }, 8000) : null;

  try {
    var response = await fetch('/cgi-bin/mmfinderassistant-bin/auth/auth_data', {
      method: 'POST',
      credentials: 'include',
      body: '',
      signal: controller ? controller.signal : undefined
    });

    if (!response.ok) {
      return { loggedIn: false, reason: 'auth_data_http_' + response.status };
    }

    var body = await response.json();
    var errCode = body && (
      body.errCode !== undefined ? body.errCode :
      body.errcode !== undefined ? body.errcode :
      body.err_code
    );
    var finderUser = body && body.data && body.data.finderUser;
    var identity = finderUser && (
      finderUser.uniqId ||
      finderUser.finderUsername ||
      finderUser.nickname ||
      finderUser.nickName ||
      finderUser.username
    );
    if ((errCode === 0 || errCode === '0') && identity) {
      return {
        loggedIn: true,
        reason: hasPageMarker ? 'auth_data_page_marker' : 'auth_data',
        errCode: errCode
      };
    }
    return {
      loggedIn: false,
      reason: hasPageMarker ? 'page_marker_without_auth_data' : 'auth_data_not_logged_in',
      errCode: errCode
    };
  } catch (error) {
    var errName = error && error.name ? error.name : 'UnknownError';
    var reason = errName === 'AbortError' ? 'no_positive_marker:timeout' : 'no_positive_marker:' + errName;
    return { loggedIn: false, reason: reason };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
})()
`;
}

export function buildChannelsProfileProbeScript(): string {
  return `
(async function () {
  if (window.location.hostname !== '${CHANNELS_HOST}') {
    return null;
  }

  function collectRoots() {
    var roots = [];
    function push(root) {
      if (root && roots.indexOf(root) < 0) roots.push(root);
    }
    function scan(root) {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      Array.prototype.forEach.call(root.querySelectorAll('wujie-app'), function (host) {
        if (host && host.shadowRoot) push(host.shadowRoot);
      });
      Array.prototype.forEach.call(root.querySelectorAll('iframe'), function (iframe) {
        try {
          if (iframe.contentDocument) push(iframe.contentDocument);
        } catch (error) {}
      });
    }
    push(document);
    for (var i = 0; i < roots.length; i++) scan(roots[i]);
    return roots;
  }

  function queryAll(selector) {
    var nodes = [];
    collectRoots().forEach(function (root) {
      try {
        nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
      } catch (error) {}
    });
    return nodes.filter(function (node, index) { return nodes.indexOf(node) === index; });
  }

  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var trimmed = url.trim().replace(/^url\\((['"]?)(.*?)\\1\\)$/i, '$2');
    if (!trimmed || trimmed.indexOf('data:') === 0 || trimmed.indexOf('blob:') === 0) return '';
    if (trimmed.indexOf('//') === 0) return 'https:' + trimmed;
    try {
      return new URL(trimmed, location.href).toString();
    } catch (error) {
      return trimmed;
    }
  }

  function isAvatarUrl(url) {
    return /qlogo\\.cn|qpic\\.cn|mmbiz\\.qpic\\.cn|wx\\.qlogo|headimg|avatar|finder/i.test(url || '');
  }

  function extractDomAvatar() {
    var candidates = [];
    queryAll('img, image').forEach(function (el) {
      var src = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('xlink:href') || '';
      if (!src && el.getAttribute('srcset')) {
        src = String(el.getAttribute('srcset')).split(',')[0].trim().split(/\\s+/)[0];
      }
      src = normalizeUrl(src);
      if (src && isAvatarUrl(src) && !/qrcode|qr_code|login/i.test(src)) candidates.push(src);
    });
    queryAll('[style], [class*="avatar"], [class*="head"], [class*="user"], [class*="account"]').forEach(function (el) {
      var bg = '';
      try {
        bg = (el.ownerDocument.defaultView || window).getComputedStyle(el).backgroundImage || '';
      } catch (error) {}
      var match = bg.match(/url\\((['"]?)(.*?)\\1\\)/i);
      var src = normalizeUrl(match && match[2] ? match[2] : '');
      if (src && isAvatarUrl(src) && !/qrcode|qr_code|login/i.test(src)) candidates.push(src);
    });
    return candidates[0] || '';
  }

  function extractDomNickname() {
    var selectors = [
      '[class*="nickname"]',
      '[class*="user-name"]',
      '[class*="username"]',
      '[class*="account-name"]',
      '[class*="finder"] [class*="name"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = queryAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        var text = (nodes[j].innerText || nodes[j].textContent || '').trim();
        if (text && text.length <= 40 && !/首页|内容管理|数据中心|设置|通知|发表|视频/.test(text)) return text;
      }
    }
    return '';
  }

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? window.setTimeout(function () { controller.abort(); }, 3000) : null;

  try {
    var nowHex = Math.floor(Date.now() / 1000).toString(16);
    var randomHex = Array.from({ length: 8 }, function () {
      return Math.floor(Math.random() * 16).toString(16);
    }).join('');
    var response = await fetch('/cgi-bin/mmfinderassistant-bin/auth/get_auth_info?_aid=&_rid=' + nowHex + '-' + randomHex + '&_pageUrl=https:%2F%2Fchannels.weixin.qq.com%2Fplatform', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
        'X-Wechat-Uin': '0000000000'
      },
      body: JSON.stringify({
        timestamp: Date.now(),
        _log_finder_uin: '',
        _log_finder_id: '',
        rawKeyBuff: null,
        pluginSessionId: null,
        scene: 7,
        reqScene: 7
      }),
      signal: controller ? controller.signal : undefined
    });

    if (!response.ok) {
      var domNickname = extractDomNickname();
      var domAvatar = extractDomAvatar();
      return domNickname || domAvatar ? {
        nickname: domNickname,
        avatarUrl: domAvatar,
        homepageUrl: 'https://${CHANNELS_HOST}/platform',
        userId: ''
      } : null;
    }

    var body = await response.json();
    var errCode = body && (
      body.errCode !== undefined ? body.errCode :
      body.errcode !== undefined ? body.errcode :
      body.err_code
    );
    var data = body && (body.data || body);
    var finderUser = data && (
      data.finderUser ||
      data.userInfo ||
      data.user ||
      (data.accountInfo && data.accountInfo.finderUser) ||
      (data.authInfo && data.authInfo.finderUser)
    );
    if (errCode !== 0 || !finderUser) {
      var fallbackNickname = extractDomNickname();
      var fallbackAvatar = extractDomAvatar();
      return fallbackNickname || fallbackAvatar ? {
        nickname: fallbackNickname,
        avatarUrl: fallbackAvatar,
        homepageUrl: 'https://${CHANNELS_HOST}/platform',
        userId: ''
      } : null;
    }

    var nickname = finderUser.nickname || finderUser.name || finderUser.adminNickname || finderUser.finderUsername || finderUser.uniqId || '';
    var avatarUrl = finderUser.headImgUrl || finderUser.headimgurl || finderUser.headImg || finderUser.head_img_url || finderUser.head_img || finderUser.headUrl || finderUser.head_url || finderUser.avatarUrl || finderUser.avatar_url || finderUser.avatar || '';
    if (!nickname) nickname = extractDomNickname();
    if (!avatarUrl) avatarUrl = extractDomAvatar();
    if (!nickname && !avatarUrl) {
      return null;
    }

    return {
      nickname: nickname,
      avatarUrl: avatarUrl,
      homepageUrl: 'https://${CHANNELS_HOST}/platform',
      userId: finderUser.uniqId || finderUser.finderUsername || ''
    };
  } catch (error) {
    return null;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
})()
`;
}

export function normalizeChannelsLoginDetection(
  result: unknown,
  currentUrl: string,
  fallbackReason = 'probe_error'
): ChannelsLoginDetectionResult {
  if (!result || typeof result !== 'object') {
    return { loggedIn: false, reason: fallbackReason, currentUrl };
  }

  const record = result as Record<string, unknown>;
  const errCode = record.errCode ?? record.errcode ?? record.err_code;

  return {
    loggedIn: record.loggedIn === true,
    reason: typeof record.reason === 'string' ? record.reason : fallbackReason,
    currentUrl,
    errCode: typeof errCode === 'number' || typeof errCode === 'string' ? errCode : undefined,
  };
}

export function normalizeChannelsProfile(result: unknown): ChannelsProfileResult | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const record = result as Record<string, unknown>;
  const finderUser =
    getValueByPath(record, ['data', 'finderUser']) ??
    getValueByPath(record, ['finderUser']) ??
    getValueByPath(record, ['data', 'userInfo']) ??
    getValueByPath(record, ['data', 'user']) ??
    getValueByPath(record, ['data', 'accountInfo', 'finderUser']) ??
    getValueByPath(record, ['data', 'authInfo', 'finderUser']);
  const source = finderUser && typeof finderUser === 'object'
    ? finderUser as Record<string, unknown>
    : findChannelsProfileObject(record) || record;

  const nickname = readString(source, [
    'nickname', 'nickName', 'name', 'adminNickname', 'finderUsername', 'uniqId', 'username',
  ]);
  const avatarUrl = readString(source, [
    'avatarUrl', 'headImgUrl', 'headimgurl', 'headImg', 'head_img_url', 'head_img', 'headUrl', 'head_url', 'avatar_url', 'avatar', 'logo',
  ]);
  const homepageUrl = typeof record.homepageUrl === 'string' && record.homepageUrl.trim()
    ? record.homepageUrl.trim()
    : `https://${CHANNELS_HOST}/platform`;
  const userId = readString(source, ['userId', 'uniqId', 'finderUsername']) ||
    (typeof record.userId === 'string' && record.userId.trim()
      ? record.userId.trim()
      : undefined);

  if (!nickname && !avatarUrl) {
    return null;
  }

  return { nickname, avatarUrl, homepageUrl, userId };
}

export async function detectChannelsLoginInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<ChannelsLoginDetectionResult> {
  if (!isChannelsUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_channels', currentUrl };
  }

  try {
    const result = await webContents.executeJavaScript(buildChannelsLoginProbeScript());
    return normalizeChannelsLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}

export async function detectChannelsProfileInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<ChannelsProfileResult | null> {
  if (!isChannelsUrl(currentUrl)) {
    return null;
  }

  try {
    const result = await webContents.executeJavaScript(buildChannelsProfileProbeScript());
    return normalizeChannelsProfile(result);
  } catch {
    return null;
  }
}

export async function detectChannelsProfileInPage(
  page: PageLoginProbe
): Promise<ChannelsProfileResult | null> {
  if (!isChannelsUrl(page.url())) {
    return null;
  }

  try {
    const result = await page.evaluate(buildChannelsProfileProbeScript());
    return normalizeChannelsProfile(result);
  } catch {
    return null;
  }
}

export async function detectChannelsLoginInPage(
  page: PageLoginProbe
): Promise<ChannelsLoginDetectionResult> {
  const currentUrl = page.url();
  if (!isChannelsUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_channels', currentUrl };
  }

  try {
    const result = await page.evaluate(buildChannelsLoginProbeScript());
    return normalizeChannelsLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}
