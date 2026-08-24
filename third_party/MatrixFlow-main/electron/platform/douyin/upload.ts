import fs from 'fs';
import path from 'path';
import type { Page, BrowserContext } from 'patchright';
import { chromium } from 'patchright';
import type { WebContents } from 'electron';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS, DOUYIN_URLS } from './selectors';
import { getCookiePath, saveCookie } from './cookie';
import type { UploadContext, UploadResult } from '../base/types';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { PageRiskControl, EmbeddedRiskControl } from '../base/RiskControl';
import { toPlatformError, NetworkError, AuthError, SelectorError, ValidationError, ContentRejectedError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';
import { formatScheduleDateTime, isScheduleDateTimeValueApplied } from '../base/utils/schedule';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';
import { browserManager } from '../../services/embedded-browser/browser-manager';
import { createBrowserLauncher } from '../../services/browser-launcher';
import type { IBrowserLauncher, BrowserConfig } from '../../services/types';

const logger = new Logger('DouyinUpload');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

type NormalizedBrowserMode = 'embedded' | 'chrome' | 'fingerprint';

type TextPattern = string | RegExp;

interface EmbeddedUploadStatus {
  success: boolean;
  message?: string;
}

type EmbeddedPublishState = 'success' | 'failed' | 'timeout';

function normalizeBrowserMode(mode?: UploadContext['browserMode']): NormalizedBrowserMode {
  if (mode === 'external_chrome' || mode === 'chrome') return 'chrome';
  if (mode === 'external_fingerprint' || mode === 'fingerprint') return 'fingerprint';
  return 'embedded';
}

function normalizeLocalFilePath(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.replace(/^local-file:\/\//, '');
}

function shouldDebugSteps(ctx: UploadContext): boolean {
  return ctx.debugSteps === true && process.env.NODE_ENV !== 'production';
}

function shouldKeepBrowserOnPublishFailure(): boolean {
  return process.env.MATRIXFLOW_KEEP_BROWSER_ON_FAIL === '1'
    || process.env.MATRIXFLOW_KEEP_BROWSER_ON_FAIL === 'true';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExpText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToSource(pattern: TextPattern): { source: string; flags: string } {
  return typeof pattern === 'string'
    ? { source: escapeRegExpText(pattern), flags: '' }
    : { source: pattern.source, flags: pattern.flags };
}

async function runEmbeddedDebugStep<T>(
  wc: WebContents,
  ctx: UploadContext,
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  if (!shouldDebugSteps(ctx)) {
    return action();
  }

  logger.info(`[DouyinDebug] 开始: ${label}`);
  await showEmbeddedDebugStep(wc, label, 'running');
  try {
    const result = await action();
    logger.info(`[DouyinDebug] 完成: ${label}`);
    await showEmbeddedDebugStep(wc, label, 'done');
    await sleep(500);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`[DouyinDebug] 失败: ${label} - ${message}`);
    await showEmbeddedDebugStep(wc, label, 'failed', message);
    await sleep(800);
    throw error;
  }
}

async function showEmbeddedDebugStep(
  wc: WebContents,
  label: string,
  status: 'running' | 'done' | 'failed',
  detail = '',
): Promise<void> {
  if (wc.isDestroyed()) return;
  await wc.executeJavaScript(`
    (() => {
      const payload = ${JSON.stringify({ label, status, detail })};
      const color = payload.status === 'failed' ? '#d93025' : payload.status === 'done' ? '#188038' : '#1a73e8';
      let box = document.getElementById('matrixflow-douyin-debug');
      if (!box) {
        box = document.createElement('div');
        box.id = 'matrixflow-douyin-debug';
        box.style.cssText = [
          'position:fixed',
          'right:16px',
          'bottom:16px',
          'z-index:2147483647',
          'max-width:360px',
          'padding:12px 14px',
          'border-radius:8px',
          'box-shadow:0 8px 24px rgba(0,0,0,.18)',
          'font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'color:#202124',
          'background:#fff',
          'border:1px solid rgba(0,0,0,.12)'
        ].join(';');
        document.body.appendChild(box);
      }
      box.textContent = '';
      const title = document.createElement('div');
      title.textContent = 'MatrixFlow 抖音发布调试';
      title.style.cssText = 'font-weight:600;color:' + color;
      const step = document.createElement('div');
      step.textContent = payload.label;
      step.style.marginTop = '4px';
      box.appendChild(title);
      box.appendChild(step);
      if (payload.detail) {
        const detail = document.createElement('div');
        detail.textContent = payload.detail;
        detail.style.cssText = 'margin-top:4px;color:#5f6368;word-break:break-all';
        box.appendChild(detail);
      }
    })()
  `, true).catch(() => undefined);
}

async function runPageDebugStep<T>(
  page: Page,
  ctx: UploadContext,
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  if (!shouldDebugSteps(ctx)) {
    return action();
  }

  logger.info(`[DouyinDebug] 开始: ${label}`);
  await showPageDebugStep(page, label, 'running');
  try {
    const result = await action();
    logger.info(`[DouyinDebug] 完成: ${label}`);
    await showPageDebugStep(page, label, 'done');
    await page.waitForTimeout(500).catch(() => undefined);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`[DouyinDebug] 失败: ${label} - ${message}`);
    await showPageDebugStep(page, label, 'failed', message);
    await page.waitForTimeout(800).catch(() => undefined);
    throw error;
  }
}

async function showPageDebugStep(
  page: Page,
  label: string,
  status: 'running' | 'done' | 'failed',
  detail = '',
): Promise<void> {
  await page.evaluate((payload: { label: string; status: string; detail: string }) => {
    const doc = (globalThis as any).document;
    const color = payload.status === 'failed' ? '#d93025' : payload.status === 'done' ? '#188038' : '#1a73e8';
    let box = doc.getElementById('matrixflow-douyin-debug');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'matrixflow-douyin-debug';
      box.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'max-width:360px',
        'padding:12px 14px',
        'border-radius:8px',
        'box-shadow:0 8px 24px rgba(0,0,0,.18)',
        'font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        'color:#202124',
        'background:#fff',
        'border:1px solid rgba(0,0,0,.12)',
      ].join(';');
      doc.body.appendChild(box);
    }
    box.textContent = '';
    const title = doc.createElement('div');
    title.textContent = 'MatrixFlow 抖音发布调试';
    title.style.cssText = 'font-weight:600;color:' + color;
    const step = doc.createElement('div');
    step.textContent = payload.label;
    step.style.marginTop = '4px';
    box.appendChild(title);
    box.appendChild(step);
    if (payload.detail) {
      const detail = doc.createElement('div');
      detail.textContent = payload.detail;
      detail.style.cssText = 'margin-top:4px;color:#5f6368;word-break:break-all';
      box.appendChild(detail);
    }
  }, { label, status, detail }).catch(() => undefined);
}

