export interface DouyinLoginDetectionResult {
  loggedIn: boolean;
  reason: string;
  currentUrl?: string;
  errCode?: number | string;
}

export interface DouyinProfileResult {
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

const DOUYIN_HOST = 'creator.douyin.com';
const DOUYIN_AUTH_URL =
  'https://creator.douyin.com/creator-micro/home';

export const DOUYIN_REQUIRED_COOKIES = ['sessionid', 'sid_tt'] as const;

export interface DouyinCookieLike {
  name: string;
  value: string;
  expires?: number;
  expirationDate?: number;
}

const LOGIN_MARKER_SELECTORS = [
  'img[aria-label="二维码"]',
  '[class*="qrcode"]',
  '[class*="qr-code"]',
  '[class*="login"]',
  '[class*="login-page"]',
  '[class*="scan-login"]',
];

const LOGIN_MARKER_TEXTS = [
  '扫码登录',
  '手机号登录',
  '请使用抖音 APP 扫码',
  '二维码已失效',
  '二维码已过期',
  '请重新扫码',
];

const SUCCESS_MARKER_SELECTORS = [
  'a[href*="/creator-micro/home"]',
  'a[href*="/creator-micro/content"]',
  '[class*="avatar"] img',
  '[class*="user-info"]',
  '[class*="nickname"]',
];

const SUCCESS_MARKER_TEXTS = [
  '创作中心',
  '内容管理',
  '发布视频',
  '数据中心',
  '首页',
];

export function isDouyinUrl(currentUrl: string): boolean {
  try {
    return new URL(currentUrl).hostname === DOUYIN_HOST ||
           currentUrl.includes('douyin.com');
  } catch {
    return false;
  }
}

export function isDouyinInternalUrl(currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    return (url.hostname === DOUYIN_HOST || currentUrl.includes('douyin.com')) && (
      url.pathname.startsWith('/creator-micro/') ||
      url.pathname.startsWith('/creator/')
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

export function hasRequiredDouyinCookies(cookies: DouyinCookieLike[]): boolean {
  const nowSeconds = Date.now() / 1000;
  return DOUYIN_REQUIRED_COOKIES.every((requiredName) =>
    cookies.some((cookie) => {
      const expires = cookie.expirationDate ?? cookie.expires;
      const notExpired = typeof expires !== 'number' || expires <= 0 || expires > nowSeconds;
      return cookie.name === requiredName && cookie.value.trim().length > 0 && notExpired;
    })
  );
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
    'nickname', 'nickName', 'name', 'userName', 'user_name', 'displayName',
  ]);
  const avatarUrl = readString(source, [
    'avatarUrl', 'avatar', 'headImgUrl', 'headimgurl', 'headImg', 'head_url',
  ]);
  return (nickname ? 1 : 0) + (avatarUrl ? 2 : 0);
}

function findDouyinProfileObject(source: unknown, depth = 0, visited = new Set<unknown>()): Record<string, unknown> | null {
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
        const candidate = findDouyinProfileObject(item, depth + 1, visited);
        const score = candidate ? profileScore(candidate) : 0;
        if (candidate && score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      continue;
    }

    const candidate = findDouyinProfileObject(value, depth + 1, visited);
    const score = candidate ? profileScore(candidate) : 0;
    if (candidate && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function buildDouyinLoginProbeScript(): string {
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
    var scanLoginVisible = hasText(['扫码登录']) && !hasText(['创作中心', '内容管理']);
    if (scanLoginVisible) {
      return { loggedIn: false, reason: 'login_marker' };
    }
  }

  var hasPageMarker = hasVisibleSelector(successMarkerSelectors) || hasText(successMarkerTexts);

  if (!window.location.hostname.includes('douyin.com')) {
    return { loggedIn: false, reason: 'not_douyin' };
  }

  var loggedInMarkers = [
    '[class*="avatar"] img[src*="douyin"]',
    '[class*="user-info"]',
    '[class*="nickname"]',
    'a[href*="/creator-micro/home"]',
    '[class*="creator-home"]'
  ];

  for (var i = 0; i < loggedInMarkers.length; i++) {
    try {
      var nodes = document.querySelectorAll(loggedInMarkers[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (isVisible(nodes[j])) {
          return {
            loggedIn: true,
            reason: hasPageMarker ? 'page_marker' : 'dom_marker',
            errCode: 0
          };
        }
      }
    } catch (error) {}
  }

  if (window.location.pathname.includes('/creator-micro/home') ||
      window.location.pathname.includes('/creator-micro/content')) {
    return {
      loggedIn: true,
      reason: 'url_match',
      errCode: 0
    };
  }

  return {
    loggedIn: false,
    reason: hasPageMarker ? 'page_marker_without_login' : 'no_login_marker',
    errCode: -1
  };
})()
`;
}

export function buildDouyinProfileProbeScript(): string {
  return `
(async function () {
  if (!window.location.hostname.includes('douyin.com')) {
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
    return /douyin|pstatp|bytedns|bytecdn|ies|pstatp/i.test(url || '');
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
      '[class*="display-name"]',
      '[class*="creator-name"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = queryAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        var text = (nodes[j].innerText || nodes[j].textContent || '').trim();
        if (text && text.length <= 40 && !/首页|内容管理|数据中心|设置|通知|发表|视频|创作中心/.test(text)) return text;
      }
    }
    return '';
  }

  var domNickname = extractDomNickname();
  var domAvatar = extractDomAvatar();

  if (domNickname || domAvatar) {
    return {
      nickname: domNickname || 'douyin_user',
      avatarUrl: domAvatar || '',
      homepageUrl: window.location.href.split('?')[0],
      userId: ''
    };
  }

  return null;
})()
`;
}

export function normalizeDouyinLoginDetection(
  result: unknown,
  currentUrl: string,
  fallbackReason = 'probe_error'
): DouyinLoginDetectionResult {
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

export function normalizeDouyinProfile(result: unknown): DouyinProfileResult | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const record = result as Record<string, unknown>;
  const nickname = readString(record, [
    'nickname', 'nickName', 'name', 'userName', 'displayName',
  ]);
  const avatarUrl = readString(record, [
    'avatarUrl', 'avatar', 'headImgUrl', 'headimgurl', 'headImg', 'head_url',
  ]);
  const homepageUrl = typeof record.homepageUrl === 'string' && record.homepageUrl.trim()
    ? record.homepageUrl.trim()
    : `https://${DOUYIN_HOST}/creator-micro/home`;
  const userId = readString(record, ['userId', 'uid', 'user_id']) ||
    (typeof record.userId === 'string' && record.userId.trim()
      ? record.userId.trim()
      : undefined);

  if (!nickname && !avatarUrl) {
    return null;
  }

  return { nickname, avatarUrl, homepageUrl, userId };
}

