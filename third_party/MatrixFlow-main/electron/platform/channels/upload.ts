import fs from 'fs';
import path from 'path';
import type { BrowserContext, Page } from 'patchright';
import { chromium } from 'patchright';
import type { WebContents } from 'electron';
import { Logger } from '../../core/Logger';
import { CHANNELS_URLS, UPLOAD_SELECTORS, LOGIN_SELECTORS } from './selectors';
import { getCookiePath, cookieExists } from './cookie';
import type { UploadContext, UploadResult } from '../base/types';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { toPlatformError, AuthError, SelectorError, ContentRejectedError } from '../base/PlatformError';
import { accountService } from '../../services/AccountService';
import { getDebugRecorder } from '../base/DebugRecorder';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';
import { browserManager } from '../../services/embedded-browser/browser-manager';
import { createBrowserLauncher } from '../../services/browser-launcher';
import { shouldPreserveStandaloneBrowserAfterFailure } from '../../services/publish-browser-policy';
import type { BrowserConfig, IBrowserLauncher } from '../../services/types';
import {
  applyLocation,
  applyOriginalStatement,
  applySchedule,
  formatChannelsScheduleDateTime,
  formatChannelsShortTitle,
  setShortTitle,
} from './publish';

const logger = new Logger('ChannelsUpload');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

type NormalizedBrowserMode = 'embedded' | 'chrome' | 'fingerprint';

function normalizeBrowserMode(mode?: UploadContext['browserMode']): NormalizedBrowserMode {
  if (mode === 'chrome' || mode === 'external_chrome') return 'chrome';
  if (mode === 'fingerprint' || mode === 'external_fingerprint') return 'fingerprint';
  return 'embedded';
}

const EMBEDDED_DOM_HELPERS = `
  const collectRoots = () => {
    const roots = [];
    const push = (root) => {
      if (root && !roots.includes(root)) roots.push(root);
    };
    const scan = (root) => {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      for (const element of Array.from(root.querySelectorAll('*'))) {
        try {
          if (element.shadowRoot) push(element.shadowRoot);
          if (element.tagName === 'IFRAME' && element.contentDocument) {
            push(element.contentDocument);
          }
        } catch {}
      }
    };

    push(document);
    for (let i = 0; i < roots.length; i += 1) {
      scan(roots[i]);
    }
    return roots;
  };

  const queryAll = (selector) => {
    const nodes = [];
    for (const root of collectRoots()) {
      try {
        nodes.push(...Array.from(root.querySelectorAll(selector)));
      } catch {}
    }
    return Array.from(new Set(nodes));
  };

  const rootText = () => collectRoots()
    .map((root) => root.body?.innerText || root.host?.innerText || root.textContent || '')
    .join('\\n');

  const textOf = (el) => (el?.innerText || el?.textContent || '').trim();

  const isVisible = (el) => {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    const view = el.ownerDocument?.defaultView || window;
    const style = view.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  const closestClickable = (el) => {
    if (!el) return null;
    return el.closest?.('button, [role="button"], label, a') || el;
  };

  const clickElement = (el) => {
    const target = closestClickable(el);
    if (!target || typeof target.click !== 'function') return false;
    target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    const view = target.ownerDocument?.defaultView || window;
    target.dispatchEvent(new view.MouseEvent('mouseover', { bubbles: true }));
    target.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new view.MouseEvent('mouseup', { bubbles: true }));
    target.click();
    return true;
  };

  const pickFileInput = (kind) => {
    const selectors = kind === 'image'
      ? ['input[type="file"][accept*="image"]', 'input[type="file"]']
      : ['input[type="file"][accept*="video"]', 'input[type="file"][accept*="mp4"]', 'input[type="file"][accept*=".mp4"]', 'input[type="file"]'];
    const inputs = selectors.flatMap((selector) => queryAll(selector));
    const uniqueInputs = Array.from(new Set(inputs));
    return uniqueInputs.find((input) => {
      const accept = String(input.getAttribute?.('accept') || '').toLowerCase();
      return kind === 'image'
        ? /image|png|jpe?g|webp/.test(accept)
        : /video|mp4|mov|quicktime|mpeg/.test(accept);
    }) || uniqueInputs[0] || null;
  };
`;

async function waitForUploadComplete(page: Page, maxWaitMs: number = 180000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (page.isClosed()) {
        logger.warn('等待上传完成中止：页面已关闭');
        return false;
      }

      const successVisible = await page.getByText('上传成功').isVisible().catch(() => false);
      const failedVisible = await page.getByText('上传失败').isVisible().catch(() => false);
      const progressVisible = await page.locator(UPLOAD_SELECTORS.uploadProgress).first().isVisible().catch(() => false);

      if (successVisible) {
        logger.info('视频上传成功');
        return true;
      }

      if (failedVisible) {
        logger.error('视频上传失败');

        // 尝试点击重新上传
        const reUploadBtn = page.locator(UPLOAD_SELECTORS.reUploadBtn).first();
        if ((await reUploadBtn.count()) && (await reUploadBtn.isVisible().catch(() => false))) {
          logger.info('尝试重新上传...');
          await reUploadBtn.click();
          continue;
        }

        return false;
      }

      if (progressVisible) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        logger.info(`视频处理中... 已等待 ${elapsed} 秒`);
      }

      await page.waitForTimeout(3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Target page, context or browser has been closed|Page closed|Browser has been closed/i.test(message)) {
        logger.warn(`等待上传完成中止：页面或浏览器已关闭 (${message})`);
        return false;
      }
      logger.warn('等待上传完成时出错:', error);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  logger.error(`上传等待超时（${maxWaitMs / 1000} 秒）`);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendEmbeddedMouseClick(wc: WebContents, x: number, y: number): void {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  wc.sendInputEvent({ type: 'mouseMove', x: roundedX, y: roundedY });
  wc.sendInputEvent({
    type: 'mouseDown',
    x: roundedX,
    y: roundedY,
    button: 'left',
    clickCount: 1,
  });
  wc.sendInputEvent({
    type: 'mouseUp',
    x: roundedX,
    y: roundedY,
    button: 'left',
    clickCount: 1,
  });
}

function sendEmbeddedKeyPress(wc: WebContents, keyCode: string): void {
  wc.sendInputEvent({ type: 'keyDown', keyCode });
  wc.sendInputEvent({ type: 'keyUp', keyCode });
}

async function executeInEmbeddedFrames<T>(
  wc: WebContents,
  script: string,
  stopWhen?: (result: T) => boolean,
): Promise<Array<{ url: string; result: T }>> {
  const mainFrame = wc.mainFrame;
  if (!mainFrame) {
    try {
      const result = await wc.executeJavaScript(script, true) as T;
      return [{ url: '', result }];
    } catch {
      return [];
    }
  }

  const frames = Array.from(new Set([mainFrame, ...mainFrame.framesInSubtree]));
  const results: Array<{ url: string; result: T }> = [];
  for (const frame of frames) {
    try {
      const result = await frame.executeJavaScript(script, true) as T;
      results.push({ url: frame.url, result });
      if (stopWhen?.(result)) break;
    } catch {
      // Frames may be cross-origin or replaced while the Wujie page updates.
    }
  }
  return results;
}

export function shouldKeepBrowserOnPublishFailure(failureMessage: string): boolean {
  return shouldPreserveStandaloneBrowserAfterFailure('channels', failureMessage);
}

async function waitForEmbeddedReady(wc: WebContents, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastLog = 0;

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('账号浏览器页面已关闭', undefined, 'channels');
    }

    const state = await wc.executeJavaScript(`
      (() => ({
        readyState: document.readyState,
        url: location.href,
        hasWujie: !!document.querySelector('wujie-app'),
      }))()
    `, true).catch(() => ({ readyState: 'unknown', url: wc.getURL(), hasWujie: false })) as {
      readyState: string;
      url: string;
      hasWujie: boolean;
    };

    if (!wc.isLoadingMainFrame() && state.readyState !== 'loading') {
      logger.info(`视频号账号浏览器页面已加载: url=${state.url} hasWujie=${state.hasWujie}`);
      return;
    }

    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      logger.info(`等待视频号发布页加载: url=${state.url} readyState=${state.readyState} loading=${wc.isLoadingMainFrame()}`);
    }
    await sleep(500);
  }
  throw new SelectorError('等待视频号账号浏览器页面加载超时', undefined, 'channels');
}

async function loadEmbeddedUrl(wc: WebContents, url: string, timeoutMs: number): Promise<void> {
  logger.info(`视频号账号浏览器加载发布页: current=${wc.getURL()} target=${url}`);

  const timeout = Symbol('timeout');
  const loadPromise = wc.loadURL(url)
    .then(() => true)
    .catch((error: Error & { errno?: number }) => {
      if (error.errno !== -3) {
        logger.warn(`视频号账号浏览器加载发布页失败: ${error.message}`);
      }
      return false;
    });

  const result = await Promise.race([
    loadPromise,
    sleep(timeoutMs).then(() => timeout),
  ]);

  if (result === timeout) {
    logger.warn(`视频号账号浏览器加载发布页等待超时，继续检查页面状态: current=${wc.getURL()}`);
  }
}