async function launchPatchrightContext(
  ctx: UploadContext,
  userDataDir: string,
  browserMode: NormalizedBrowserMode,
  headless: boolean,
  slowMo: number,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  let launcher: IBrowserLauncher | null = null;

  if (browserMode === 'fingerprint') {
    if (!ctx.fingerprintId) {
      throw new ValidationError('账号未绑定指纹浏览器配置', undefined, 'douyin');
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

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    slowMo,
    args: CHROME_ARGS,
  });
  return { context, close: () => context.close() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// EMBEDDED MODE (Primary)
// ============================================================

async function uploadVideoInEmbeddedBrowser(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId } = ctx;
  logger.info('使用内嵌浏览器执行抖音发布任务');
  let publishSucceeded = false;
  let failureMessage = '';
  let debugWebContents: WebContents | undefined;

  try {
    if (browserManager.hasTab(accountId) && !browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId);
    }

    const view = browserManager.hasStandaloneTab(accountId)
      ? browserManager.getView(accountId)
      : await browserManager.createTab(accountId, 'douyin', DOUYIN_URLS.upload);

    if (!view) {
      return { success: false, message: '账号浏览器弹窗不存在' };
    }

    browserManager.switchTab(accountId);

    const wc = view.webContents;
    debugWebContents = wc;
    const recorder = getDebugRecorder();

    await runEmbeddedDebugStep(wc, ctx, '加载抖音发布页', async () => {
      if (!wc.getURL().includes('/content/upload') && !wc.getURL().includes('/content/post')) {
        await wc.loadURL(DOUYIN_URLS.upload);
      }
      await waitForEmbeddedReady(wc, 30000);
      await waitForEmbeddedUploadSurface(wc, 60000);
    });

    await recorder.recordStep('发布页加载完成', async () => {
      return { url: wc.getURL() };
    });

    const isOnUploadPage = wc.getURL().includes('/content/upload') || wc.getURL().includes('/content/post');
    if (!isOnUploadPage) {
      failureMessage = '账号浏览器弹窗未进入抖音发布页，请先完成账号登录';
      return { success: false, message: '账号浏览器弹窗未进入抖音发布页，请先完成账号登录' };
    }

    await runEmbeddedDebugStep(wc, ctx, '选择视频文件', async () => {
      await setEmbeddedFileInput(wc, videoPath);
      logger.info(`账号浏览器弹窗已选择视频文件: ${videoPath}`);
      await sleep(2000);
    });

    await recorder.recordStep('账号浏览器文件选择完成', async () => {
      return { videoPath };
    });

    const uploadComplete = await runEmbeddedDebugStep(wc, ctx, '等待视频上传完成', async () => (
      waitForEmbeddedUploadComplete(wc, 180000)
    ));
    if (!uploadComplete.success) {
      failureMessage = uploadComplete.message || '视频上传失败';
      return { success: false, message: failureMessage };
    }

    await runEmbeddedDebugStep(wc, ctx, '填写标题、作品描述和话题', async () => {
      await closeEmbeddedGuide(wc);
      await fillEmbeddedDescriptionAndTags(wc, title, description, tags);
    });

    await recorder.recordStep('账号浏览器填写描述话题完成', async () => {
      return true;
    });

    // Handle cover selection
    await runEmbeddedDebugStep(wc, ctx, '处理封面设置', async () => {
      await handleEmbeddedCover(wc, ctx.coverPath);
    });

    // Handle declaration (自主声明)
    const declaration = ctx.declaration || 'none';
    if (declaration && declaration !== 'none') {
      await runEmbeddedDebugStep(wc, ctx, '设置自主声明', async () => {
        await setEmbeddedDeclaration(wc, declaration);
      });
    }

    // Handle visibility (谁可以看)
    const visibility = ctx.visibility || 'public';
    if (visibility !== 'public') {
      await runEmbeddedDebugStep(wc, ctx, '设置可见范围', async () => {
        await setEmbeddedVisibility(wc, visibility);
      });
    }

    // Handle save permission (保存权限)
    if (ctx.allowDownload === false) {
      await runEmbeddedDebugStep(wc, ctx, '设置保存权限', async () => {
        await setEmbeddedSavePermission(wc, false);
      });
    }

    // Handle schedule if needed
    const scheduleMode = ctx.scheduleMode || (ctx.scheduledAt ? 'scheduled' : 'immediate');
    if (scheduleMode === 'scheduled') {
      const scheduleTime = formatScheduleDateTime(ctx.scheduledAt);
      if (scheduleTime) {
        await runEmbeddedDebugStep(wc, ctx, '设置定时发布', async () => {
          const mapped = await setEmbeddedScheduleTime(wc, scheduleTime);
          if (!mapped) throw new ValidationError('未映射抖音定时发布时间', undefined, 'douyin');
        });
      }
    }

    await recorder.recordStep('账号浏览器发布选项设置完成', async () => {
      return true;
    });

    const publishState = await runEmbeddedDebugStep(wc, ctx, '提交发布', async () => {
      logger.info(`所有元素设置完成，等待${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS}秒后发布...`);
      await sleep(PRE_PUBLISH_CONFIRMATION_DELAY_MS);
      return clickEmbeddedPublish(wc, 30000);
    });

    if (publishState === 'success') {
      publishSucceeded = true;
      logger.info('账号浏览器弹窗抖音发布成功');
      return { success: true, message: '视频发布成功', videoId: extractVideoId(wc.getURL()) };
    }

    failureMessage = publishState === 'failed' ? '视频发布失败' : '视频发布超时';
    return { success: false, message: failureMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failureMessage = message;
    logger.error(`账号浏览器弹窗发布过程出错: ${message}`);
    return { success: false, message: `账号浏览器弹窗发布过程出错: ${message}` };
  } finally {
    if (!publishSucceeded && debugWebContents && !debugWebContents.isDestroyed()) {
      await logEmbeddedPublishDiagnostics(debugWebContents, failureMessage || '未知失败原因');
    }
    if (!publishSucceeded && shouldKeepBrowserOnPublishFailure()) {
      logger.warn(`已保留抖音发布失败浏览器现场: accountId=${accountId} reason=${failureMessage || '未知失败原因'}`);
    } else if (browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId).catch((closeError) => {
        const reason = publishSucceeded ? '成功' : '失败';
        logger.warn(`关闭抖音发布${reason}弹窗失败: ${closeError}`);
      });
    }
  }
}

async function waitForEmbeddedReady(wc: WebContents, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('内嵌浏览器页面已关闭', undefined, 'douyin');
    }

    const ready = await wc.executeJavaScript('document.readyState !== "loading"').catch(() => false);
    if (!wc.isLoadingMainFrame() && ready) {
      return;
    }

    await sleep(500);
  }

  throw new SelectorError('等待内嵌浏览器页面加载超时', undefined, 'douyin');
}

