export interface XhsLoginDetectionResult {
  loggedIn: boolean;
  reason: string;
  currentUrl?: string;
  errCode?: number | string;
}

export interface XhsProfileResult {
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

const XHS_HOST = 'creator.xiaohongshu.com';

export const XHS_REQUIRED_COOKIES = ['a1'] as const;
export const XHS_AUTH_COOKIES = [
  'customer-sso-sid',
  'access-token-creator.xiaohongshu.com',
  'galaxy_creator_session_id',
  'web_session',
] as const;

export interface XhsCookieLike {
  name: string;
  value: string;
  expires?: number;
  expirationDate?: number;
}

const LOGIN_MARKER_SELECTORS = [
  'text="扫码登录"',
  'text="手机登录"',
  'text="短信登录"',
  '[class*="login-tab"]',
  '[class*="login-qrcode"]',
  '[class*="qrcode"]',
  'img[src*="qrcode"]',
  '[class*="login-box"]',
  '[class*="login-page"]',
  'input[placeholder*="手机号"]',
  'input[placeholder*="验证码"]',
];

const LOGIN_MARKER_TEXTS = [
  '扫码登录',
  '手机登录',
  '短信登录',
  '请使用小红书扫码',
  '二维码已过期',
  '二维码已失效',
  '，请在手机上确认登录',
  '已扫码',
  '发送验证码',
  '忘记密码',
  '登 录',
];

const SUCCESS_MARKER_SELECTORS = [
  'a[href*="/publish/publish"]',
  'a[href*="/content/manage"]',
  'a[href*="/datacenter"]',
  '[class*="avatar"] img',
  '[class*="user-avatar"]',
  '[class*="nickname"]',
];

const SUCCESS_MARKER_TEXTS = [
  '发布作品',
  '内容管理',
  '数据中心',
  '保存草稿',
  '发布记录',
  '创作中心',
];

export function isXhsUrl(currentUrl: string): boolean {
  try {
    return new URL(currentUrl).hostname === XHS_HOST ||
      new URL(currentUrl).hostname.endsWith('.xiaohongshu.com');
  } catch {
    return false;
  }
}

export function isXhsInternalUrl(currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    return url.hostname === XHS_HOST ||
      url.hostname.endsWith('.xiaohongshu.com');
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

export function hasRequiredXhsCookies(cookies: XhsCookieLike[]): boolean {
  const nowSeconds = Date.now() / 1000;
  const validNames = new Set(cookies
    .filter((cookie) => {
      const expires = cookie.expirationDate ?? cookie.expires;
      return cookie.value.trim().length > 0 &&
        (typeof expires !== 'number' || expires <= 0 || expires > nowSeconds);
    })
    .map(cookie => cookie.name));

  return XHS_REQUIRED_COOKIES.every(name => validNames.has(name)) &&
    XHS_AUTH_COOKIES.some(name => validNames.has(name));
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
    'nickname', 'nickName', 'name', 'userName', 'username', 'displayName',
    'accountName', 'creatorName',
  ]);
  const avatarUrl = readString(source, [
    'avatarUrl', 'headImgUrl', 'avatar', 'headImg', 'head_img_url', 'logo',
    'avatar_url', 'image',
  ]);
  return (nickname ? 2 : 0) + (avatarUrl ? 1 : 0);
}