async function waitForEmbeddedUploadSurface(wc: WebContents, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastLog = 0;

  logger.info('等待视频号发布页上传控件渲染...');
  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('账号浏览器页面已关闭', undefined, 'channels');
    }

    const state = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const bodyText = rootText();
        const fileInputs = queryAll('input[type="file"]');
        const uploadEntries = queryAll('button, [role="button"], label, div, span')
          .filter((el) => isVisible(el) && /上传视频|选择视频|发表视频|发布视频|视频上传|本地上传/.test(textOf(el)));
        return {
          url: location.href,
          rootCount: collectRoots().length,
          hasWujie: !!document.querySelector('wujie-app'),
          fileInputCount: fileInputs.length,
          uploadEntryCount: uploadEntries.length,
          loginVisible: /扫码登录|微信扫码登录|请使用微信扫描|二维码/.test(bodyText),
          publishPageVisible: /上传视频|发表视频|描述|短标题|原创|保存草稿/.test(bodyText),
        };
      })()
    `, true).catch(() => ({
      url: wc.getURL(),
      rootCount: 1,
      hasWujie: false,
      fileInputCount: 0,
      uploadEntryCount: 0,
      loginVisible: false,
      publishPageVisible: false,
    })) as {
      url: string;
      rootCount: number;
      hasWujie: boolean;
      fileInputCount: number;
      uploadEntryCount: number;
      loginVisible: boolean;
      publishPageVisible: boolean;
    };

    if (state.loginVisible) {
      throw new AuthError('账号浏览器显示视频号登录页，请先完成登录', undefined, 'channels');
    }

    if (!state.url.includes('/platform/post/create') && Date.now() - start > 3000) {
      await loadEmbeddedUrl(wc, CHANNELS_URLS.upload, 10000).catch(() => undefined);
      await waitForEmbeddedReady(wc, 30000).catch(() => undefined);
    }

    if (state.fileInputCount > 0 || state.uploadEntryCount > 0 || state.publishPageVisible) {
      logger.info(`视频号账号浏览器上传区域已就绪: roots=${state.rootCount} wujie=${state.hasWujie} inputs=${state.fileInputCount} entries=${state.uploadEntryCount}`);
      return;
    }

    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      logger.info(`等待视频号上传控件: url=${state.url} roots=${state.rootCount} wujie=${state.hasWujie} inputs=${state.fileInputCount} entries=${state.uploadEntryCount}`);
    }

    await sleep(1000);
  }

  const diagnostics = await getEmbeddedUploadDiagnostics(wc).catch(() => `url=${wc.getURL()}`);
  throw new SelectorError(`等待视频号发布页上传控件超时: ${diagnostics}`, undefined, 'channels');
}

async function attachDebuggerIfNeeded(wc: WebContents): Promise<boolean> {
  if (wc.debugger.isAttached()) {
    await wc.debugger.sendCommand('DOM.enable').catch(() => undefined);
    await wc.debugger.sendCommand('Runtime.enable').catch(() => undefined);
    await wc.debugger.sendCommand('Page.enable').catch(() => undefined);
    return false;
  }
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('DOM.enable').catch(() => undefined);
  await wc.debugger.sendCommand('Runtime.enable').catch(() => undefined);
  await wc.debugger.sendCommand('Page.enable').catch(() => undefined);
  return true;
}

interface EmbeddedFileInputHandle {
  nodeId?: number;
  backendNodeId?: number;
  objectId?: string;
}

async function releaseEmbeddedFileInputHandle(wc: WebContents, handle: EmbeddedFileInputHandle | null): Promise<void> {
  if (handle?.objectId) {
    await wc.debugger.sendCommand('Runtime.releaseObject', { objectId: handle.objectId }).catch(() => undefined);
  }
}

async function findEmbeddedFileInputHandle(wc: WebContents, kind: 'video' | 'image' = 'video'): Promise<EmbeddedFileInputHandle | null> {
  const expression = `
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      return pickFileInput(${JSON.stringify(kind)});
    })()
  `;

  const evalResult = await wc.debugger.sendCommand('Runtime.evaluate', {
    expression,
    objectGroup: 'matrixflow-channels-upload',
    returnByValue: false,
  }) as {
    result?: {
      objectId?: string;
      subtype?: string;
      type?: string;
    };
    exceptionDetails?: unknown;
  };

  if (evalResult.exceptionDetails || !evalResult.result?.objectId || evalResult.result.subtype === 'null') {
    return null;
  }

  const objectId = evalResult.result.objectId;
  const nodeResult = await wc.debugger.sendCommand('DOM.requestNode', { objectId })
    .catch(() => null) as { nodeId?: number } | null;
  const describeResult = await wc.debugger.sendCommand('DOM.describeNode', { objectId })
    .catch(() => null) as { node?: { backendNodeId?: number } } | null;

  const handle: EmbeddedFileInputHandle = { objectId };
  if (nodeResult?.nodeId && nodeResult.nodeId > 0) {
    handle.nodeId = nodeResult.nodeId;
  }
  if (describeResult?.node?.backendNodeId && describeResult.node.backendNodeId > 0) {
    handle.backendNodeId = describeResult.node.backendNodeId;
  }

  return handle.nodeId || handle.backendNodeId || handle.objectId ? handle : null;
}

async function setEmbeddedFilesByHandle(
  wc: WebContents,
  handle: EmbeddedFileInputHandle,
  files: string[],
): Promise<void> {
  const params: {
    files: string[];
    nodeId?: number;
    backendNodeId?: number;
    objectId?: string;
  } = { files };

  if (handle.nodeId) {
    params.nodeId = handle.nodeId;
  } else if (handle.backendNodeId) {
    params.backendNodeId = handle.backendNodeId;
  } else if (handle.objectId) {
    params.objectId = handle.objectId;
  }

  await wc.debugger.sendCommand('DOM.setFileInputFiles', params);
}

async function getEmbeddedUploadDiagnostics(wc: WebContents): Promise<string> {
  const state = await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const text = rootText();
      const inputs = queryAll('input[type="file"]').map((input) => ({
        accept: input.getAttribute('accept') || '',
        multiple: !!input.multiple,
        visible: isVisible(input),
      }));
      const buttons = queryAll('button, [role="button"], label, div, span')
        .filter((el) => isVisible(el) && /上传|发表|发布|保存草稿|选择/.test(textOf(el)))
        .slice(0, 12)
        .map((el) => textOf(el).slice(0, 30));
      return {
        url: location.href,
        readyState: document.readyState,
        rootCount: collectRoots().length,
        hasWujie: !!document.querySelector('wujie-app'),
        inputCount: inputs.length,
        inputs,
        buttons,
        loginVisible: /扫码登录|微信扫码登录|请使用微信扫描|二维码/.test(text),
        textSample: text.slice(0, 200),
      };
    })()
  `, true).catch(() => ({
    url: wc.getURL(),
    readyState: 'unknown',
    rootCount: 0,
    hasWujie: false,
    inputCount: 0,
    inputs: [],
    buttons: [],
    loginVisible: false,
    textSample: '',
  }));

  return JSON.stringify(state);
}

async function setEmbeddedFileInput(wc: WebContents, filePath: string, kind: 'video' | 'image' = 'video'): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new ContentRejectedError(`文件不存在: ${resolvedPath}`, undefined, 'channels');
  }

  const shouldDetach = await attachDebuggerIfNeeded(wc);
  try {
    const start = Date.now();
    let handle: EmbeddedFileInputHandle | null = null;
    while (Date.now() - start < 30000) {
      if (wc.isDestroyed()) {
        throw new SelectorError('账号浏览器页面已关闭', undefined, 'channels');
      }
      handle = await findEmbeddedFileInputHandle(wc, kind).catch(() => null);
      if (handle) break;
      await clickEmbeddedText(wc, [/上传视频/, /选择视频/, /本地上传/, /上传/]).catch(() => false);
      await sleep(1000);
    }

    if (handle) {
      try {
        await setEmbeddedFilesByHandle(wc, handle, [resolvedPath]);
        await notifyEmbeddedFileInputChanged(wc, kind);
        return;
      } catch (error) {
        logger.warn(`视频号通过 DOM 句柄设置文件失败，尝试拦截文件选择器: ${error}`);
      } finally {
        await releaseEmbeddedFileInputHandle(wc, handle);
      }
    }

    const intercepted = await setFileThroughInterceptedChooser(wc, resolvedPath, kind);
    if (intercepted) {
      await notifyEmbeddedFileInputChanged(wc, kind);
      return;
    }

    const diagnostics = await getEmbeddedUploadDiagnostics(wc);
    throw new SelectorError(`未找到视频号文件上传控件: ${diagnostics}`, undefined, 'channels');
  } finally {
    if (shouldDetach && wc.debugger.isAttached()) {
      wc.debugger.detach();
    }
  }
}

async function notifyEmbeddedFileInputChanged(wc: WebContents, kind: 'video' | 'image'): Promise<void> {
  await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const input = pickFileInput(${JSON.stringify(kind)});
      if (!input) return false;
      const view = input.ownerDocument?.defaultView || window;
      input.dispatchEvent(new view.Event('input', { bubbles: true }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));
      return true;
    })()
  `, true).catch(() => false);
}

async function setFileThroughInterceptedChooser(
  wc: WebContents,
  resolvedPath: string,
  kind: 'video' | 'image',
): Promise<boolean> {
  await wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => undefined);

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      wc.debugger.off('message', onMessage);
      wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined);
      resolve(success);
    };

    const trySetByExistingNode = async () => {
      const handle = await findEmbeddedFileInputHandle(wc, kind).catch(() => null);
      if (!handle) return false;
      try {
        await setEmbeddedFilesByHandle(wc, handle, [resolvedPath]);
        return true;
      } catch (error) {
        logger.warn(`视频号通过已存在文件控件设置文件失败: ${error}`);
        return false;
      } finally {
        await releaseEmbeddedFileInputHandle(wc, handle);
      }
    };

    const onMessage = async (_event: unknown, method: string, params: { backendNodeId?: number } = {}) => {
      if (method !== 'Page.fileChooserOpened') return;

      try {
        if (params.backendNodeId) {
          await wc.debugger.sendCommand('DOM.setFileInputFiles', {
            backendNodeId: params.backendNodeId,
            files: [resolvedPath],
          });
          finish(true);
          return;
        }

        finish(await trySetByExistingNode());
      } catch (error) {
        logger.warn(`视频号文件选择器拦截设置文件失败: ${error}`);
        finish(false);
      }
    };

    wc.debugger.on('message', onMessage);

    clickEmbeddedText(wc, kind === 'image'
      ? [/上传图片/, /选择图片/, /封面/, /上传/]
      : [/上传视频/, /选择视频/, /本地上传/, /上传/])
      .then(async (clicked) => {
        if (!clicked) {
          finish(await trySetByExistingNode().catch(() => false));
        }
      })
      .catch(() => finish(false));

    timeout = setTimeout(async () => {
      finish(await trySetByExistingNode().catch(() => false));
    }, 10000);
  });
}

async function clickEmbeddedText(wc: WebContents, patterns: RegExp[]): Promise<boolean> {
  const sources = patterns.map(pattern => ({ source: pattern.source, flags: pattern.flags }));
  return await wc.executeJavaScript(`
    ((patterns) => {
      ${EMBEDDED_DOM_HELPERS}
      const regs = patterns.map((p) => new RegExp(p.source, p.flags));
      const nodes = queryAll('button, [role="button"], label, div, span');
      const target = nodes.find((el) => {
        if (!isVisible(el)) return false;
        return regs.some((reg) => reg.test(textOf(el)));
      });
      if (!target) return false;
      return clickElement(target);
    })(${JSON.stringify(sources)})
  `, true).catch(() => false) as boolean;
}

function normalizeChannelsTags(tags?: string[]): string[] {
  return (tags ?? [])
    .map(tag => String(tag || '').trim().replace(/^#+/, ''))
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index)
    .slice(0, 10);
}

export function buildEmbeddedDescriptionText(ctx: UploadContext): { text: string; tagCount: number } {
  const description = (ctx.description || '').trim();
  const tags = normalizeChannelsTags(ctx.tags);

  return {
    text: description,
    tagCount: tags.length,
  };
}

export function buildEmbeddedShortTitle(ctx: UploadContext): string {
  return formatChannelsShortTitle(ctx.title || '');
}

async function dumpEmbeddedState(wc: WebContents, label: string): Promise<void> {
  if (wc.isDestroyed()) return;
  const diag = await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const roots = collectRoots();
      const rootInfo = roots.map((root, idx) => {
        const loc = root.location?.href || root.defaultView?.location?.href || '';
        const editor = root.querySelector('div.input-editor');
        const checkboxes = root.querySelectorAll('input[type="checkbox"]');
        const posDisplay = root.querySelector('.position-display, [class*="position-display"]');
        const buttons = Array.from(root.querySelectorAll('button, [role="button"]'))
          .filter((el) => isVisible(el))
          .map((el) => textOf(el).slice(0, 20));
        return { idx, loc: loc.slice(0, 80), hasEditor: !!editor, checkboxCount: checkboxes.length, hasPosition: !!posDisplay, buttons: buttons.slice(0, 8) };
      });
      const bodyText = rootText().slice(0, 300);
      return { rootCount: roots.length, rootInfo, bodyTextSample: bodyText };
    })()
  `, true).catch(() => ({ rootCount: 0, rootInfo: [], bodyTextSample: '' })) as {
    rootCount: number;
    rootInfo: { idx: number; loc: string; hasEditor: boolean; checkboxCount: number; hasPosition: boolean; buttons: string[] }[];
    bodyTextSample: string;
  };
  logger.info(`视频号诊断[${label}]: roots=${diag.rootCount} bodyPreview="${diag.bodyTextSample.slice(0, 100)}"`);
  for (const r of diag.rootInfo) {
    logger.info(`  root[${r.idx}]: loc=${r.loc || '(main)'} editor=${r.hasEditor} checkboxes=${r.checkboxCount} position=${r.hasPosition} buttons=[${r.buttons.join(',')}]`);
  }
  await showEmbeddedStatus(wc, label);
}