async function waitForEmbeddedUploadSurface(wc: WebContents, timeoutMs: number): Promise<void> {
  logger.info('等待抖音发布页上传控件渲染...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('账号浏览器弹窗页面已关闭', undefined, 'douyin');
    }

    const state = await wc.executeJavaScript(`
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const bodyText = document.body?.innerText || '';
        const fileInputs = document.querySelectorAll('input[type="file"]');
        const uploadButtons = Array.from(document.querySelectorAll('button, [role="button"], label, div'))
          .filter((el) => isVisible(el) && /上传视频|选择视频|上传/.test((el.innerText || el.textContent || '').trim()));
        return {
          url: location.href,
          fileInputCount: fileInputs.length,
          uploadButtonCount: uploadButtons.length,
          loginVisible: /扫码登录|登录后|请登录/.test(bodyText),
          publishPageVisible: /上传视频|选择视频|发布作品|作品描述|封面设置|标题/.test(bodyText),
        };
      })()
    `, true).catch(() => ({
      url: wc.getURL(),
      fileInputCount: 0,
      uploadButtonCount: 0,
      loginVisible: false,
      publishPageVisible: false,
    })) as {
      url: string;
      fileInputCount: number;
      uploadButtonCount: number;
      loginVisible: boolean;
      publishPageVisible: boolean;
    };

    if (!state.url.includes('/content/upload') && !state.url.includes('/content/post') && Date.now() - start > 3000) {
      await wc.loadURL(DOUYIN_URLS.upload).catch(() => undefined);
      await waitForEmbeddedReady(wc, 30000).catch(() => undefined);
    }

    if (state.loginVisible) {
      throw new AuthError('账号浏览器弹窗显示登录页，请先完成抖音账号登录', undefined, 'douyin');
    }

    if (state.fileInputCount > 0 || state.uploadButtonCount > 0 || state.publishPageVisible) {
      logger.info(`抖音发布页上传区域已就绪: inputs=${state.fileInputCount} buttons=${state.uploadButtonCount}`);
      return;
    }

    await sleep(1000);
  }

  throw new SelectorError(`等待抖音发布页上传控件超时: url=${wc.getURL()}`, undefined, 'douyin');
}

async function setEmbeddedFileInput(wc: WebContents, videoPath: string): Promise<void> {
  const resolvedPath = path.resolve(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new ValidationError(`视频文件不存在: ${resolvedPath}`, undefined, 'douyin');
  }

  const shouldDetach = await attachDebuggerIfNeeded(wc);
  try {
    const start = Date.now();
    let nodeId: number | null = null;

    while (Date.now() - start < 30000) {
      nodeId = await findEmbeddedFileInputNodeId(wc, 'video');
      if (nodeId) break;
      await sleep(1000);
    }

    if (nodeId) {
      await wc.debugger.sendCommand('DOM.setFileInputFiles', {
        nodeId,
        files: [resolvedPath],
      });
      return;
    }

    const intercepted = await setFileThroughInterceptedChooser(wc, resolvedPath);
    if (intercepted) return;

    const diagnostics = await getEmbeddedUploadDiagnostics(wc);
    throw new SelectorError(`未找到抖音视频上传控件: ${diagnostics}`, undefined, 'douyin');
  } finally {
    if (shouldDetach && wc.debugger.isAttached()) {
      wc.debugger.detach();
    }
  }
}

async function attachDebuggerIfNeeded(wc: WebContents): Promise<boolean> {
  if (wc.debugger.isAttached()) {
    return false;
  }
  wc.debugger.attach('1.3');
  return true;
}

async function findEmbeddedFileInputNodeId(wc: WebContents, kind: 'video' | 'image' | 'any' = 'any'): Promise<number | null> {
  const documentResult = await wc.debugger.sendCommand('DOM.getDocument', {
    depth: -1,
    pierce: true,
  }) as { root?: { nodeId?: number } };
  const rootNodeId = documentResult.root?.nodeId;
  if (!rootNodeId) return null;

  const selectors = kind === 'image'
    ? ['input[type="file"][accept*="image"]', 'input[type="file"]']
    : kind === 'video'
      ? [
        "div[class^='container'] input[type='file']",
        'input[type="file"][accept*="video"]',
        'input[type="file"][accept*="mp4"]',
        'input[type="file"][accept*=".mp4"]',
        'input[type="file"]',
      ]
      : ['input[type="file"]'];

  for (const selector of selectors) {
    const result = await wc.debugger.sendCommand('DOM.querySelector', {
      nodeId: rootNodeId,
      selector,
    }) as { nodeId?: number };

    if (result.nodeId && result.nodeId > 0) {
      return result.nodeId;
    }
  }

  return null;
}

async function setFileThroughInterceptedChooser(wc: WebContents, resolvedPath: string): Promise<boolean> {
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
      const nodeId = await findEmbeddedFileInputNodeId(wc, 'video').catch(() => null);
      if (!nodeId) return false;
      await wc.debugger.sendCommand('DOM.setFileInputFiles', {
        nodeId,
        files: [resolvedPath],
      });
      return true;
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
        logger.warn(`抖音文件选择器拦截设置文件失败: ${error}`);
        finish(false);
      }
    };

    wc.debugger.on('message', onMessage);

    clickEmbeddedUploadEntry(wc)
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

async function clickEmbeddedUploadEntry(wc: WebContents): Promise<boolean> {
  return await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const selectorCandidates = [
        "div[class^='container']",
        '[class*="upload"]',
        '[class*="Upload"]',
        'button',
      ];

      for (const selector of selectorCandidates) {
        const els = Array.from(document.querySelectorAll(selector)).filter((el) => isVisible(el));
        const uploadEl = els.find((el) => /上传视频|选择视频|上传/.test(textOf(el)));
        if (uploadEl) {
          const clickable = uploadEl.closest?.('button, [role="button"], label') || uploadEl;
          if (clickable instanceof HTMLElement) {
            clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
            clickable.click();
            return true;
          }
        }
      }

      const candidates = Array.from(document.querySelectorAll('button, [role="button"], label, div, span'))
        .filter((el) => isVisible(el) && /上传视频|选择视频|上传/.test(textOf(el)));
      const target = candidates.find((el) => /上传视频|选择视频/.test(textOf(el))) || candidates[0];
      const clickable = target?.closest?.('button, [role="button"], label') || target;
      if (clickable instanceof HTMLElement) {
        clickable.click();
        return true;
      }
      return false;
    })()
  `, true).catch(() => false);
}

async function getEmbeddedUploadDiagnostics(wc: WebContents): Promise<string> {
  const diagnostic = await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], label, div, span'))
        .filter(isVisible)
        .slice(0, 8)
        .map((el) => (el.innerText || el.textContent || el.className || '').trim().slice(0, 40))
        .filter(Boolean);
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        fileInputCount: document.querySelectorAll('input[type="file"]').length,
        buttons,
      };
    })()
  `, true).catch(() => null) as {
    url?: string;
    title?: string;
    ready?: string;
    fileInputCount?: number;
    buttons?: string[];
  } | null;

  if (!diagnostic) return `url=${wc.getURL()}`;
  return `url=${diagnostic.url || wc.getURL()}, title=${diagnostic.title || ''}, ready=${diagnostic.ready || ''}, fileInputs=${diagnostic.fileInputCount ?? 0}, buttons=${(diagnostic.buttons || []).join('|')}`;
}