export async function detectDouyinLoginInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<DouyinLoginDetectionResult> {
  if (!isDouyinUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_douyin', currentUrl };
  }

  try {
    const result = await webContents.executeJavaScript(buildDouyinLoginProbeScript());
    return normalizeDouyinLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}

export async function detectDouyinProfileInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<DouyinProfileResult | null> {
  if (!isDouyinUrl(currentUrl)) {
    return null;
  }

  try {
    const result = await webContents.executeJavaScript(buildDouyinProfileProbeScript());
    return normalizeDouyinProfile(result);
  } catch {
    return null;
  }
}

export async function detectDouyinProfileInPage(
  page: PageLoginProbe
): Promise<DouyinProfileResult | null> {
  if (!isDouyinUrl(page.url())) {
    return null;
  }

  try {
    const result = await page.evaluate(buildDouyinProfileProbeScript());
    return normalizeDouyinProfile(result);
  } catch {
    return null;
  }
}

export async function detectDouyinLoginInPage(
  page: PageLoginProbe
): Promise<DouyinLoginDetectionResult> {
  const currentUrl = page.url();
  if (!isDouyinUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_douyin', currentUrl };
  }

  try {
    const result = await page.evaluate(buildDouyinLoginProbeScript());
    return normalizeDouyinLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}