async function showEmbeddedStatus(wc: WebContents, status: string): Promise<void> {
  if (wc.isDestroyed()) return;
  await wc.executeJavaScript(`
    (() => {
      let bar = document.getElementById('mf-debug-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'mf-debug-bar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#1a73e8;color:#fff;padding:6px 12px;font-size:13px;font-family:monospace;box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:none;';
        document.body.appendChild(bar);
      }
      const now = new Date();
      const ts = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
      bar.textContent = '[' + ts + '] MatrixFlow: ' + ${JSON.stringify(status)};
    })()
  `, true).catch(() => {});
}

async function fillEmbeddedFields(wc: WebContents, ctx: UploadContext): Promise<boolean> {
  const tags = normalizeChannelsTags(ctx.tags);
  const { text: baseText } = buildEmbeddedDescriptionText(ctx);
  const shortTitle = buildEmbeddedShortTitle(ctx);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));

  const descResult = await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const el = queryAll('div.input-editor').find((e) => isVisible(e));
      if (!el) return { ok: false };
      el.scrollIntoView({ block: 'center' });
      el.focus();
      const sel = el.ownerDocument.defaultView.getSelection();
      if (sel) {
        const range = el.ownerDocument.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        el.ownerDocument.execCommand('delete');
        sel.removeAllRanges();
      }
      if (${JSON.stringify(baseText)}) {
        el.innerText = ${JSON.stringify(baseText)};
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(baseText)} }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      el.focus();
      return { ok: true, length: el.innerText.length };
    })()
  `, true).catch((e) => ({ ok: false, error: String(e) })) as { ok: boolean; length?: number; error?: string };

  if (!descResult.ok) {
    logger.warn(`视频号账号浏览器未找到描述编辑器: ${descResult.error || ''}`);
    return false;
  }

  logger.info(`视频号账号浏览器已填写描述: length=${descResult.length || baseText.length}`);

  if (tags.length > 0) {
    logger.info(`视频号开始逐个键入 ${tags.length} 个话题标签`);

    const sendChar = (ch: string) => {
      if (/^[\x20-\x7E]$/.test(ch)) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
        wc.sendInputEvent({ type: 'char', keyCode: ch });
        wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
      } else {
        wc.sendInputEvent({ type: 'char', keyCode: ch });
      }
    };

    for (const tag of tags) {
      const tagText = String(tag || '').trim().replace(/^#+/, '');
      if (!tagText) continue;

      await jitter(200, 400);

      const focused = await wc.executeJavaScript(`
        (() => {
          ${EMBEDDED_DOM_HELPERS}
          const el = queryAll('div.input-editor').find((e) => isVisible(e));
          if (!el) return false;
          el.scrollIntoView({ block: 'center' });
          el.focus();
          const sel = el.ownerDocument.defaultView.getSelection();
          if (sel) {
            const range = el.ownerDocument.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          return true;
        })()
      `, true).catch(() => false) as boolean;

      if (!focused) continue;
      await jitter(100, 150);

      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      await jitter(80, 150);

      const hashTagStr = `#${tagText} `;
      for (const ch of hashTagStr) {
        sendChar(ch);
        await sleep(15 + Math.random() * 25);
      }

      await jitter(500, 800);

      const pickResult = await wc.executeJavaScript(`
        ((tagText) => {
          ${EMBEDDED_DOM_HELPERS}
          const suggestions = queryAll(
            '[role="listbox"] [role="option"], ul[role="listbox"] li, .topic-suggestion, [class*="topic-suggest"] li, [class*="topic"] li, [class*="suggest"] li'
          ).filter((el) => isVisible(el));
          if (suggestions.length > 0) {
            clickElement(suggestions[0]);
            return { picked: true, method: 'suggestion', count: suggestions.length };
          }
          return { picked: false, method: 'typed-only' };
        })(${JSON.stringify(tagText)})
      `, true).catch(() => ({ picked: false, method: 'error' })) as { picked: boolean; method?: string; count?: number };

      if (pickResult.picked) {
        logger.info(`视频号话题 #${tagText} 已选择建议 (${pickResult.count} 条)`);
      } else {
        logger.info(`视频号话题 #${tagText} 已键入 (无建议)`);
      }
      await jitter(200, 300);
    }
  }

  if (!shortTitle) {
    logger.warn('视频号短标题为空，停止后续字段设置');
    return false;
  }

  const shortResult = await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const el = queryAll('input[placeholder*="短标题"], input[placeholder*="标题"][maxlength], input[maxlength="20"], [class*="short-title"] input')
        .find((e) => isVisible(e));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.focus();
      const proto = Object.getPrototypeOf(el);
      const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      if (setter) setter.call(el, ${JSON.stringify(shortTitle)});
      else el.value = ${JSON.stringify(shortTitle)};
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(shortTitle)} }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value === ${JSON.stringify(shortTitle)};
    })()
  `, true).catch(() => false) as boolean;

  if (!shortResult) {
    logger.warn('视频号账号浏览器短标题填写后校验失败');
    return false;
  }

  logger.info(`视频号账号浏览器已填写短标题: ${shortTitle}`);
  return true;
}

export function shouldApplyOriginalStatement(ctx: UploadContext): boolean {
  const declaration = (ctx.declaration || '').trim();
  if (!declaration) return false;
  return ['original', 'self', 'self_shot', '自主拍摄', '原创'].includes(declaration);
}

export async function applyEmbeddedOriginalStatement(wc: WebContents, ctx: UploadContext): Promise<boolean> {
  if (!shouldApplyOriginalStatement(ctx)) {
    logger.info(`视频号账号浏览器跳过原创声明: declaration=${ctx.declaration || ''}`);
    return true;
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));

  const step1 = await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const normalizeText = (value) => String(value || '').replace(/\\s+/g, '');
      const candidates = queryAll(
        'label, [role="checkbox"], [class*="checkbox"], [class*="original"], div, span'
      )
        .filter((el) => {
          if (!isVisible(el) || el.closest?.('div[role="dialog"], [class*="dialog"], [class*="modal"]')) {
            return false;
          }
          const text = normalizeText(textOf(el));
          return text === '声明原创' ||
            text === '视频为原创' ||
            text.startsWith('声明视频为原创');
        })
        .sort((a, b) => normalizeText(textOf(a)).length - normalizeText(textOf(b)).length);
      const label = candidates[0];
      if (!label) return { found: false };

      const scopes = [
        label.closest('label'),
        label.closest('[class*="declare-original"], [class*="original"], [class*="checkbox"]'),
        label.parentElement,
        label.parentElement?.parentElement,
        label,
      ].filter(Boolean);
      const checkbox = scopes
        .map((scope) => scope.matches?.('input[type="checkbox"]')
          ? scope
          : scope.querySelector?.('input[type="checkbox"]'))
        .find(Boolean);
      const customCheckbox = scopes
        .map((scope) => scope.matches?.('[role="checkbox"], [class*="checkbox"]')
          ? scope
          : scope.querySelector?.('[role="checkbox"], [class*="checkbox"]'))
        .find(Boolean);
      const isCustomChecked = (el) => !!el && (
        el.getAttribute?.('aria-checked') === 'true' ||
        el.getAttribute?.('data-state') === 'checked' ||
        /(^|[\\s_-])(is[\\s_-])?checked([\\s_-]|$)/i.test(String(el.className || ''))
      );

      if (checkbox) {
        if (checkbox.checked) {
          return { found: true, clicked: false, alreadyChecked: true, method: 'native-already-checked' };
        }
        window.__matrixFlowOriginalAgreementClicked = false;
        checkbox.scrollIntoView?.({ block: 'center' });
        checkbox.focus?.();
        checkbox.click();
        return {
          found: true,
          clicked: true,
          alreadyChecked: checkbox.checked,
          method: 'native-checkbox',
        };
      }
      if (isCustomChecked(customCheckbox)) {
        return { found: true, clicked: false, alreadyChecked: true, method: 'custom-already-checked' };
      }

      window.__matrixFlowOriginalAgreementClicked = false;
      const clickTarget = customCheckbox || label.closest('label') || label;
      const clicked = clickElement(clickTarget);
      return {
        found: true,
        clicked,
        alreadyChecked: isCustomChecked(customCheckbox),
        method: customCheckbox ? 'custom-checkbox' : 'label-click',
      };
    })()
  `, true).catch((e) => {
    logger.warn(`视频号原创声明Step1异常: ${String(e)}`);
    return { found: false, clicked: false, alreadyChecked: false, method: 'error' };
  }) as {
    found: boolean;
    clicked: boolean;
    alreadyChecked: boolean;
    method?: string;
  };

  if (!step1.found || (!step1.clicked && !step1.alreadyChecked)) {
    logger.warn('视频号账号浏览器未能点击"声明原创"复选框');
    return false;
  }

  if (step1.alreadyChecked && !step1.clicked) {
    const dialogOpen = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const normalizeText = (value) => String(value || '').replace(/\\s+/g, '');
        return queryAll(
          'div.declare-original-dialog, div[role="dialog"], [aria-modal="true"], ' +
          'div[class*="dialog"], div[class*="modal"], div[class*="popup"], div, section, article, form'
        ).some((el) => {
          if (!isVisible(el)) return false;
          const text = normalizeText(textOf(el));
          if (!text.includes('原创声明须知') || !text.includes('使用条款')) return false;
          return Array.from(
            el.querySelectorAll('button, [role="button"], [class*="button"]')
          ).some((button) => isVisible(button) && normalizeText(textOf(button)) === '声明原创');
        });
      })()
    `, true).catch(() => false) as boolean;

    if (!dialogOpen) {
      logger.info(`视频号原创声明已完成，无需重复操作 (method=${step1.method})`);
      return true;
    }
    logger.info(`视频号原创复选框已勾选，继续处理未完成弹窗 (method=${step1.method})`);
  }

  logger.info(`视频号已完成原创步骤1：点击"声明原创" (method=${step1.method})`);
  await jitter(500, 800);

  let step2: {
    found: boolean;
    acted: boolean;
    accepted: boolean;
    method?: string;
    reason?: string;
    debug: Record<string, unknown> | null;
    error?: string;
  } = { found: false, acted: false, accepted: false, debug: null };

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    step2 = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const normalizeText = (value) => String(value || '').replace(/\\s+/g, '');
        const agreementTextMatches = (text) => {
          const normalized = normalizeText(text);
          return normalized.includes('我已阅读并同意') &&
            normalized.includes('原创声明须知') &&
            normalized.includes('使用条款');
        };
        const findDialog = () => {
          const preferred = queryAll(
            'div.declare-original-dialog, div[role="dialog"], [aria-modal="true"], ' +
            'div[class*="dialog"], div[class*="modal"], div[class*="popup"]'
          );
          const fallback = queryAll('div, section, article, form');
          return [...preferred, ...fallback]
            .filter((el) => {
              if (!isVisible(el)) return false;
              const text = normalizeText(textOf(el));
              if (!text.includes('原创声明须知') || !text.includes('使用条款')) return false;
              return Array.from(
                el.querySelectorAll('button, [role="button"], [class*="button"]')
              ).some((button) => isVisible(button) && normalizeText(textOf(button)) === '声明原创');
            })
            .sort((a, b) => normalizeText(textOf(a)).length - normalizeText(textOf(b)).length)[0] || null;
        };
        const isCustomChecked = (el) => !!el && (
          el.getAttribute?.('aria-checked') === 'true' ||
          el.getAttribute?.('data-state') === 'checked' ||
          /(^|[\\s_-])(is[\\s_-])?checked([\\s_-]|$)/i.test(String(el.className || ''))
        );
        const isEnabled = (el) => !!el &&
          !el.disabled &&
          el.getAttribute?.('aria-disabled') !== 'true' &&
          !/(^|[\\s_-])(is[\\s_-])?disabled([\\s_-]|$)/i.test(String(el.className || ''));

        const dialog = findDialog();
        if (!dialog) {
          return { found: false, acted: false, accepted: false, reason: 'dialog-not-found', debug: null };
        }

        const agreementContainers = Array.from(dialog.querySelectorAll('label, div, span, p'))
          .filter((el) => isVisible(el) && agreementTextMatches(textOf(el)))
          .sort((a, b) => normalizeText(textOf(a)).length - normalizeText(textOf(b)).length);
        const agreement = agreementContainers[0];
        const buttons = Array.from(dialog.querySelectorAll('button, [role="button"], [class*="button"]'))
          .filter((el) => isVisible(el));
        const declareButton = buttons.find((el) => normalizeText(textOf(el)) === '声明原创');
        const debugInfo = {
          dialogClass: String(dialog.className || '').slice(0, 120),
          agreementCount: agreementContainers.length,
          checkboxCount: dialog.querySelectorAll('input[type="checkbox"]').length,
          buttons: buttons.map((el) => textOf(el).trim().slice(0, 30)),
        };

        if (!agreement) {
          return {
            found: false,
            acted: false,
            accepted: false,
            reason: 'agreement-text-not-found',
            debug: debugInfo,
          };
        }

        const scopes = [
          agreement.closest('label'),
          agreement.closest('[class*="agreement"], [class*="protocol"], [class*="checkbox"]'),
          agreement,
          agreement.parentElement,
          agreement.parentElement?.parentElement,
        ].filter(Boolean);
        const checkbox = scopes
          .map((scope) => scope.matches?.('input[type="checkbox"]')
            ? scope
            : scope.querySelector?.('input[type="checkbox"]'))
          .find(Boolean);
        const customCheckbox = scopes
          .map((scope) => scope.matches?.('[role="checkbox"], [class*="checkbox"], [class*="check"]')
            ? scope
            : scope.querySelector?.('[role="checkbox"], [class*="checkbox"], [class*="check"]'))
          .find(Boolean);

        const agreementClicked = window.__matrixFlowOriginalAgreementClicked === true;
        if (
          checkbox?.checked ||
          isCustomChecked(customCheckbox) ||
          (agreementClicked && isEnabled(declareButton))
        ) {
          return {
            found: true,
            acted: false,
            accepted: true,
            method: checkbox?.checked
              ? 'native-checked'
              : isCustomChecked(customCheckbox)
                ? 'custom-checked'
                : 'declare-button-enabled',
            debug: debugInfo,
          };
        }

        if (window.__matrixFlowOriginalAgreementClicked) {
          return {
            found: true,
            acted: false,
            accepted: false,
            reason: 'waiting-for-checked-state',
            debug: debugInfo,
          };
        }

        const clickTarget = checkbox ||
          customCheckbox ||
          agreement.closest('label') ||
          agreement;
        let acted = false;
        if (checkbox) {
          checkbox.focus?.();
          checkbox.click();
          acted = true;
        } else {
          acted = clickElement(clickTarget);
        }
        window.__matrixFlowOriginalAgreementClicked = acted;

        return {
          found: true,
          acted,
          accepted: !!checkbox?.checked || isCustomChecked(customCheckbox) || isEnabled(declareButton),
          method: checkbox ? 'native-checkbox' : customCheckbox ? 'custom-checkbox' : 'agreement-container',
          debug: debugInfo,
        };
      })()
    `, true).catch((e) => ({
      found: false,
      acted: false,
      accepted: false,
      debug: null,
      error: String(e),
    })) as typeof step2;

    if (step2.found && step2.accepted) break;
    if (attempt < 20) await sleep(300);
  }

  if (step2.debug) {
    const d = step2.debug as Record<string, unknown>;
    logger.info(
      `视频号原创弹窗诊断: dialogClass=${d.dialogClass} agreementCount=${d.agreementCount} ` +
      `checkboxCount=${d.checkboxCount} buttons=${JSON.stringify(d.buttons)}`
    );
  }

  if (!step2.found || !step2.accepted) {
    logger.warn(
      `视频号原创步骤2失败：未能确认原创声明须知和使用条款 ` +
      `(reason=${step2.reason || 'unknown'} error=${step2.error || 'none'})`
    );
    return false;
  }

  logger.info(`视频号已完成原创步骤2：勾选原创声明须知和使用条款 (method=${step2.method})`);
  await jitter(300, 500);

  let step3: {
    found: boolean;
    clicked: boolean;
    disabled?: boolean;
    text?: string;
    buttons?: string[];
    error?: string;
  } = { found: false, clicked: false };

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    step3 = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const normalizeText = (value) => String(value || '').replace(/\\s+/g, '');
        const candidates = queryAll(
          'div.declare-original-dialog, div[role="dialog"], [aria-modal="true"], ' +
          'div[class*="dialog"], div[class*="modal"], div[class*="popup"], div, section, article, form'
        )
          .filter((el) => {
            if (!isVisible(el)) return false;
            const text = normalizeText(textOf(el));
            if (!text.includes('原创声明须知') || !text.includes('使用条款')) return false;
            return Array.from(
              el.querySelectorAll('button, [role="button"], [class*="button"]')
            ).some((button) => isVisible(button) && normalizeText(textOf(button)) === '声明原创');
          })
          .sort((a, b) => normalizeText(textOf(a)).length - normalizeText(textOf(b)).length);
        const dialog = candidates[0];
        if (!dialog) return { found: false, clicked: false };

        const buttons = Array.from(
          dialog.querySelectorAll('button, [role="button"], [class*="button"]')
        ).filter((btn) => isVisible(btn));
        const button = buttons.find((btn) => normalizeText(textOf(btn)) === '声明原创');
        if (!button) {
          return {
            found: false,
            clicked: false,
            buttons: buttons.map((btn) => textOf(btn).trim().slice(0, 30)),
          };
        }
        const disabled = !!button.disabled ||
          button.getAttribute?.('aria-disabled') === 'true' ||
          /(^|[\\s_-])(is[\\s_-])?disabled([\\s_-]|$)/i.test(String(button.className || ''));
        if (disabled) {
          return {
            found: true,
            clicked: false,
            disabled: true,
            buttons: buttons.map((btn) => textOf(btn).trim().slice(0, 30)),
          };
        }
        return {
          found: true,
          clicked: clickElement(button),
          disabled: false,
          text: textOf(button).trim(),
        };
      })()
    `, true).catch((e) => ({
      found: false,
      clicked: false,
      error: String(e),
    })) as typeof step3;

    if (step3.found && step3.clicked) break;
    if (attempt < 20) await sleep(300);
  }

  if (!step3.found || !step3.clicked) {
    logger.warn(
      `视频号原创步骤3失败：未能点击"声明原创" ` +
      `(disabled=${step3.disabled === true} buttons=${JSON.stringify(step3.buttons)} error=${step3.error || 'none'})`
    );
    return false;
  }

  logger.info('视频号已完成原创步骤3：点击"声明原创"');
  await jitter(300, 500);

  let dialogClosed = false;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    dialogClosed = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const normalizeText = (value) => String(value || '').replace(/\\s+/g, '');
        return !queryAll(
          'div.declare-original-dialog, div[role="dialog"], [aria-modal="true"], ' +
          'div[class*="dialog"], div[class*="modal"], div[class*="popup"], div, section, article, form'
        ).some((el) => {
          if (!isVisible(el)) return false;
          const text = normalizeText(textOf(el));
          return text.includes('原创声明须知') && text.includes('使用条款');
        });
      })()
    `, true).catch(() => false) as boolean;
    if (dialogClosed) break;
    if (attempt < 20) await sleep(300);
  }

  if (!dialogClosed) {
    logger.warn('视频号原创声明提交后弹窗仍未关闭');
    return false;
  }

  logger.info('视频号账号浏览器原创声明三步操作完成');
  return true;
}