async function logEmbeddedPublishDiagnostics(wc: WebContents, reason: string): Promise<void> {
  const diagnostic = await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
      const visibleTexts = Array.from(document.querySelectorAll('button, [role="button"], label, [class*="radio"], [class*="switch"], [class*="zone"]'))
        .filter((el) => el instanceof HTMLElement && isVisible(el))
        .map(textOf)
        .filter(Boolean)
        .slice(0, 40);
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        bodyLength: document.body?.innerText?.length || 0,
        visibleTexts,
      };
    })()
  `, true).catch((error) => ({ error: error instanceof Error ? error.message : String(error), url: wc.getURL() })) as unknown;

  logger.warn(`[DouyinDebug] 发布失败页面诊断: reason=${reason} data=${JSON.stringify(diagnostic)}`);
}

async function closeEmbeddedGuide(wc: WebContents): Promise<void> {
  await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const clickByText = (patterns) => {
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], span, div'))
          .filter((el) => isVisible(el));
        for (const el of candidates) {
          const text = (el.innerText || el.textContent || '').trim();
          if (patterns.some((pattern) => pattern.test(text))) {
            const clickable = el.closest('button, [role="button"]') || el;
            if (clickable instanceof HTMLElement) {
              clickable.click();
              return true;
            }
          }
        }
        return false;
      };

      if (clickByText([/^我知道了$/, /^知道了$/, /^跳过$/])) {
        return true;
      }
      return false;
    })()
  `, true).catch(() => false);
}

async function setEmbeddedTextFieldByLabel(
  wc: WebContents,
  labelPatterns: TextPattern[],
  placeholderPatterns: TextPattern[],
  value: string,
  options: { preferMultiline?: boolean; allowFallback?: boolean } = {},
): Promise<boolean> {
  const payload = {
    labels: labelPatterns.map(patternToSource),
    placeholders: placeholderPatterns.map(patternToSource),
    value,
    preferMultiline: options.preferMultiline === true,
    allowFallback: options.allowFallback === true,
  };

  return await wc.executeJavaScript(`
    (() => {
      const payload = ${JSON.stringify(payload)};
      const labelRegexes = payload.labels.map((p) => new RegExp(p.source, p.flags));
      const placeholderRegexes = payload.placeholders.map((p) => new RegExp(p.source, p.flags));
      const editableSelector = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"]';
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const isMultiline = (el) => el instanceof HTMLTextAreaElement
        || el.getAttribute('contenteditable') === 'true'
        || el.getAttribute('role') === 'textbox';
      const editables = Array.from(document.querySelectorAll(editableSelector))
        .filter((el) => el instanceof HTMLElement && isVisible(el) && !el.matches('[disabled], [readonly], [type="hidden"]'));
      const matchesEditable = (el) => {
        if (payload.preferMultiline && !isMultiline(el)) return false;
        const attrs = [
          el.getAttribute('placeholder') || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('data-placeholder') || '',
          el.getAttribute('name') || '',
          el.getAttribute('class') || '',
        ].join(' ');
        return placeholderRegexes.some((pattern) => pattern.test(attrs));
      };
      const setText = (target) => {
        if (!(target instanceof HTMLElement)) return false;
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.focus();

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (setter) {
            setter.call(target, payload.value);
          } else {
            target.value = payload.value;
          }
          target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('delete');
        target.innerText = payload.value;
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const placeholderTarget = editables.find(matchesEditable);
      if (placeholderTarget) return setText(placeholderTarget);

      const labels = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter((el) => {
          if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && labelRegexes.some((pattern) => pattern.test(text));
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      for (const label of labels) {
        let node = label;
        for (let depth = 0; node && depth < 7; depth += 1) {
          const candidates = Array.from(node.querySelectorAll(editableSelector))
            .filter((el) => el instanceof HTMLElement && isVisible(el) && (!payload.preferMultiline || isMultiline(el)));
          if (candidates.length > 0) {
            return setText(candidates[0]);
          }
          node = node.parentElement;
        }
      }

      if (payload.allowFallback) {
        const fallback = editables.find((el) => !payload.preferMultiline || isMultiline(el));
        if (fallback) return setText(fallback);
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function fillEmbeddedDescriptionAndTags(
  wc: WebContents,
  title: string,
  description?: string,
  tags?: string[],
): Promise<void> {
  logger.info('在内嵌浏览器中填写抖音视频标题、描述和话题...');

  const titleText = (title || '未命名视频').trim();
  const normalizedTags = TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 5, platform: 'douyin' });
  const descriptionText = description?.trim() ?? '';
  const riskControl = new EmbeddedRiskControl(wc);

  // Fill title
  const titleSet = await setEmbeddedTextFieldByLabel(
    wc,
    [/标题/, /^标题$/],
    [/标题/, /填写标题/, /输入标题/],
    titleText,
  );
  if (!titleSet) {
    logger.warn('未找到抖音标题输入框，将标题合并到描述中');
  }

  // Fill description
  const descContent = titleSet
    ? descriptionText
    : [titleText, descriptionText].filter(Boolean).join('\n');

  if (descContent) {
    const descSet = await riskControl.humanizedFillField({
      labelPatterns: [/作品描述/, /^描述$/, /视频描述/, /文案/, /正文/, /说点什么/],
      placeholderPatterns: [/作品描述/, /描述/, /视频描述/, /文案/, /正文/, /说点什么/],
      preferMultiline: true,
      allowFallback: true,
    }, descContent);

    if (!descSet) {
      logger.warn('未找到抖音作品描述框');
    }
  }

  // Add tags
  if (normalizedTags.length > 0) {
    await riskControl.humanizedAppendTags(normalizedTags, {
      newlineBeforeFirst: descContent.length > 0,
      maxTags: 5,
    });
    for (const tag of normalizedTags) {
      logger.info(`抖音话题已回车确认: #${tag}`);
    }
  }
}