function findXhsProfileObject(source: unknown, depth = 0, visited = new Set<unknown>()): Record<string, unknown> | null {
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
        const candidate = findXhsProfileObject(item, depth + 1, visited);
        const score = candidate ? profileScore(candidate) : 0;
        if (candidate && score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      continue;
    }

    const candidate = findXhsProfileObject(value, depth + 1, visited);
    const score = candidate ? profileScore(candidate) : 0;
    if (candidate && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function buildXhsLoginProbeScript(): string {
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

  if (window.location.hostname.indexOf('xiaohongshu.com') < 0) {
    return { loggedIn: false, reason: 'not_xhs' };
  }

  // Check for success markers on page
  if (hasPageMarker) {
    return { loggedIn: true, reason: 'page_marker', currentUrl: window.location.href };
  }

  // Check if we're on an internal page (publish, content manage, etc.)
  var internalPaths = ['/publish/', '/content/', '/datacenter/', '/creator/'];
  var isInternal = internalPaths.some(function(path) {
    return window.location.pathname.indexOf(path) >= 0;
  });

  if (isInternal) {
    // On internal page but no success marker - check for user avatar
    var avatarNodes = document.querySelectorAll('[class*="avatar"] img, [class*="user-avatar"]');
    for (var i = 0; i < avatarNodes.length; i++) {
      if (isVisible(avatarNodes[i])) {
        return { loggedIn: true, reason: 'internal_page_avatar', currentUrl: window.location.href };
      }
    }
    return { loggedIn: true, reason: 'internal_page', currentUrl: window.location.href };
  }

  return { loggedIn: false, reason: 'no_marker', currentUrl: window.location.href };
})()
`;
}

export function buildXhsProfileProbeScript(): string {
  return `
(async function () {
  if (window.location.hostname.indexOf('xiaohongshu.com') < 0) {
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
    return /xiaohongshu|qlogo|qpic|image|avatar|headimg/i.test(url || '');
  }

  function isNickname(text) {
    if (!text || text.length > 40) return false;
    return !/首页|内容管理|数据中心|设置|通知|发布|作品|登录|注册|扫码|消息|帮助|反馈|创作服务平台/i.test(text);
  }

  function readString(source, fields) {
    if (!source || typeof source !== 'object') return '';
    for (var i = 0; i < fields.length; i++) {
      var value = source[fields[i]];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function profileScore(source) {
    var nickname = readString(source, [
      'nickname', 'nickName', 'name', 'userName', 'username', 'displayName',
      'accountName', 'creatorName'
    ]);
    var avatarUrl = readString(source, [
      'avatarUrl', 'headImgUrl', 'avatar', 'headImg', 'head_img_url', 'logo',
      'avatar_url', 'image'
    ]);
    return (nickname ? 2 : 0) + (avatarUrl ? 1 : 0);
  }

  function findProfileObject(source, depth, visited) {
    if (!source || typeof source !== 'object' || depth > 6 || visited.indexOf(source) >= 0) return null;
    visited.push(source);
    var best = profileScore(source) > 0 ? source : null;
    var bestScore = best ? profileScore(best) : 0;
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (!value || typeof value !== 'object') return;
      var values = Array.isArray(value) ? value : [value];
      values.forEach(function (item) {
        var candidate = findProfileObject(item, depth + 1, visited);
        var score = candidate ? profileScore(candidate) : 0;
        if (candidate && score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      });
    });
    return best;
  }

  function extractStateProfile() {
    var sources = [
      window.__INITIAL_STATE__,
      window.__NUXT__,
      window.__APOLLO_STATE__,
      window.__STORE__,
      window.__PINIA__,
    ];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var value = localStorage.getItem(localStorage.key(i));
        if (!value || (value.charAt(0) !== '{' && value.charAt(0) !== '[')) continue;
        try {
          sources.push(JSON.parse(value));
        } catch (error) {}
      }
    } catch (error) {}

    var best = null;
    var bestScore = 0;
    sources.forEach(function (source) {
      var candidate = findProfileObject(source, 0, []);
      var score = candidate ? profileScore(candidate) : 0;
      if (candidate && score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best;
  }

  function extractDomAvatar() {
    var candidates = [];

    var avatarImgSelectors = [
      '[class*="avatar"] img',
      '[class*="user-avatar"] img',
      '[class*="header"] img',
      '[class*="sidebar"] img',
      '.menu-avatar img',
      '.profile-avatar img',
      'img[class*="avatar"]',
      'img[class*="head"]',
    ];
    avatarImgSelectors.forEach(function (sel) {
      queryAll(sel).forEach(function (el) {
        var src = el.currentSrc || el.src || el.getAttribute('src') || '';
        if (!src && el.getAttribute('srcset')) {
          src = String(el.getAttribute('srcset')).split(',')[0].trim().split(/\\s+/)[0];
        }
        src = normalizeUrl(src);
        if (src && isAvatarUrl(src) && !/qrcode|qr_code|login|logo|icon_/i.test(src)) candidates.push(src);
      });
    });

    queryAll('img, image').forEach(function (el) {
      var src = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('xlink:href') || '';
      if (!src && el.getAttribute('srcset')) {
        src = String(el.getAttribute('srcset')).split(',')[0].trim().split(/\\s+/)[0];
      }
      src = normalizeUrl(src);
      if (src && isAvatarUrl(src) && !/qrcode|qr_code|login|logo|icon_/i.test(src)) candidates.push(src);
    });
    queryAll('[style], [class*="avatar"], [class*="head"], [class*="user"], [class*="account"], [class*="profile"]').forEach(function (el) {
      var bg = '';
      try {
        bg = (el.ownerDocument.defaultView || window).getComputedStyle(el).backgroundImage || '';
      } catch (error) {}
      var match = bg.match(/url\\((['"]?)(.*?)\\1\\)/i);
      var src = normalizeUrl(match && match[2] ? match[2] : '');
      if (src && isAvatarUrl(src) && !/qrcode|qr_code|login|logo|icon_/i.test(src)) candidates.push(src);
    });

    var preferred = '';
    for (var k = 0; k < candidates.length; k++) {
      var url = candidates[k];
      if (preferred.indexOf('/') > 0 && url.indexOf('132') < 0 && url.indexOf('/avatar') < 0) continue;
      if (url.indexOf('/avatar') >= 0 || url.indexOf('h_') >= 0) {
        preferred = url;
        break;
      }
      if (!preferred) preferred = url;
    }
    return preferred || candidates[0] || '';
  }

  function extractDomNickname() {
    var selectors = [
      '.top-nickname',
      '.user-info-nickname',
      '[class*="nickname"]',
      '[class*="user-name"]',
      '[class*="username"]',
      '[class*="account-name"]',
      '[class*="display-name"]',
      '[class*="creator-name"]',
      '.sidebar .name',
      '.header .name',
      '[class*="sidebar"] [class*="user"]',
      '[class*="header"] [class*="user"]',
      '.menu-item-name',
      '.profile-name',
      '.name-text',
      '[class*="user-info"] span',
      '.avatar-name',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = queryAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        var text = (nodes[j].innerText || nodes[j].textContent || '').trim();
        if (isNickname(text)) return text;
      }
    }

    var avatarNodes = queryAll('[class*="avatar"] img, [class*="user-avatar"] img, .avatar img, img[class*="avatar"]');
    for (var k = 0; k < avatarNodes.length; k++) {
      var el = avatarNodes[k];
      var alt = (el.getAttribute('alt') || '').trim();
      if (isNickname(alt) && !/头像|avatar|icon|logo|默认/i.test(alt)) return alt;

      var parent = el.parentElement;
      for (var depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
        var textNodes = parent.querySelectorAll('span, div, p');
        for (var n = 0; n < textNodes.length; n++) {
          var nearbyText = (textNodes[n].innerText || textNodes[n].textContent || '').trim();
          if (isNickname(nearbyText)) return nearbyText;
        }
      }
    }

    return '';
  }

  var stateProfile = extractStateProfile();
  var nickname = readString(stateProfile, [
    'nickname', 'nickName', 'name', 'userName', 'username', 'displayName',
    'accountName', 'creatorName'
  ]) || extractDomNickname();
  var avatarUrl = normalizeUrl(readString(stateProfile, [
    'avatarUrl', 'headImgUrl', 'avatar', 'headImg', 'head_img_url', 'logo',
    'avatar_url', 'image'
  ])) || extractDomAvatar();
  var userId = readString(stateProfile, ['userId', 'user_id', 'redId', 'xhsId', 'id']);

  if (!nickname && !avatarUrl) {
    return null;
  }

  return {
    nickname: nickname,
    avatarUrl: avatarUrl,
    homepageUrl: window.location.origin || 'https://creator.xiaohongshu.com',
    userId: userId
  };
})()
`;
}

export function normalizeXhsLoginDetection(
  result: unknown,
  currentUrl: string,
  fallbackReason = 'probe_error'
): XhsLoginDetectionResult {
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

export function normalizeXhsProfile(result: unknown): XhsProfileResult | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const record = result as Record<string, unknown>;
  const profile = findXhsProfileObject(record) || record;
  const nickname = readString(profile, [
    'nickname', 'nickName', 'name', 'userName', 'username', 'displayName',
    'accountName', 'creatorName',
  ]);
  const avatarUrl = readString(profile, [
    'avatarUrl', 'headImgUrl', 'avatar', 'headImg', 'head_img_url', 'logo',
    'avatar_url', 'image',
  ]);
  const homepageUrl = typeof profile.homepageUrl === 'string' && profile.homepageUrl.trim()
    ? profile.homepageUrl.trim()
    : typeof record.homepageUrl === 'string' && record.homepageUrl.trim()
      ? record.homepageUrl.trim()
    : `https://${XHS_HOST}`;
  const userId = readString(profile, ['userId', 'user_id', 'uniqId', 'redId', 'xhsId', 'id']) || undefined;

  if (!nickname && !avatarUrl) {
    return null;
  }

  return { nickname, avatarUrl, homepageUrl, userId };
}

export async function detectXhsLoginInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<XhsLoginDetectionResult> {
  if (!isXhsUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_xhs', currentUrl };
  }

  try {
    const result = await webContents.executeJavaScript(buildXhsLoginProbeScript());
    return normalizeXhsLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}

export async function detectXhsProfileInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<XhsProfileResult | null> {
  if (!isXhsUrl(currentUrl)) {
    return null;
  }

  try {
    const result = await webContents.executeJavaScript(buildXhsProfileProbeScript());
    return normalizeXhsProfile(result);
  } catch {
    return null;
  }
}

export async function detectXhsProfileInPage(
  page: PageLoginProbe
): Promise<XhsProfileResult | null> {
  if (!isXhsUrl(page.url())) {
    return null;
  }

  try {
    const result = await page.evaluate(buildXhsProfileProbeScript());
    return normalizeXhsProfile(result);
  } catch {
    return null;
  }
}

export async function detectXhsLoginInPage(
  page: PageLoginProbe
): Promise<XhsLoginDetectionResult> {
  const currentUrl = page.url();
  if (!isXhsUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_xhs', currentUrl };
  }

  try {
    const result = await page.evaluate(buildXhsLoginProbeScript());
    return normalizeXhsLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}