export function formatEmbeddedScheduleDateTime(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatChannelsScheduleDateTime(date);
}

export async function applyEmbeddedSchedule(wc: WebContents, scheduledAt?: string | Date | null): Promise<boolean> {
  const formatted = formatEmbeddedScheduleDateTime(scheduledAt);
  if (!formatted) {
    return true;
  }

  const verifyScheduleValues = async () => wc.executeJavaScript(`
    ((payload) => {
      ${EMBEDDED_DOM_HELPERS}
      const normalize = (value) => String(value || '').replace(/[^\\d]/g, '');
      const mainInput = queryAll(
        'input[placeholder="请选择发表时间"], input[placeholder*="发表时间"], input[placeholder*="发布时间"]'
      ).find((input) => isVisible(input));
      const mainValue = mainInput?.value || mainInput?.getAttribute('value') || '';
      const normalized = normalize(mainValue);
      const expectedDate = normalize(payload.dateText);
      const expectedTime = normalize(payload.timeText);
      return {
        verified: normalized.includes(expectedDate) && normalized.includes(expectedTime),
        mainValue,
      };
    })(${JSON.stringify(formatted)})
  `, true).catch((error) => ({
    verified: false,
    mainValue: '',
    error: String(error),
  })) as Promise<{
    verified: boolean;
    mainValue: string;
    error?: string;
  }>;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let opened = await wc.executeJavaScript(`
      ((payload) => {
        ${EMBEDDED_DOM_HELPERS}
        const findMainInput = () => queryAll(
          'input[placeholder="请选择发表时间"], input[placeholder*="发表时间"], input[placeholder*="发布时间"]'
        ).find((input) => isVisible(input));
        let mainInput = findMainInput();
        let toggled = false;
        if (!mainInput) {
          const scheduleLabels = queryAll('label, span, div').filter((el) => {
            if (!isVisible(el)) return false;
            return /^定时$|^定时发表$|^定时发布$/.test(textOf(el));
          });
          toggled = scheduleLabels.length > 0
            ? clickElement(scheduleLabels[scheduleLabels.length - 1])
            : false;
          mainInput = findMainInput();
        }
        if (mainInput) {
          mainInput.scrollIntoView?.({ block: 'center', inline: 'center' });
          mainInput.focus?.();
        }
        const rect = mainInput?.getBoundingClientRect?.();
        let x = rect ? rect.left + rect.width / 2 : 0;
        let y = rect ? rect.top + rect.height / 2 : 0;
        let ownerWindow = mainInput?.ownerDocument?.defaultView;
        while (ownerWindow && ownerWindow !== window) {
          const frameElement = ownerWindow.frameElement;
          if (!frameElement) break;
          const frameRect = frameElement.getBoundingClientRect();
          x += frameRect.left;
          y += frameRect.top;
          ownerWindow = frameElement.ownerDocument?.defaultView;
        }
        return {
          toggled,
          opened: !!mainInput && !!rect,
          x,
          y,
          mainValue: mainInput?.value || '',
          placeholder: mainInput?.getAttribute('placeholder') || '',
        };
      })(${JSON.stringify(formatted)})
    `, true).catch((error) => ({
      toggled: false,
      opened: false,
      x: 0,
      y: 0,
      mainValue: '',
      placeholder: '',
      error: String(error),
    })) as {
      toggled: boolean;
      opened: boolean;
      x: number;
      y: number;
      mainValue: string;
      placeholder: string;
      error?: string;
    };

    if (!opened.opened && opened.toggled) {
      await sleep(500);
      const reopened = await wc.executeJavaScript(`
        (() => {
          ${EMBEDDED_DOM_HELPERS}
          const mainInput = queryAll(
            'input[placeholder="请选择发表时间"], input[placeholder*="发表时间"], input[placeholder*="发布时间"]'
          ).find((input) => isVisible(input));
          if (mainInput) {
            mainInput.scrollIntoView?.({ block: 'center', inline: 'center' });
            mainInput.focus?.();
          }
          const rect = mainInput?.getBoundingClientRect?.();
          let x = rect ? rect.left + rect.width / 2 : 0;
          let y = rect ? rect.top + rect.height / 2 : 0;
          let ownerWindow = mainInput?.ownerDocument?.defaultView;
          while (ownerWindow && ownerWindow !== window) {
            const frameElement = ownerWindow.frameElement;
            if (!frameElement) break;
            const frameRect = frameElement.getBoundingClientRect();
            x += frameRect.left;
            y += frameRect.top;
            ownerWindow = frameElement.ownerDocument?.defaultView;
          }
          return {
            opened: !!mainInput && !!rect,
            x,
            y,
            mainValue: mainInput?.value || '',
            placeholder: mainInput?.getAttribute('placeholder') || '',
          };
        })()
      `, true).catch((error) => ({
        opened: false,
        x: 0,
        y: 0,
        mainValue: '',
        placeholder: '',
        error: String(error),
      })) as {
        opened: boolean;
        x: number;
        y: number;
        mainValue: string;
        placeholder: string;
        error?: string;
      };
      opened = {
        ...opened,
        ...reopened,
        toggled: true,
        error: opened.error || reopened.error,
      };
    }

    if (!opened.opened) {
      logger.warn(`视频号账号浏览器设置定时失败: 未能打开日期选择器 ${opened.error || ''}`);
      return false;
    }
    sendEmbeddedMouseClick(wc, opened.x, opened.y);

    let calendarReady = false;
    let calendarDebug: string[] = [];
    for (let waitAttempt = 1; waitAttempt <= 10; waitAttempt += 1) {
      await sleep(200);
      const frameStates = await executeInEmbeddedFrames<{
        ready: boolean;
        tables: number;
        days: number;
        overlays: string[];
      }>(wc, `
        (() => {
          ${EMBEDDED_DOM_HELPERS}
          const tables = queryAll(
            'table.weui-desktop-picker__table, table[class*="picker"], [role="grid"], [class*="calendar"]'
          ).filter((el) => isVisible(el));
          const days = queryAll(
            'table.weui-desktop-picker__table a, [role="gridcell"], [class*="calendar"] a, [class*="picker"] a'
          ).filter((el) => isVisible(el));
          const overlays = queryAll(
            '[class*="picker"], [class*="popover"], [class*="dropdown"], [role="dialog"]'
          ).filter((el) => isVisible(el)).slice(0, 20).map((el) => (
            String(el.className || '') + ':' + textOf(el).slice(0, 120)
          ));
          return {
            ready: tables.length > 0 || days.length >= 7,
            tables: tables.length,
            days: days.length,
            overlays,
          };
        })()
      `, result => result.ready);
      calendarDebug = frameStates.map(({ url, result }) =>
        `${url || '(main)'} tables=${result.tables} days=${result.days} overlays=${result.overlays.join('|')}`
      );
      if (frameStates.some(({ result }) => result.ready)) {
        calendarReady = true;
        break;
      }
    }
    if (!calendarReady) {
      logger.warn(
        `视频号账号浏览器日期选择器未打开: target=${formatted.dateTimeText} `
        + JSON.stringify(calendarDebug)
      );
      return false;
    }

    let datePicked = false;
    let dateDebug: string[] = [];
    for (let dateAttempt = 1; dateAttempt <= 3; dateAttempt += 1) {
      const pickedFrames = await executeInEmbeddedFrames<{
        targetFound: boolean;
        clickedNext: boolean;
        targetText: string;
        targetClass: string;
        x: number;
        y: number;
        debug: string[];
      }>(wc, `
        ((payload) => {
          ${EMBEDDED_DOM_HELPERS}
          const normalize = (value) => String(value || '')
            .replace(/[年月]/g, '-')
            .replace(/[日号]/g, '')
            .replace(/[/.]/g, '-')
            .replace(/\\s+/g, '');
          const pad = (value) => String(value).padStart(2, '0');
          const dateVariants = [
            payload.dateText,
            payload.dateText.replace(/-/g, '/'),
            payload.dateText.replace(/-0/g, '-'),
            String(payload.year) + '年' + payload.month + '月' + payload.day + '日',
          ].map(normalize);
          const isDisabled = (el) => {
            const cls = [
              String(el.className || ''),
              String(el.closest?.('td')?.className || ''),
              String(el.closest?.('a')?.className || ''),
            ].join(' ');
            return /disabled|disable/.test(cls)
              || el.getAttribute?.('aria-disabled') === 'true';
          };
          const inCalendar = (el) => !!el.closest?.(
            'table, [role="grid"], [class*="picker"], [class*="calendar"], [class*="date"]'
          );
          const candidates = queryAll(
            'table.weui-desktop-picker__table a, [role="gridcell"], [class*="calendar"] a, ' +
            '[class*="picker"] a, [data-date], [data-value]'
          ).filter((el) => isVisible(el) && !isDisabled(el) && inCalendar(el));
          const debug = candidates.slice(0, 80).map((el) => {
            const attrs = [
              el.getAttribute?.('data-date'),
              el.getAttribute?.('data-value'),
              el.getAttribute?.('aria-label'),
              el.getAttribute?.('title'),
            ].filter(Boolean).join('|');
            return textOf(el) + ':' + attrs + ':' + String(el.className || '');
          });
          const exact = candidates.find((el) => {
            const attrs = [
              el.getAttribute?.('data-date'),
              el.getAttribute?.('data-value'),
              el.getAttribute?.('aria-label'),
              el.getAttribute?.('title'),
            ].filter(Boolean).join('|');
            const haystack = normalize(attrs);
            return dateVariants.some((variant) => haystack.includes(variant));
          });
          const dayOnly = candidates.find((el) => {
            if (textOf(el) !== String(payload.day)) return false;
            const calendarText = textOf(el.closest?.(
              '[class*="picker"], [class*="calendar"], table, [role="grid"]'
            ));
            const normalizedCalendar = normalize(calendarText);
            return calendarText.includes(String(payload.month) + '月')
              || calendarText.includes(pad(payload.month) + '月')
              || normalizedCalendar.includes('-' + pad(payload.month) + '-')
              || !/\\d{1,2}月/.test(calendarText);
          });
          const target = exact || dayOnly;
          if (target) {
            target.scrollIntoView?.({ block: 'center', inline: 'center' });
            const rect = target.getBoundingClientRect();
            let x = rect.left + rect.width / 2;
            let y = rect.top + rect.height / 2;
            let ownerWindow = target.ownerDocument?.defaultView;
            while (ownerWindow && ownerWindow !== window) {
              const frameElement = ownerWindow.frameElement;
              if (!frameElement) break;
              const frameRect = frameElement.getBoundingClientRect();
              x += frameRect.left;
              y += frameRect.top;
              ownerWindow = frameElement.ownerDocument?.defaultView;
            }
            return {
              targetFound: true,
              clickedNext: false,
              targetText: textOf(target),
              targetClass: [
                String(target.className || ''),
                String(target.closest?.('td')?.className || ''),
              ].join(' '),
              x,
              y,
              debug,
            };
          }

          const mainInput = queryAll(
            'input[placeholder="请选择发表时间"], input[placeholder*="发表时间"], input[placeholder*="发布时间"]'
          ).find((input) => isVisible(input));
          const currentMatch = String(mainInput?.value || '').match(/(\\d{4})[-/]?(\\d{1,2})/);
          const currentMonthKey = currentMatch
            ? Number(currentMatch[1]) * 12 + Number(currentMatch[2])
            : 0;
          const targetMonthKey = payload.year * 12 + payload.month;
          const nextButtons = queryAll('button, [role="button"]').filter((el) => {
            if (!isVisible(el) || isDisabled(el) || !inCalendar(el)) return false;
            const signature = [
              textOf(el),
              el.getAttribute?.('aria-label'),
              el.getAttribute?.('title'),
              String(el.className || ''),
            ].filter(Boolean).join(' ');
            return /下一|next|right|icon__right|后一个月/i.test(signature);
          });
          const clickedNext = targetMonthKey > currentMonthKey && nextButtons.length > 0
            ? clickElement(nextButtons[nextButtons.length - 1])
            : false;
          return {
            targetFound: false,
            clickedNext,
            targetText: '',
            targetClass: '',
            x: 0,
            y: 0,
            debug,
          };
        })(${JSON.stringify({
          ...formatted,
          year: Number(formatted.dateText.slice(0, 4)),
          month: Number(formatted.dateText.slice(5, 7)),
          day: Number(formatted.dateText.slice(8, 10)),
        })})
      `, result => result.targetFound || result.clickedNext);
      const pickedFrame = pickedFrames.find(({ result }) => result.targetFound)
        || pickedFrames.find(({ result }) => result.clickedNext);
      const picked: {
        targetFound: boolean;
        clickedNext: boolean;
        targetText: string;
        targetClass: string;
        x: number;
        y: number;
        debug: string[];
      } = pickedFrame?.result || {
        targetFound: false,
        clickedNext: false,
        targetText: '',
        targetClass: '',
        x: 0,
        y: 0,
        debug: ['no accessible date picker frame'],
      };

      dateDebug = pickedFrames.flatMap(({ url, result }) =>
        result.debug.map(line => `${url || '(main)'} ${line}`)
      );
      if (dateDebug.length === 0) {
        dateDebug = picked.debug;
      }
      if (picked.targetFound) {
        sendEmbeddedMouseClick(wc, picked.x, picked.y);
        await sleep(400);
        logger.info(
          `视频号账号浏览器已选择目标日期 ${formatted.dateText}: `
          + `frame=${pickedFrame?.url || '(main)'} text=${picked.targetText} `
          + `class=${picked.targetClass} method=physical`
        );
        datePicked = true;
        break;
      }
      if (!picked.clickedNext) break;
      await sleep(400);
    }

    if (!datePicked) {
      logger.warn(
        `视频号账号浏览器未找到目标日期 ${formatted.dateText}: `
        + JSON.stringify(dateDebug.slice(0, 30))
      );
      return false;
    }
    await sleep(300);

    const submittedFrames = await executeInEmbeddedFrames<{
      timeFilled: boolean;
      timeValue: string;
      confirmText: string;
      confirmFound: boolean;
      confirmX: number;
      confirmY: number;
      error?: string;
    }>(wc, `
      ((payload) => {
        ${EMBEDDED_DOM_HELPERS}
        const setNativeValue = (el, value) => {
          if (!el) return false;
          const view = el.ownerDocument?.defaultView || window;
          const previousValue = el.value;
          const proto = Object.getPrototypeOf(el);
          const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
          el.focus();
          if (descriptor && typeof descriptor.set === 'function') {
            descriptor.set.call(el, value);
          } else {
            el.value = value;
          }
          if (el._valueTracker) el._valueTracker.setValue(previousValue);
          el.dispatchEvent(new view.InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: value,
          }));
          el.dispatchEvent(new view.Event('change', { bubbles: true }));
          return true;
        };
        const timeInput = queryAll('input').find((input) => {
          if (!isVisible(input)) return false;
          const placeholder = input.getAttribute('placeholder') || '';
          return /请选择时间|^时间$/.test(placeholder);
        });
        const timeFilled = setNativeValue(timeInput, payload.timeText);
        const pickerRoot = timeInput?.closest?.(
          '[class*="picker"], [class*="popover"], [class*="dropdown"], [role="dialog"]'
        );
        const confirmButtons = queryAll('button, [role="button"], a').filter((el) => {
          if (!isVisible(el)) return false;
          if (!/^确定$|^完成$/.test(textOf(el))) return false;
          return pickerRoot ? pickerRoot.contains(el) : true;
        });
        let confirmButton = confirmButtons[confirmButtons.length - 1];
        if (!confirmButton) {
          const globalConfirmButtons = queryAll('button, [role="button"], a')
            .filter((el) => isVisible(el) && (/^确定$|^完成$/).test(textOf(el)));
          confirmButton = globalConfirmButtons[globalConfirmButtons.length - 1];
        }
        let confirmX = 0;
        let confirmY = 0;
        if (confirmButton) {
          confirmButton.scrollIntoView?.({ block: 'center', inline: 'center' });
          const rect = confirmButton.getBoundingClientRect();
          confirmX = rect.left + rect.width / 2;
          confirmY = rect.top + rect.height / 2;
          let ownerWindow = confirmButton.ownerDocument?.defaultView;
          while (ownerWindow && ownerWindow !== window) {
            const frameElement = ownerWindow.frameElement;
            if (!frameElement) break;
            const frameRect = frameElement.getBoundingClientRect();
            confirmX += frameRect.left;
            confirmY += frameRect.top;
            ownerWindow = frameElement.ownerDocument?.defaultView;
          }
        }
        return {
          timeFilled,
          timeValue: timeInput?.value || '',
          confirmText: textOf(confirmButton),
          confirmFound: !!confirmButton,
          confirmX,
          confirmY,
        };
      })(${JSON.stringify(formatted)})
    `, result => result.timeFilled);
    const submittedFrame = submittedFrames.find(({ result }) => result.timeFilled);
    const submitted = submittedFrame?.result || {
      timeFilled: false,
      timeValue: '',
      confirmText: '',
      confirmFound: false,
      confirmX: 0,
      confirmY: 0,
      error: 'no accessible time picker frame',
    };

    if (!submitted.timeFilled) {
      logger.warn(`视频号账号浏览器未能填写定时时间 ${formatted.timeText}: ${submitted.error || ''}`);
      return false;
    }
    let commitMethod = 'enter-tab';
    if (submitted.confirmFound) {
      sendEmbeddedMouseClick(wc, submitted.confirmX, submitted.confirmY);
      commitMethod = 'confirm-button';
    } else {
      sendEmbeddedKeyPress(wc, 'Enter');
      await sleep(150);
      sendEmbeddedKeyPress(wc, 'Tab');
    }
    await sleep(500);

    const verification = await verifyScheduleValues();
    if (verification.verified) {
      logger.info(
        `视频号账号浏览器已通过日期选择器设置定时发表: ${formatted.dateTimeText} `
        + `previous=${opened.mainValue} actual=${verification.mainValue} `
        + `commit=${commitMethod} frame=${submittedFrame?.url || '(main)'}`
      );
      return true;
    }
    logger.warn(
      `视频号账号浏览器定时发表第${attempt}次校验失败: expected=${formatted.dateTimeText} `
      + `previous=${opened.mainValue} actual=${verification.mainValue} `
      + `timeValue=${submitted.timeValue} commit=${commitMethod}`
    );
    if (attempt < 2) await sleep(700);
  }

  return false;
}