async function handleEmbeddedCover(wc: WebContents, coverPath?: string): Promise<void> {
  const normalizedCoverPath = normalizeLocalFilePath(coverPath);

  // Check if cover prompt is visible
  const coverPromptVisible = await wc.executeJavaScript(`
    (() => {
      const text = document.body?.innerText || '';
      return /请设置封面后再发布/.test(text);
    })()
  `, true).catch(() => false);

  if (!coverPromptVisible) {
    return;
  }

  logger.info('检测到封面提示，自动选择推荐封面');

  // Click "选择封面" button
  const coverBtnClicked = await clickEmbeddedText(wc, [/选择封面/]);
  if (!coverBtnClicked) {
    logger.warn('未找到封面选择按钮');
    return;
  }

  await sleep(1000);

  if (normalizedCoverPath && fs.existsSync(normalizedCoverPath)) {
    // Upload custom cover
    await clickEmbeddedText(wc, [/本地上传/, /上传封面/]);
    await sleep(500);

    const shouldDetach = await attachDebuggerIfNeeded(wc);
    try {
      const nodeId = await findEmbeddedFileInputNodeId(wc, 'image');
      if (nodeId) {
        await wc.debugger.sendCommand('DOM.setFileInputFiles', {
          nodeId,
          files: [normalizedCoverPath],
        });
      }
    } finally {
      if (shouldDetach && wc.debugger.isAttached()) {
        wc.debugger.detach();
      }
    }

    await sleep(1000);
  }

  // Confirm cover selection
  await clickEmbeddedText(wc, [/^确定$/, /^完成$/]);
  await sleep(500);
}

const DOUYIN_DECLARATION_MAP: Record<string, string> = {
  ai_generated: '内容由AI生成',
  personal_opinion: '内容为个人观点或见解',
  repost: '内容为转载信息',
  marketing: '内容含营销推广信息',
  fictional: '虚构演绎，仅供娱乐',
};

async function realClickEmbeddedByText(wc: WebContents, targetText: string): Promise<boolean> {
  const escapedText = targetText.replace(/'/g, "\\'");
  const coords = await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('div, span, li, [role="option"], [role="menuitem"], button, a, p, label, [class*="option"], [class*="item"]'))
        .filter((el) => isVisible(el) && (el.innerText || el.textContent || '').trim() === '${escapedText}')
        .sort((a, b) => (a.innerText || '').trim().length - (b.innerText || '').trim().length);
      if (candidates.length === 0) return null;
      const el = candidates[0];
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })()
  `, true).catch(() => null) as { x: number; y: number } | null;

  if (!coords) {
    return false;
  }

  wc.sendInputEvent({ type: 'mouseMove', x: coords.x, y: coords.y } as Electron.MouseInputEvent);
  await sleep(50);
  wc.sendInputEvent({ type: 'mouseDown', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent);
  await sleep(30);
  wc.sendInputEvent({ type: 'mouseUp', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent);

  return true;
}

async function setEmbeddedDeclaration(wc: WebContents, declarationValue: string): Promise<void> {
  const targetText = DOUYIN_DECLARATION_MAP[declarationValue];
  if (!targetText) {
    throw new ValidationError(`未知的抖音自主声明值: ${declarationValue}`, undefined, 'douyin');
  }

  logger.info(`设置抖音自主声明: ${targetText}`);

  const opened = await clickEmbeddedText(wc, [/自主声明/, /内容声明/, /添加声明/]);
  if (!opened) {
    throw new ValidationError('未找到抖音自主声明入口', undefined, 'douyin');
  }
  await sleep(800);

  const clicked = await realClickEmbeddedByText(wc, targetText);
  if (!clicked) {
    throw new ValidationError(`未找到或无法点击抖音自主声明选项: ${targetText}`, undefined, 'douyin');
  }
  await sleep(500);

  const confirmed = await clickEmbeddedText(wc, [/^确定$/]);
  if (!confirmed) {
    logger.warn('抖音自主声明已选择但未找到确定按钮，继续...');
  }
  logger.info(`抖音自主声明已设置: ${targetText}`);
  await sleep(500);
}

async function setEmbeddedVisibility(wc: WebContents, visibility: string): Promise<void> {
  const visibilityMap: Record<string, string> = {
    friends: '好友可看',
    private: '仅自己可见',
  };
  const targetText = visibilityMap[visibility];
  if (!targetText) {
    throw new ValidationError(`未知的抖音可见范围值: ${visibility}`, undefined, 'douyin');
  }

  logger.info(`设置抖音可见范围: ${targetText}`);

  const opened = await clickEmbeddedText(wc, [/谁可以看/, /查看权限/, /可见范围/]);
  if (!opened) {
    throw new ValidationError('未找到抖音可见范围入口', undefined, 'douyin');
  }
  await sleep(800);

  const clicked = await realClickEmbeddedByText(wc, targetText);
  if (!clicked) {
    throw new ValidationError(`未找到或无法点击抖音可见范围选项: ${targetText}`, undefined, 'douyin');
  }
  logger.info(`抖音可见范围已设置: ${targetText}`);
  await sleep(500);
}

async function setEmbeddedSavePermission(wc: WebContents, allowSave: boolean): Promise<void> {
  const targetText = allowSave ? '允许' : '不允许';
  logger.info(`设置抖音保存权限: ${targetText}`);

  const clicked = await realClickEmbeddedByText(wc, targetText);
  if (!clicked) {
    throw new ValidationError(`未找到或无法点击抖音保存权限选项: ${targetText}`, undefined, 'douyin');
  }
  logger.info(`抖音保存权限已设置: ${targetText}`);
  await sleep(500);
}

async function setEmbeddedScheduleTime(wc: WebContents, scheduleTime: string): Promise<boolean> {
  logger.info(`设置内嵌抖音定时发布时间: ${scheduleTime}`);

  const selected = await clickEmbeddedText(wc, [/定时发布/, /^定时$/]);
  const inputAlreadyVisible = await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return Array.from(document.querySelectorAll('input')).some((el) => {
        if (!(el instanceof HTMLInputElement) || !isVisible(el)) return false;
        const attrs = [
          el.getAttribute('placeholder') || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('type') || '',
          el.getAttribute('class') || '',
        ].join(' ');
        return /日期和时间|日期|时间|datetime-local|semi-input/.test(attrs);
      });
    })()
  `, true).catch(() => false);
  if (!selected && !inputAlreadyVisible) {
    logger.warn('未找到抖音定时发布入口');
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await sleep(attempt === 1 ? 800 : 400);
    const result = await wc.executeJavaScript(`
      (() => {
        const value = ${JSON.stringify(scheduleTime)};
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const findInput = () => Array.from(document.querySelectorAll('input'))
          .filter((el) => el instanceof HTMLInputElement && isVisible(el) && !el.disabled && !el.readOnly)
          .find((el) => {
            const attrs = [
              el.getAttribute('placeholder') || '',
              el.getAttribute('aria-label') || '',
              el.getAttribute('type') || '',
              el.getAttribute('class') || '',
            ].join(' ');
            return /日期和时间|日期|时间|datetime-local|semi-input/.test(attrs);
          });
        const dispatchValue = (input, nextValue) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(input, nextValue);
          } else {
            input.value = nextValue;
          }
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const input = findInput();
        if (!(input instanceof HTMLInputElement)) {
          return { found: false, value: '' };
        }
        input.scrollIntoView({ block: 'center', inline: 'nearest' });
        input.click();
        input.focus();
        dispatchValue(input, '');
        dispatchValue(input, value);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

        const confirmBtn = Array.from(document.querySelectorAll('.semi-datepicker-footer button, button, [role="button"]'))
          .find((el) => {
            if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
            const text = (el.innerText || el.textContent || '').trim();
            return /^确定$|^确认$|^完成$/.test(text);
          });
        if (confirmBtn instanceof HTMLElement) confirmBtn.click();
        input.blur();
        return { found: true, value: input.value };
      })()
    `, true).catch(() => ({ found: false, value: '' })) as { found: boolean; value: string };

    if (!result.found) {
      logger.warn(`未找到抖音定时发布时间输入框，attempt=${attempt}`);
      continue;
    }

    await sleep(500);
    const actual = await wc.executeJavaScript(`
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const input = Array.from(document.querySelectorAll('input'))
          .filter((el) => el instanceof HTMLInputElement && isVisible(el))
          .find((el) => {
            const attrs = [
              el.getAttribute('placeholder') || '',
              el.getAttribute('aria-label') || '',
              el.getAttribute('type') || '',
              el.getAttribute('class') || '',
            ].join(' ');
            return /日期和时间|日期|时间|datetime-local|semi-input/.test(attrs);
          });
        return input instanceof HTMLInputElement ? input.value : '';
      })()
    `, true).catch(() => result.value) as string;

    logger.info(`抖音定时发布回读: 期望=${scheduleTime} 实际=${actual || result.value} attempt=${attempt}`);
    if (isScheduleDateTimeValueApplied(actual || result.value, scheduleTime)) {
      return true;
    }
  }

  logger.warn(`抖音定时发布时间未成功写入: ${scheduleTime}`);
  return false;
}