async function waitForEmbeddedUploadComplete(wc: WebContents, maxWaitMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (wc.isDestroyed()) {
      logger.warn('等待视频号上传完成中止：账号浏览器页面已关闭');
      return false;
    }

    const state = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const bodyText = rootText();
        const publishButtons = queryAll('button, [role="button"]')
          .filter((el) => isVisible(el) && /发表|发布|保存草稿/.test(textOf(el)));
        return {
          success: /上传成功|处理完成|上传完成/.test(bodyText),
          failed: /上传失败|处理失败/.test(bodyText),
          uploading: /上传中|处理中|正在上传/.test(bodyText),
          canPublish: publishButtons.length > 0,
        };
      })()
    `, true).catch(() => ({ success: false, failed: false, uploading: false, canPublish: false })) as {
      success: boolean;
      failed: boolean;
      uploading: boolean;
      canPublish: boolean;
    };

    if (state.failed) return false;
    if (state.success || (state.canPublish && !state.uploading && Date.now() - start > 5000)) {
      logger.info('视频号账号浏览器上传完成');
      return true;
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (elapsed > 0 && elapsed % 15 === 0) {
      logger.info(`视频号账号浏览器上传处理中... 已等待 ${elapsed} 秒`);
    }
    await sleep(1000);
  }

  return false;
}

async function clickEmbeddedPublish(wc: WebContents, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      logger.warn('提交视频号发布中止：账号浏览器页面已关闭');
      return false;
    }

    const clicked = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const allBtns = queryAll('button, [role="button"]');
        const visibleBtns = allBtns.filter((b) => isVisible(b));
        const publishBtn = visibleBtns.find((b) => textOf(b).trim() === '发表');
        if (!publishBtn) return false;
        publishBtn.scrollIntoView({ block: 'center' });
        return clickElement(publishBtn);
      })()
    `, true).catch(() => false) as boolean;

    if (clicked) {
      await sleep(1500);
      await clickEmbeddedText(wc, [/^发表$/, /^确定$/, /^确认$/, /确认发表/, /确认发布/]).catch(() => false);
      await sleep(3000);
      const state = await wc.executeJavaScript(`
        (() => {
          ${EMBEDDED_DOM_HELPERS}
          const text = rootText();
          const currentUrl = location.href;
          const publishBtn = queryAll('button, [role="button"]').find((el) => isVisible(el) && /^发表$/.test(textOf(el).trim()));
          return {
            success: /发布成功|发表成功|已发布|已发表/.test(text) || currentUrl.includes('/platform/post/manage'),
            failed: /发布失败|发表失败/.test(text),
            publishBtnGone: !publishBtn,
            url: currentUrl,
          };
        })()
      `, true).catch(() => ({ success: false, failed: false, publishBtnGone: false, url: wc.getURL() })) as {
        success: boolean;
        failed: boolean;
        publishBtnGone: boolean;
        url: string;
      };

      if (state.success) return true;
      if (state.failed) return false;
      // 发表按钮消失且页面未显示失败提示，视为成功（视频号成功发表后可能直接关闭编辑区域）
      if (state.publishBtnGone) {
        logger.info('视频号发表按钮已消失，判定为发表成功');
        return true;
      }
    }

    await sleep(1000);
  }

  return false;
}