async function clickEmbeddedText(wc: WebContents, patterns: TextPattern[]): Promise<boolean> {
  const serializedPatterns = patterns.map(patternToSource);
  return await wc.executeJavaScript(`
    (() => {
      const patterns = ${JSON.stringify(serializedPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], label, span, div, li, p'))
        .filter((el) => {
          if (!isVisible(el)) return false;
          const text = (el.innerText || el.textContent || '').trim();
          return text.length > 0 && text.length <= 80;
        })
        .sort((a, b) => {
          const at = (a.innerText || a.textContent || '').trim();
          const bt = (b.innerText || b.textContent || '').trim();
          return at.length - bt.length;
        });
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!patterns.some((pattern) => pattern.test(text))) continue;
        const clickable = el.closest('button, [role="button"], label, li') || el;
        if (!(clickable instanceof HTMLElement)) continue;
        if (clickable.hasAttribute('disabled') || clickable.getAttribute('aria-disabled') === 'true') continue;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        return true;
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function waitForEmbeddedUploadComplete(
  wc: WebContents,
  timeoutMs: number,
): Promise<EmbeddedUploadStatus> {
  logger.info('等待内嵌浏览器视频上传完成（URL 跳转检测 + body 文本兜底）...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      return { success: false, message: '页面已关闭' };
    }

    const currentUrl = wc.getURL();
    const url = currentUrl || '';

    // 竞品方案：URL 跳转到发布页 = 上传完成（最可靠信号）
    if (url.includes('/content/publish') || url.includes('/content/post/video')) {
      logger.info('内嵌浏览器视频上传完成（URL 已跳转到发布页）');
      return { success: true };
    }

    // 检测 body 文本作兜底和错误检测
    const state = await wc.executeJavaScript(`
      (() => {
        const bodyText = document.body?.innerText || '';
        return {
          failed: /上传失败|上传出错|文件异常|格式不支持/.test(bodyText),
          needRetry: /重新上传/.test(bodyText),
          hasPublishArea: /发布|发布时间|封面设置|标题|作品描述|添加标签/.test(bodyText),
        };
      })()
    `).catch(() => ({ failed: false, needRetry: false, hasPublishArea: false })) as {
      failed: boolean;
      needRetry: boolean;
      hasPublishArea: boolean;
    };

    if (state.failed) {
      logger.error('检测到上传失败文本');
      return { success: false, message: '视频上传失败' };
    }

    if (state.needRetry && !state.hasPublishArea) {
      logger.warn('检测到"重新上传"提示，视频可能需要重新上传');
      return { success: false, message: '视频上传失败，需要重新上传' };
    }

    // 兜底：如果页面还在 /content/upload 但有发布区域，可能上传区域已隐藏
    if (state.hasPublishArea && url.includes('/content/upload')) {
      logger.info('检测到发布区域文本，但 URL 尚未跳转，继续等待...');
    }

    await sleep(2000);
  }

  return { success: false, message: '视频上传超时' };
}

async function clickEmbeddedPublish(wc: WebContents, timeoutMs: number): Promise<EmbeddedPublishState> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const currentState = await getEmbeddedPublishState(wc);
    if (currentState !== 'timeout') {
      return currentState;
    }

    // Click publish button
    const clicked = await wc.executeJavaScript(`
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter((el) => isVisible(el));
        for (const el of candidates) {
          const text = (el.innerText || el.textContent || '').trim();
          if (text === '发布') {
            const clickable = el.closest('button') || el;
            if (clickable instanceof HTMLElement) {
              clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
              clickable.click();
              return true;
            }
          }
        }
        return false;
      })()
    `, true).catch(() => false);

    if (clicked) {
      logger.info('已在内嵌浏览器点击抖音发布按钮');
      await sleep(2000);
    }

    // Handle any confirm dialogs
    await clickEmbeddedText(wc, [/确认发布|确定发布|确认/]);
    await sleep(1000);

    const stateAfterConfirm = await getEmbeddedPublishState(wc);
    if (stateAfterConfirm !== 'timeout') {
      return stateAfterConfirm;
    }

    await sleep(1000);
  }

  return 'timeout';
}

async function getEmbeddedPublishState(wc: WebContents): Promise<EmbeddedPublishState> {
  if (wc.getURL().includes('/content/manage')) {
    return 'success';
  }

  const state = await wc.executeJavaScript(`
    (() => {
      const bodyText = document.body?.innerText || '';
      if (/发布成功|提交成功/.test(bodyText)) return 'success';
      if (/发布失败|提交失败|发布出错|审核失败/.test(bodyText)) return 'failed';
      return 'timeout';
    })()
  `).catch(() => 'timeout') as EmbeddedPublishState;

  return state;
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/content\/manage\?.*item_ids=([^&]+)/);
  return match ? match[1] : undefined;
}

// ============================================================
// PATCHRIGHT MODE (Fallback)
// ============================================================

function getUserDataDir(accountId: string): string {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const dir = path.join(userDataPath, 'browser_data', 'douyin', accountId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const singletonLock = path.join(dir, 'SingletonLock');
  if (fs.existsSync(singletonLock)) {
    fs.unlinkSync(singletonLock);
  }
  return dir;
}

async function uploadVideoInStandaloneBrowser(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId } = ctx;
  logger.info('使用账号独立弹窗执行抖音发布任务');
  let publishSucceeded = false;
  let debugWebContents: WebContents | undefined;

  try {
    if (browserManager.hasTab(accountId) && !browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId);
    }

    const view = browserManager.hasStandaloneTab(accountId)
      ? browserManager.getView(accountId)
      : await browserManager.createTab(accountId, 'douyin', DOUYIN_URLS.upload);

    if (!view) {
      return { success: false, message: '账号浏览器弹窗不存在' };
    }

    browserManager.switchTab(accountId);

    const wc = view.webContents;
    debugWebContents = wc;
    const recorder = getDebugRecorder();

    await runEmbeddedDebugStep(wc, ctx, '加载抖音发布页', async () => {
      if (!wc.getURL().includes('/content/upload') && !wc.getURL().includes('/content/post')) {
        await wc.loadURL(DOUYIN_URLS.upload);
      }
      await waitForEmbeddedReady(wc, 30000);
      await waitForEmbeddedUploadSurface(wc, 60000);
    });

    await recorder.recordStep('发布页加载完成', async () => {
      return { url: wc.getURL() };
    });

    const isOnUploadPage = wc.getURL().includes('/content/upload') || wc.getURL().includes('/content/post');
    if (!isOnUploadPage) {
      return { success: false, message: '账号浏览器弹窗未进入抖音发布页，请先完成账号登录' };
    }

    await runEmbeddedDebugStep(wc, ctx, '选择视频文件', async () => {
      await setEmbeddedFileInput(wc, videoPath);
      logger.info(`账号浏览器弹窗已选择视频文件: ${videoPath}`);
      await sleep(2000);
    });

    const uploadComplete = await runEmbeddedDebugStep(wc, ctx, '等待视频上传完成', async () => (
      waitForEmbeddedUploadComplete(wc, 180000)
    ));
    if (!uploadComplete.success) {
      return { success: false, message: uploadComplete.message || '视频上传失败' };
    }

    await runEmbeddedDebugStep(wc, ctx, '填写标题、作品描述和话题', async () => {
      await closeEmbeddedGuide(wc);
      await fillEmbeddedDescriptionAndTags(wc, title, description, tags);
    });

    await runEmbeddedDebugStep(wc, ctx, '处理封面设置', async () => {
      await handleEmbeddedCover(wc, ctx.coverPath);
    });

    const declaration = ctx.declaration || 'none';
    if (declaration && declaration !== 'none') {
      await runEmbeddedDebugStep(wc, ctx, '设置自主声明', async () => {
        await setEmbeddedDeclaration(wc, declaration);
      });
    }

    const visibility = ctx.visibility || 'public';
    if (visibility !== 'public') {
      await runEmbeddedDebugStep(wc, ctx, '设置可见范围', async () => {
        await setEmbeddedVisibility(wc, visibility);
      });
    }

    if (ctx.allowDownload === false) {
      await runEmbeddedDebugStep(wc, ctx, '设置保存权限', async () => {
        await setEmbeddedSavePermission(wc, false);
      });
    }

    const scheduleMode = ctx.scheduleMode || (ctx.scheduledAt ? 'scheduled' : 'immediate');
    if (scheduleMode === 'scheduled') {
      const scheduleTime = formatScheduleDateTime(ctx.scheduledAt);
      if (scheduleTime) {
        await runEmbeddedDebugStep(wc, ctx, '设置定时发布', async () => {
          const mapped = await setEmbeddedScheduleTime(wc, scheduleTime);
          if (!mapped) throw new ValidationError('未映射抖音定时发布时间', undefined, 'douyin');
        });
      }
    }

    const publishState = await runEmbeddedDebugStep(wc, ctx, '提交发布', async () => {
      logger.info(`所有元素设置完成，等待${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS}秒后发布...`);
      await sleep(PRE_PUBLISH_CONFIRMATION_DELAY_MS);
      return clickEmbeddedPublish(wc, 30000);
    });

    if (publishState === 'success') {
      publishSucceeded = true;
      logger.info('账号浏览器弹窗抖音发布成功');
      return { success: true, message: '视频发布成功', videoId: extractVideoId(wc.getURL()) };
    }

    return { success: false, message: publishState === 'failed' ? '视频发布失败' : '视频发布超时' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`账号浏览器弹窗发布过程出错: ${message}`);
    return { success: false, message: `账号浏览器弹窗发布过程出错: ${message}` };
  } finally {
    if (!publishSucceeded && debugWebContents && !debugWebContents.isDestroyed()) {
      await logEmbeddedPublishDiagnostics(debugWebContents, '未知失败原因');
    }
    if (!publishSucceeded && shouldKeepBrowserOnPublishFailure()) {
      logger.warn(`已保留抖音发布失败浏览器现场: accountId=${accountId}`);
    } else if (browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId).catch(() => {});
    }
  }
}

// ============================================================
// MAIN EXPORT
// ============================================================

export async function uploadVideo(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId, headless = false, slowMo = 200 } = ctx;

  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      message: `视频文件不存在: ${videoPath}`,
    };
  }

  const browserMode = normalizeBrowserMode(ctx.browserMode);

  if (browserMode === 'embedded' && !headless) {
    return uploadVideoInEmbeddedBrowser(ctx);
  }

  const cookiePath = ctx.cookiePath || getCookiePath(accountId);
  if (!fs.existsSync(cookiePath)) {
    return {
      success: false,
      message: `Cookie 文件不存在: ${cookiePath}`,
    };
  }

  const userDataDir = getUserDataDir(accountId);

  logger.info(`启动抖音自动化浏览器: mode=${browserMode} headless=${headless} slowMo=${slowMo}`);

  const launched = await launchPatchrightContext(ctx, userDataDir, browserMode, headless, slowMo);
  const { context } = launched;
  context.setDefaultNavigationTimeout(120000);
  let page: Page | undefined;
  let uploadSucceeded = false;
  let failureMessage = '';

  try {
    const allPages = context.pages();
    page = allPages.length > 0 ? allPages[0] : await context.newPage();

    logger.info('导航到抖音上传页...');
    await page.goto(DOUYIN_URLS.upload, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const loginCheck = await page.getByText('扫码登录').isVisible().catch(() => false);
    if (loginCheck) {
      throw new AuthError('Cookie 已失效，需要重新登录', undefined, 'douyin');
    }

    // Select video file
    const fileInput = page.locator(UPLOAD_SELECTORS.videoFileInput);
    await fileInput.setInputFiles(videoPath);
    logger.info(`视频文件已选择: ${videoPath}`);

    // Wait for upload complete
    const uploadSuccess = await waitForUploadComplete(page);
    if (!uploadSuccess) {
      return {
        success: false,
        message: '视频上传超时或失败',
      };
    }

    // Fill metadata
    await fillVideoMetadata(page, title, description, tags);

    // Handle cover prompt if visible
    await handleCoverPrompt(page);

    // Click publish
    const publishSuccess = await clickPublish(page);

    if (publishSuccess) {
      await page.waitForTimeout(3000);
      const currentUrl = page.url();
      const videoId = extractVideoId(currentUrl);
      logger.info(`视频发布成功, videoId: ${videoId}`);
      return {
        success: true,
        message: '视频发布成功',
        videoId,
      };
    } else {
      return {
        success: false,
        message: '视频发布失败',
      };
    }
  } catch (error) {
    const pErr = toPlatformError(error, 'douyin');
    logger.error('上传过程出错', { error: pErr });
    return { success: false, message: pErr.userMessage };
  } finally {
    if (!uploadSucceeded && !headless && shouldKeepBrowserOnPublishFailure()) {
      logger.warn(`已保留抖音发布失败浏览器现场: accountId=${accountId}`);
    } else {
      await launched.close().catch(() => {});
    }
  }
}

async function waitForUploadComplete(
  page: Page,
  maxWaitMs: number = 180000
): Promise<boolean> {
  const startTime = Date.now();
  const debugRecorder = getDebugRecorder();

  try {
    return await debugRecorder.recordStep('wait_upload_complete', async () => {
      while (Date.now() - startTime < maxWaitMs) {
        const processingVisible = await page.getByText('视频上传中').isVisible().catch(() => false);
        const successVisible = await page.getByText('上传成功').isVisible().catch(() => false);
        const failedVisible = await page.getByText('上传失败').isVisible().catch(() => false);

        if (successVisible) {
          logger.info('视频上传成功');
          return true;
        }

        if (failedVisible) {
          logger.error('视频上传失败');
          throw new ContentRejectedError('视频上传失败', undefined, 'douyin');
        }

        if (processingVisible) {
          logger.info('视频处理中...');
        }

        await page.waitForTimeout(2000);
      }

      throw new NetworkError('视频上传超时', undefined, 'douyin');
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'douyin');
  }
}

async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<void> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });

  try {
    await debugRecorder.recordStep('fill_video_metadata', async () => {
      const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
      await titleInput.waitFor({ state: 'visible', timeout: 10000 });
      await rc.humanClick(UPLOAD_SELECTORS.titleInput);
      await rc.humanType(UPLOAD_SELECTORS.titleInput, title);
      logger.info(`标题已填写: ${title}`);

      if (description) {
        try {
          const descInput = page.locator(UPLOAD_SELECTORS.descriptionEditor);
          await descInput.waitFor({ state: 'visible', timeout: 5000 });
          await rc.humanClick(UPLOAD_SELECTORS.descriptionEditor);
          await rc.humanType(UPLOAD_SELECTORS.descriptionEditor, description);
          logger.info('描述已填写');
        } catch (error) {
          logger.warn('描述输入框未找到或填写失败');
        }
      }

      if (tags && tags.length > 0) {
        try {
          const sanitizedTags = TopicSanitizer.cleanTopics(tags, {
            maxTopics: 5,
            platform: 'douyin',
          });

          for (const tag of sanitizedTags) {
            const tagInput = page.locator(UPLOAD_SELECTORS.addTagDropdown);
            await tagInput.waitFor({ state: 'visible', timeout: 5000 });
            await rc.humanClick(UPLOAD_SELECTORS.addTagDropdown);
            await rc.humanType(UPLOAD_SELECTORS.addTagDropdown, tag.replace(/^#/, ''));
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');
            logger.info(`标签已添加: ${tag}`);
          }
        } catch (error) {
          logger.warn('标签添加失败', { error });
        }
      }
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'douyin');
  }
}

async function handleCoverPrompt(page: Page): Promise<boolean> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
  });

  try {
    return await debugRecorder.recordStep('handle_cover_prompt', async () => {
      const coverPrompt = page.getByText('请设置封面后再发布', { exact: false });
      const isVisible = await coverPrompt.isVisible().catch(() => false);

      if (!isVisible) {
        return false;
      }

      logger.info('检测到封面提示，自动选择推荐封面');

      const recommendCover = page.locator(UPLOAD_SELECTORS.recommendCover).first();
      if (await recommendCover.isVisible().catch(() => false)) {
        await rc.humanClick(UPLOAD_SELECTORS.recommendCover);
        await page.waitForTimeout(500);

        const confirmBtn = page.getByRole('button', { name: '确定' });
        if (await confirmBtn.isVisible().catch(() => false)) {
          await rc.humanClick('button:has-text("确定")');
          logger.info('封面已设置');
          return true;
        }
      }

      return false;
    }, { page });
  } catch (error) {
    logger.warn('处理封面提示失败', { error });
    return false;
  }
}

async function clickPublish(page: Page, maxRetries: number = 3): Promise<boolean> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });

  try {
    return await debugRecorder.recordStep('click_publish', async () => {
      for (let retry = 0; retry < maxRetries; retry++) {
        const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
        await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
        await rc.humanClick(UPLOAD_SELECTORS.publishButton);
        logger.info(`发布按钮已点击（第 ${retry + 1} 次）`);

        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        if (currentUrl.includes('content/manage')) {
          logger.info('发布成功：已跳转到管理页');
          return true;
        }

        const successText = page.locator('text=/发布成功|提交成功/');
        if (await successText.isVisible().catch(() => false)) {
          logger.info('发布成功：检测到成功文本');
          return true;
        }

        if (await handleCoverPrompt(page)) {
          continue;
        }

        const failedText = page.getByText('发布失败', { exact: false });
        if (await failedText.isVisible().catch(() => false)) {
          logger.warn('发布失败，正在重试...');
          await page.waitForTimeout(1000);
          continue;
        }
      }

      return false;
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'douyin');
  }
}

export function getCoverRatios(): string[] {
  return ['16:9', '4:3', '3:4'];
}