export async function applyEmbeddedLocation(wc: WebContents, locationName?: string | null): Promise<boolean> {
  const target = (locationName || '').trim();
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));

  const sendChar = (ch: string) => {
    if (/^[\x20-\x7E]$/.test(ch)) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
      wc.sendInputEvent({ type: 'char', keyCode: ch });
      wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
    } else {
      wc.sendInputEvent({ type: 'char', keyCode: ch });
    }
  };

  if (!target) {
    logger.info('视频号未设置地点，选择"不显示位置"');

    const expandResult = await wc.executeJavaScript(`
      (() => {
        ${EMBEDDED_DOM_HELPERS}
        const editorRoots = collectRoots().filter((root) => {
          try { return !!root.querySelector('div.input-editor'); } catch { return false; }
        });
        for (const root of editorRoots) {
          try {
            let display = Array.from(root.querySelectorAll(
              '.position-display, [class*="position-display"], [class*="position-select"], ' +
              '[class*="location-select"], [class*="location-picker"]'
            )).find((el) => isVisible(el));

            if (!display) {
              const label = Array.from(root.querySelectorAll('div, span, label, button, [role="button"]'))
                .find((el) => {
                  const text = textOf(el).trim();
                  return isVisible(el) && /^(选择位置|添加位置|位置)$/.test(text);
                });
              display = label?.closest(
                '[class*="position"], [class*="location"], [class*="form-item"], [class*="setting-item"], li'
              ) || label;
            }

            if (display && isVisible(display)) {
              const rect = display.getBoundingClientRect();
              const doc = display.ownerDocument;
              const rightTarget = doc.elementFromPoint?.(
                Math.max(rect.left + 1, rect.right - 8),
                rect.top + Math.max(1, rect.height / 2)
              );
              clickElement(rightTarget || display);
              return {
                clicked: true,
                text: textOf(display).trim().slice(0, 40),
                method: rightTarget ? 'right-edge' : 'container',
              };
            }
          } catch {}
        }
        return { clicked: false };
      })()
    `, true).catch(() => ({ clicked: false })) as { clicked: boolean; text?: string; method?: string };

    if (!expandResult.clicked) {
      logger.warn('视频号未找到位置行右侧下拉框');
      return false;
    }

    logger.info(`视频号已点击位置行右侧下拉框: ${expandResult.text} method=${expandResult.method || 'unknown'}`);
    await jitter(500, 800);

    const maxPickAttempts = 12;
    let lastPickResult: {
      picked: boolean;
      text?: string;
      tag?: string;
      debug?: string[];
      rootsContainingTarget?: number;
      error?: string;
    } = { picked: false, debug: [] };

    for (let attempt = 1; attempt <= maxPickAttempts; attempt += 1) {
      lastPickResult = await wc.executeJavaScript(`
        (() => {
          ${EMBEDDED_DOM_HELPERS}
          const normalizeText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
          // 对下拉项放宽可见性：只检查 display:none 和 visibility:hidden，不检查宽高
          // 视频号无界微前端中 dropdown item 可能 bounding rect 为 0 但仍可点击
          const isDropdownVisible = (el) => {
            if (!el || typeof el.getBoundingClientRect !== 'function') return false;
            const view = el.ownerDocument?.defaultView || window;
            const style = view.getComputedStyle(el);
            return style.visibility !== 'hidden' && style.display !== 'none';
          };
          const roots = collectRoots();
          for (const root of roots) {
            try {
              const candidates = Array.from(root.querySelectorAll('*'))
                .filter((el) => isDropdownVisible(el))
                .filter((el) => {
                  const text = normalizeText(textOf(el));
                  if (text !== '不显示位置' && text !== '不显示') return false;
                  return !Array.from(el.children || []).some((child) => {
                    const childText = normalizeText(textOf(child));
                    return isDropdownVisible(child) && (childText === '不显示位置' || childText === '不显示');
                  });
                });

              for (const opt of candidates) {
                const text = normalizeText(textOf(opt));
                const clickable = opt.closest(
                  'li, [role="option"], button, [role="button"], label, ' +
                  '[class*="option"], [class*="select-item"], [class*="menu-item"], ' +
                  '[class*="location-item"], [class*="position-item"]'
                ) || opt;
                if (clickElement(clickable)) {
                  return {
                    picked: true,
                    text,
                    tag: opt.tagName,
                    className: String(opt.className || '').slice(0, 80),
                  };
                }
              }
            } catch {}
          }

          const debugTexts = [];
          let rootsContainingTarget = 0;
          for (const root of roots) {
            try {
              const rootContent = normalizeText(
                root.body?.innerText || root.host?.innerText || root.textContent || ''
              );
              if (rootContent.includes('不显示位置')) rootsContainingTarget += 1;
              const items = Array.from(root.querySelectorAll('*'))
                .filter((el) => isVisible(el))
                .map((el) => normalizeText(textOf(el)))
                .filter((text) => text && text.length <= 40 && /位置|不显示/.test(text));
              debugTexts.push(...items.slice(0, 20));
            } catch {}
          }
          return {
            picked: false,
            debug: Array.from(new Set(debugTexts)).slice(0, 30),
            rootsContainingTarget,
          };
        })()
      `, true).catch((error) => ({
        picked: false,
        debug: [],
        rootsContainingTarget: 0,
        error: String(error),
      })) as typeof lastPickResult;

      if (lastPickResult.picked) {
        logger.info(
          `视频号已选择"${lastPickResult.text}" tag=${lastPickResult.tag || 'unknown'} attempt=${attempt}`
        );
        return true;
      }

      if (attempt < maxPickAttempts) {
        await sleep(500);
      }
    }

    logger.warn(
      `视频号未找到"不显示位置"选项: error=${lastPickResult.error || 'none'} ` +
      `rootsContainingTarget=${lastPickResult.rootsContainingTarget ?? 0} ` +
      `可见文本=${JSON.stringify(lastPickResult.debug || [])}`
    );
    return false;
  }

  const entryResult = await wc.executeJavaScript(`
    ((target) => {
      ${EMBEDDED_DOM_HELPERS}
      const editorRoots = collectRoots().filter((root) => {
        try { return !!root.querySelector('div.input-editor'); } catch { return false; }
      });
      for (const root of editorRoots) {
        try {
          const display = root.querySelector('.position-display, [class*="position-display"]');
          if (display && isVisible(display)) {
            const nameEl = display.querySelector('.location-name');
            if (nameEl && textOf(nameEl).trim() === target) return { found: true, alreadySet: true };
            clickElement(display);
            return { found: true, expanded: true };
          }
        } catch {}
      }
      return { found: false };
    })(${JSON.stringify(target)})
  `, true).catch(() => ({ found: false })) as { found: boolean; alreadySet?: boolean; expanded?: boolean };

  if (!entryResult.found) {
    logger.warn('视频号未找到位置选择入口，跳过位置设置');
    return false;
  }
  if (entryResult.alreadySet) {
    logger.info(`视频号位置已为 "${target}"，无需操作`);
    return true;
  }

  await jitter(500, 800);

  const searchResult = await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const editorRoots = collectRoots().filter((root) => {
        try { return !!root.querySelector('div.input-editor'); } catch { return false; }
      });
      for (const root of editorRoots) {
        try {
          const input = Array.from(root.querySelectorAll('input'))
            .find((el) => {
              const ph = el.getAttribute('placeholder') || '';
              return isVisible(el) && /搜索.*位置|附近位置|地点|位置/.test(ph);
            });
          if (input) {
            input.focus();
            return true;
          }
        } catch {}
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;

  if (searchResult) {
    const keyword = target.length > 12 ? target.slice(0, 12) : target;
    for (const ch of keyword) {
      sendChar(ch);
      await sleep(18 + Math.random() * 12);
    }
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    await jitter(800, 1200);
  }

  const picked = await wc.executeJavaScript(`
    ((target) => {
      ${EMBEDDED_DOM_HELPERS}
      const editorRoots = collectRoots().filter((root) => {
        try { return !!root.querySelector('div.input-editor'); } catch { return false; }
      });
      for (const root of editorRoots) {
        try {
          const options = Array.from(root.querySelectorAll('.option-item, [class*="option-item"]'))
            .filter((el) => isVisible(el));
          for (const opt of options) {
            const nameEl = opt.querySelector('.name, [class*="location-item-info"] .name');
            if (nameEl && textOf(nameEl).trim() === target) {
              clickElement(opt);
              return { picked: true, name: target };
            }
          }
          for (const opt of options) {
            const nameEl = opt.querySelector('.name, [class*="location-item-info"] .name');
            if (nameEl && textOf(nameEl).includes(target.slice(0, 6))) {
              clickElement(opt);
              return { picked: true, name: textOf(nameEl).trim() };
            }
          }
        } catch {}
      }
      return { picked: false };
    })(${JSON.stringify(target)})
  `, true).catch(() => ({ picked: false })) as { picked: boolean; name?: string };

  if (picked.picked) {
    logger.info(`视频号位置已选择: ${picked.name}`);
  } else {
    logger.warn(`视频号位置"${target}"未在下拉列表中找到`);
  }
  return picked.picked;
}

async function uploadVideoInStandaloneBrowser(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, accountId } = ctx;
  logger.info('使用账号浏览器执行视频号发布任务');
  let publishSucceeded = false;
  let failureMessage = '';
  let wc: WebContents | undefined;
  let createdPublishWindow = false;

  try {
    const hadAccountBrowser = browserManager.hasTab(accountId);
    const view = hadAccountBrowser
      ? browserManager.getView(accountId)
      : await browserManager.createTab(accountId, 'channels', CHANNELS_URLS.upload);
    createdPublishWindow = !hadAccountBrowser;

    if (!view) {
      return { success: false, message: '账号浏览器不存在' };
    }

    browserManager.switchTab(accountId);
    wc = view.webContents;

    if (!wc.getURL().includes('/platform/post/create')) {
      await loadEmbeddedUrl(wc, CHANNELS_URLS.upload, 15000);
    }
    logger.info('视频号账号浏览器等待发布页加载完成...');
    await waitForEmbeddedReady(wc, 45000);
    await waitForEmbeddedUploadSurface(wc, 90000);

    logger.info('视频号账号浏览器开始设置视频文件...');
    await setEmbeddedFileInput(wc, videoPath, 'video');
    logger.info(`视频号账号浏览器已选择视频文件: ${videoPath}`);

    await sleep(1000);
    await dumpEmbeddedState(wc, 'fillFields前');
    const fieldsApplied = await fillEmbeddedFields(wc, ctx);
    if (!fieldsApplied) {
      failureMessage = '视频号描述或短标题填写失败';
      return { success: false, message: failureMessage };
    }

    const uploadComplete = await waitForEmbeddedUploadComplete(wc, 180000);
    if (!uploadComplete) {
      failureMessage = '视频上传超时或失败';
      return { success: false, message: failureMessage };
    }

    if (ctx.coverPath && fs.existsSync(ctx.coverPath)) {
      await clickEmbeddedText(wc, [/封面/, /设置封面/]).catch(() => false);
      await sleep(500);
      await setEmbeddedFileInput(wc, ctx.coverPath, 'image').catch((error) => {
        logger.warn('视频号账号浏览器设置封面失败，继续发布:', error);
      });
    }

    await dumpEmbeddedState(wc, '位置选择前');
    const locationApplied = await applyEmbeddedLocation(wc, ctx.location);
    if (!locationApplied) {
      failureMessage = '视频号位置设置失败，未能选择“不显示位置”';
      return { success: false, message: failureMessage };
    }

    const scheduleApplied = await applyEmbeddedSchedule(wc, ctx.scheduledAt);
    if (!scheduleApplied) {
      failureMessage = '视频号定时发表设置失败';
      return { success: false, message: failureMessage };
    }

    await dumpEmbeddedState(wc, '原创声明前');
    const originalOk = await applyEmbeddedOriginalStatement(wc, ctx);
    if (!originalOk) {
      logger.warn('视频号原创声明未完成，中止发布');
      failureMessage = '视频号原创声明未完成';
      return { success: false, message: failureMessage };
    }

    await dumpEmbeddedState(wc, '发表前');
    logger.info(`视频号发表前暂停${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS}秒，等待人工确认...`);
    await sleep(PRE_PUBLISH_CONFIRMATION_DELAY_MS);
    const publishSuccess = await clickEmbeddedPublish(wc, 30000);
    if (publishSuccess) {
      publishSucceeded = true;
      return {
        success: true,
        message: '视频号视频发布成功',
        videoId: extractVideoId(wc.getURL()),
      };
    }

    failureMessage = '视频号视频发布失败';
    return { success: false, message: failureMessage };
  } catch (error) {
    const platformError = toPlatformError(error, 'channels', {
      step: 'uploadVideoInStandaloneBrowser',
      accountId,
      videoPath,
      title,
    });
    failureMessage = platformError.userMessage;
    logger.error('账号浏览器弹窗发布过程出错:', platformError);

    if (platformError.category === 'AuthError' && accountId) {
      accountService.updateStatus(accountId, 'expired').catch((err) => {
        logger.warn(`更新账号状态失败: ${err}`);
      });
      logger.info(`检测到登录过期，已将账号标记为expired: accountId=${accountId}`);
    }

    return { success: false, message: failureMessage };
  } finally {
    if (!publishSucceeded && shouldKeepBrowserOnPublishFailure(failureMessage)) {
      logger.warn(`已保留视频号发布失败浏览器现场: accountId=${accountId} reason=${failureMessage || '未知失败原因'}`);
    } else if (((!publishSucceeded && browserManager.hasStandaloneTab(accountId)) || createdPublishWindow) && browserManager.hasTab(accountId)) {
      await browserManager.closeTab(accountId).catch((closeError) => {
        const reason = publishSucceeded ? '成功' : '失败';
        logger.warn(`关闭视频号发布${reason}弹窗失败: ${closeError}`);
      });
    }
  }
}

async function launchPatchrightContext(
  ctx: UploadContext,
  headless: boolean,
  slowMo: number,
  cookiePath: string,
  browserMode: NormalizedBrowserMode,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  let launcher: IBrowserLauncher | null = null;

  if (browserMode === 'fingerprint') {
    if (!ctx.fingerprintId) {
      throw new SelectorError('账号未绑定指纹浏览器配置', undefined, 'channels');
    }
    const config: BrowserConfig = { type: 'fingerprint', fingerprintId: ctx.fingerprintId, headless };
    launcher = createBrowserLauncher(config);
    const context = await launcher.launch(config, ctx.accountId);
    return { context, close: () => launcher!.close() };
  }

  if (browserMode === 'chrome') {
    const config: BrowserConfig = {
      type: 'chrome',
      executablePath: ctx.chromePath || undefined,
      headless,
    };
    launcher = createBrowserLauncher(config);
    const context = await launcher.launch(config, ctx.accountId);
    return { context, close: () => launcher!.close() };
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    slowMo,
    args: CHROME_ARGS,
  });
  const context = await browser.newContext({ storageState: cookiePath });
  return { context, close: async () => { await context.close(); await browser.close(); } };
}

/**
 * 填写视频号描述与 # 话题。视频号真实 DOM 用 div.input-editor（contenteditable div），
 * 不是 selectors.ts 里的 textarea。
 */
async function fillVideoMetadata(
  page: Page,
  description?: string,
  tags?: string[]
): Promise<boolean> {
  const debugRecorder = getDebugRecorder();
  const rc = (page as unknown as { rc?: { humanClick: (sel: string) => Promise<void> } }).rc;

  try {
    const sanitizedTags = TopicSanitizer.limitTopics(
      TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 10, platform: 'channels' }),
      10,
    );
    if (sanitizedTags.length > 0) {
      logger.info(`视频号将填写 ${sanitizedTags.length} 个 # 话题`);
    }

    const descTarget = page.locator('div.input-editor, [contenteditable="true"]').first();
    const hasDesc = await descTarget.count();
    if (!hasDesc) {
      logger.warn('视频号未找到描述编辑器（div.input-editor）');
      return false;
    }

    await debugRecorder.recordStep('fill_description', async () => {
      if (rc) await rc.humanClick('div.input-editor');
      else await descTarget.click();
      await page.waitForTimeout(300 + Math.random() * 400);

      if (description) {
        await page.keyboard.type(description, { delay: 30 + Math.random() * 60 });
        logger.info(`视频号描述已填写: length=${description.length}`);
        await page.waitForTimeout(200 + Math.random() * 300);
      }

      for (const tag of sanitizedTags) {
        const tagText = String(tag || '').trim().replace(/^#+/, '');
        if (!tagText) continue;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(120 + Math.random() * 200);
        await page.keyboard.type(`#${tagText}`, { delay: 25 + Math.random() * 50 });
        await page.keyboard.press('Space');
        await page.waitForTimeout(300 + Math.random() * 400);

        const suggestion = page.locator('[role="listbox"] [role="option"], ul[role="listbox"] li, .topic-suggestion, [class*="topic-suggest"] li').first();
        if (await suggestion.isVisible().catch(() => false)) {
          if (rc) await rc.humanClick('[role="listbox"] [role="option"]');
          else await suggestion.click();
          logger.info(`视频号 #${tagText} 已选择（建议）`);
        } else {
          logger.info(`视频号 #${tagText} 已键入（无建议）`);
        }
        await page.waitForTimeout(200 + Math.random() * 300);
      }
    }, { page });
    return true;
  } catch (error) {
    throw toPlatformError(error, 'channels', { step: 'fillVideoMetadata', description });
  }
}

/**
 * 应用合集（视频号特有）
 */
async function applyCollection(page: Page, collectionName?: string): Promise<void> {
  if (!collectionName) return;

  try {
    const collectionSelect = page.locator(UPLOAD_SELECTORS.collectionSelect).first();
    if (await collectionSelect.isVisible().catch(() => false)) {
      await collectionSelect.click();
      await page.waitForTimeout(500);

      const option = page.locator(`${UPLOAD_SELECTORS.collectionOption}:has-text("${collectionName}")`).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        logger.info(`已选择合集: ${collectionName}`);
      }
    }
  } catch (error) {
    logger.warn('应用合集失败，继续上传:', error);
    // 非阻塞错误
  }
}

async function clickPublish(page: Page): Promise<boolean> {
  const debugRecorder = getDebugRecorder();

  try {
    return await debugRecorder.recordStep('click_publish', async () => {
      const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
      if (!(await publishBtn.count())) {
        const primaryBtn = page.locator(UPLOAD_SELECTORS.publishButtonPrimary).first();
        if (!(await primaryBtn.count())) {
          throw new SelectorError('未找到发布按钮', undefined, 'channels');
        }
        await primaryBtn.click();
      } else {
        await publishBtn.click();
      }

      logger.info('已点击发表按钮');

      const successToast = page.getByText('发布成功').or(page.getByText('发表成功')).first();
      const failedToast = page.getByText('发布失败').or(page.getByText('发表失败')).first();

      try {
        await Promise.race([
          successToast.waitFor({ timeout: 30000 }),
          failedToast.waitFor({ timeout: 30000 }),
        ]);

        const isSuccessful = await successToast.isVisible().catch(() => false);
        return isSuccessful;
      } catch {
        logger.warn('未检测到发布结果提示');
        return false;
      }
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'channels', { step: 'clickPublish' });
  }
}

export async function uploadVideo(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, coverPath, accountId } = ctx;

  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      message: `视频文件不存在: ${videoPath}`,
    };
  }

  const cookiePath = typeof ctx.cookiePath === 'string' && ctx.cookiePath
    ? ctx.cookiePath.replace(/^local-file:\/\//, '')
    : getCookiePath(accountId);
  if (!cookieExists(cookiePath)) {
    return {
      success: false,
      message: `Cookie 文件不存在，请先登录: ${cookiePath}`,
    };
  }

  const browserMode = normalizeBrowserMode(ctx.browserMode);
  const headless = ctx.headless ?? false;
  const slowMo = ctx.slowMo ?? 200;

  if (browserMode === 'embedded' && !headless) {
    return uploadVideoInStandaloneBrowser(ctx);
  }

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`channels_upload_${accountId}_${Date.now()}`);

  let launched: { context: BrowserContext; close: () => Promise<void> } | null = null;

  try {
    launched = await launchPatchrightContext(ctx, headless, slowMo, cookiePath, browserMode);
  } catch (error) {
    return {
      success: false,
      message: `浏览器启动失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const context = launched.context;
    const page = await context.newPage();
    const pageCtx = { page, accountId };

    logger.info('导航到视频号发布页...');
    await debugRecorder.recordStep('goto_upload_page', async () => {
      await page.goto(CHANNELS_URLS.upload, { timeout: 30000 });
    }, pageCtx);

    // 检查是否被重定向到登录页
    const qrCodeVisible = await page.locator(LOGIN_SELECTORS?.qrCodeImage || '.qrcode img').isVisible().catch(() => false);
    if (qrCodeVisible) {
      throw new AuthError('Cookie 已失效，需要重新登录', { accountId }, 'channels');
    }

    // 选择视频文件
    await debugRecorder.recordStep('select_video_file', async () => {
      const fileInput = page.locator(UPLOAD_SELECTORS.videoFileInput).first();
      await fileInput.waitFor({ state: 'attached', timeout: 10000 });
      await fileInput.setInputFiles(videoPath);
      logger.info(`视频文件已选择: ${videoPath}`);
    }, pageCtx);

    // 等待上传完成
    const uploadSuccess = await debugRecorder.recordStep('wait_upload_complete', async () => {
      return await waitForUploadComplete(page);
    }, pageCtx);

    if (!uploadSuccess) {
      throw new ContentRejectedError('视频上传超时或失败', { videoPath }, 'channels');
    }

    // 设置封面（如果提供了封面图）
    await debugRecorder.recordStep('set_cover', async () => {
      if (coverPath && fs.existsSync(coverPath)) {
        const coverBtn = page.locator(UPLOAD_SELECTORS.coverSelectBtn).first();
        if ((await coverBtn.count()) && (await coverBtn.isVisible().catch(() => false))) {
          await coverBtn.click();
          await page.waitForTimeout(1000);

          const coverInput = page.locator(UPLOAD_SELECTORS.coverUploadInput).first();
          if ((await coverInput.count())) {
            await coverInput.setInputFiles(coverPath);
            logger.info('封面图已上传');

            const confirmBtn = page.locator(UPLOAD_SELECTORS.coverConfirmBtn).first();
            if ((await confirmBtn.count())) {
              await confirmBtn.click();
            }
          }
        }
      }
    }, pageCtx);

    // 视频号页面只填写视频描述，任务标题仅供 MatrixFlow 内部管理。
    const descriptionApplied = await debugRecorder.recordStep('fill_metadata', async () => {
      return await fillVideoMetadata(page, description, tags);
    }, pageCtx);
    if (!descriptionApplied) {
      throw new SelectorError('视频号描述填写失败', undefined, 'channels');
    }

    const shortTitleApplied = await debugRecorder.recordStep('set_short_title', async () => {
      return await setShortTitle(page, title);
    }, pageCtx);
    if (!shortTitleApplied) {
      throw new SelectorError('视频号短标题填写失败', undefined, 'channels');
    }

    const locationApplied = await debugRecorder.recordStep('apply_location', async () => {
      return await applyLocation(page, ctx.location);
    }, pageCtx);
    if (!locationApplied) {
      throw new SelectorError('视频号位置设置失败，未能选择“不显示位置”', undefined, 'channels');
    }

    // 应用合集
    const collection = (ctx as { collection?: string }).collection;
    await debugRecorder.recordStep('apply_collection', async () => {
      await applyCollection(page, collection);
    }, pageCtx);

    if (ctx.scheduledAt) {
      const scheduledTime = ctx.scheduledAt instanceof Date
        ? ctx.scheduledAt
        : new Date(ctx.scheduledAt);
      if (Number.isNaN(scheduledTime.getTime())) {
        throw new SelectorError('视频号定时发表时间无效', undefined, 'channels');
      }
      const scheduleApplied = await debugRecorder.recordStep('apply_schedule', async () => {
        return await applySchedule(page, scheduledTime);
      }, pageCtx);
      if (!scheduleApplied) {
        throw new SelectorError('视频号定时发表设置失败', undefined, 'channels');
      }
    }

    const originalApplied = await debugRecorder.recordStep('apply_original_statement', async () => {
      return await applyOriginalStatement(page, shouldApplyOriginalStatement(ctx));
    }, pageCtx);
    if (!originalApplied) {
      throw new SelectorError('视频号原创声明未完成', undefined, 'channels');
    }

    // 点击发表
    const publishSuccess = await clickPublish(page);

    if (publishSuccess) {
      await page.waitForTimeout(3000);
      const currentUrl = page.url();

      return {
        success: true,
        message: '视频号视频发布成功',
        videoId: extractVideoId(currentUrl),
      };
    } else {
      throw new ContentRejectedError('视频号视频发布失败', { title }, 'channels');
    }
  } catch (error) {
    const platformError = toPlatformError(error, 'channels', {
      step: 'uploadVideo',
      accountId,
      videoPath,
    });
    logger.error('上传过程出错:', platformError);

    if (platformError.category === 'AuthError' && accountId) {
      accountService.updateStatus(accountId, 'expired').catch((err) => {
        logger.warn(`更新账号状态失败: ${err}`);
      });
      logger.info(`检测到登录过期，已将账号标记为expired: accountId=${accountId}`);
    }

    return {
      success: false,
      message: platformError.userMessage,
    };
  } finally {
    await launched.close();
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/platform\/post\/manage.*[?&]id=([^&]+)/)
    || url.match(/finderId=([^&]+)/);
  return match ? match[1] : undefined;
}
