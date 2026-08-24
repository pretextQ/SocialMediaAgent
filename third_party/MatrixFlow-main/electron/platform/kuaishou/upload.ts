import fs from 'fs';
import path from 'path';
import type { Page, BrowserContext } from 'patchright';
import { chromium } from 'patchright';
import type { WebContents } from 'electron';
import { Logger } from '../../core/Logger';
import { KUAISHOU_URLS } from './selectors';
import { getCookiePath, saveCookie } from './cookie';
import type { UploadContext, UploadResult } from '../base/types';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { EmbeddedRiskControl, PageRiskControl } from '../base/RiskControl';
import { toPlatformError, NetworkError, AuthError, SelectorError, ValidationError, ContentRejectedError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';
import { formatScheduleDateTime, isScheduleDateTimeValueApplied } from '../base/utils/schedule';
import { PRE_PUBLISH_CONFIRMATION_DELAY_MS, PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS } from '../base/publishTiming';
import { browserManager } from '../../services/embedded-browser/browser-manager';
import { createBrowserLauncher } from '../../services/browser-launcher';
import type { IBrowserLauncher, BrowserConfig } from '../../services/types';

const logger = new Logger('KuaishouUpload');
const KUAISHOU_MANAGE_URL_PATTERN = /cp\.kuaishou\.com\/article\/manage\/video/;

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

type NormalizedBrowserMode = 'embedded' | 'chrome' | 'fingerprint';

interface EmbeddedUploadStatus {
  success: boolean;
  message?: string;
}

type EmbeddedPublishState = 'success' | 'failed' | 'timeout';

type TextPattern = string | RegExp;

interface ScheduleDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
  second: string;
  dateIso: string;
}

function getUserDataDir(accountId: string): string {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const dir = path.join(userDataPath, 'browser_data', 'kuaishou', accountId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const singletonLock = path.join(dir, 'SingletonLock');
  if (fs.existsSync(singletonLock)) {
    fs.unlinkSync(singletonLock);
  }
  return dir;
}

function normalizeBrowserMode(mode?: UploadContext['browserMode']): NormalizedBrowserMode {
  if (mode === 'external_chrome' || mode === 'chrome') return 'chrome';
  if (mode === 'external_fingerprint' || mode === 'fingerprint') return 'fingerprint';
  return 'embedded';
}

function normalizeLocalFilePath(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.replace(/^local-file:\/\//, '');
}

function declarationPatterns(value?: string): TextPattern[] {
  switch (value) {
    case undefined:
    case '':
    case 'none':
    case 'no_declaration':
    case 'none_declaration':
      return [/无需声明/, /不声明/, /无声明/];
    case 'ai_generated':
    case 'ai_content':
      return [/内容为\s*AI\s*生成/i, /AI生成/i, /AI合成/i, /AIGC/i, /AI辅助创作/i, /人工智能/i];
    case 'fictional':
      return [/演绎情节/, /虚构演绎/, /虚构/, /仅供娱乐/];
    case 'personal_opinion':
      return [/个人观点/, /仅供参考/];
    case 'original':
      return [/自主拍摄/, /原创/, /自行拍摄/];
    case 'repost':
      return [/素材来源于网络/, /来源转载/, /转载/, /网络/, /非原创/];
    default:
      return [new RegExp(escapeRegExpText(value), 'i')];
  }
}

function declarationOptionIndex(value?: string): number | undefined {
  switch (value) {
    case 'ai_generated':
    case 'ai_content':
      return 0;
    case 'fictional':
      return 1;
    case 'personal_opinion':
      return 2;
    case 'repost':
      return 3;
    default:
      return undefined;
  }
}

function visibilityPatterns(value?: string): TextPattern[] {
  switch (value) {
    case 'private':
      return [/仅自己可见/, /私密/, /仅自己/];
    case 'friends':
    case 'followers':
      return [/好友可见/, /朋友可见/, /互关/];
    default:
      return [/所有人可见/, /公开/, /公开可见/];
  }
}

function optionSummary(ctx: UploadContext): string {
  return [
    `declaration=${ctx.declaration ?? ''}`,
    `visibility=${ctx.visibility ?? ''}`,
    `scheduledAt=${ctx.scheduledAt ?? ''}`,
    `location=${ctx.location ?? ''}`,
    `allowSameFrame=${ctx.allowSameFrame ?? ''}`,
    `allowDownload=${ctx.allowDownload ?? ''}`,
    `showInCity=${ctx.showInCity ?? ''}`,
    `debugSteps=${ctx.debugSteps === true ? 'true' : 'false'}`,
  ].join(' ');
}

function parseScheduleDateTimeParts(value: string): ScheduleDateTimeParts | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = '00'] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour,
    minute,
    second,
    dateIso: `${year}-${month}-${day}`,
  };
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

async function runEmbeddedDebugStep<T>(
  wc: WebContents,
  ctx: UploadContext,
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  if (!shouldDebugSteps(ctx)) {
    return action();
  }

  logger.info(`[KuaishouDebug] 开始: ${label}`);
  await showEmbeddedDebugStep(wc, label, 'running');
  try {
    const result = await action();
    logger.info(`[KuaishouDebug] 完成: ${label}`);
    await showEmbeddedDebugStep(wc, label, 'done');
    await sleep(500);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`[KuaishouDebug] 失败: ${label} - ${message}`);
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
      let box = document.getElementById('matrixflow-kuaishou-debug');
      if (!box) {
        box = document.createElement('div');
        box.id = 'matrixflow-kuaishou-debug';
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
      title.textContent = 'MatrixFlow 发布调试';
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

  logger.info(`[KuaishouDebug] 开始: ${label}`);
  await showPageDebugStep(page, label, 'running');
  try {
    const result = await action();
    logger.info(`[KuaishouDebug] 完成: ${label}`);
    await showPageDebugStep(page, label, 'done');
    await page.waitForTimeout(500).catch(() => undefined);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`[KuaishouDebug] 失败: ${label} - ${message}`);
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
    let box = doc.getElementById('matrixflow-kuaishou-debug');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'matrixflow-kuaishou-debug';
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
    title.textContent = 'MatrixFlow 发布调试';
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

function escapeRegExpText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToSource(pattern: TextPattern): { source: string; flags: string } {
  return typeof pattern === 'string'
    ? { source: escapeRegExpText(pattern), flags: '' }
    : { source: pattern.source, flags: pattern.flags };
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
      throw new ValidationError('账号未绑定指纹浏览器配置', undefined, 'kuaishou');
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

async function uploadVideoInStandaloneBrowser(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId } = ctx;
  logger.info('使用账号独立弹窗执行快手发布任务');
  let publishSucceeded = false;
  let failureMessage = '';
  let debugWebContents: WebContents | undefined;

  try {
    if (browserManager.hasTab(accountId) && !browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId);
    }

    const view = browserManager.hasStandaloneTab(accountId)
      ? browserManager.getView(accountId)
      : await browserManager.createTab(accountId, 'kuaishou', KUAISHOU_URLS.upload);

    if (!view) {
      return { success: false, message: '账号浏览器弹窗不存在' };
    }

    browserManager.switchTab(accountId);

    const wc = view.webContents;
    debugWebContents = wc;
    const recorder = getDebugRecorder();

    await runEmbeddedDebugStep(wc, ctx, '加载快手发布页', async () => {
      if (!wc.getURL().includes('/article/publish/video')) {
        await wc.loadURL(KUAISHOU_URLS.upload);
      }
      await waitForEmbeddedReady(wc, 30000);
      await waitForEmbeddedUploadSurface(wc, 60000);
    });

    await recorder.recordStep('发布页加载完成', async () => {
      return { url: wc.getURL() };
    });

    const isOnUploadPage = wc.getURL().includes('/article/publish/video');
    if (!isOnUploadPage) {
      failureMessage = '账号浏览器弹窗未进入快手发布页，请先完成账号登录';
      return { success: false, message: '账号浏览器弹窗未进入快手发布页，请先完成账号登录' };
    }

    await runEmbeddedDebugStep(wc, ctx, '选择视频文件', async () => {
      await setEmbeddedFileInput(wc, videoPath);
      logger.info(`账号浏览器弹窗已选择视频文件: ${videoPath}`);
      await sleep(2000);
    });

    await recorder.recordStep('账号浏览器文件选择完成', async () => {
      return { videoPath };
    });

    await runEmbeddedDebugStep(wc, ctx, '填写标题、作品描述和话题', async () => {
      await closeEmbeddedGuide(wc);
      await fillEmbeddedDescriptionAndTags(wc, title, description, tags);
    });

    await recorder.recordStep('账号浏览器填写描述话题完成', async () => {
      return true;
    });

    const uploadComplete = await runEmbeddedDebugStep(wc, ctx, '等待视频上传完成', async () => (
      waitForEmbeddedUploadComplete(wc, 180000)
    ));
    if (!uploadComplete.success) {
      failureMessage = uploadComplete.message || '视频上传失败';
      return { success: false, message: failureMessage };
    }

    await runEmbeddedDebugStep(wc, ctx, '设置封面', async () => {
      await setEmbeddedCover(wc, ctx.coverPath);
    });

    await recorder.recordStep('账号浏览器封面设置完成', async () => {
      return true;
    });

    await runEmbeddedDebugStep(wc, ctx, '映射快手发布选项', async () => {
      await applyEmbeddedPublishOptions(wc, ctx);
    });

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
      logger.info('账号浏览器弹窗快手发布成功');
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
      logger.warn(`已保留快手发布失败浏览器现场: accountId=${accountId} reason=${failureMessage || '未知失败原因'}`);
    } else if (browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId).catch((closeError) => {
        const reason = publishSucceeded ? '成功' : '失败';
        logger.warn(`关闭快手发布${reason}弹窗失败: ${closeError}`);
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEmbeddedReady(wc: WebContents, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('内嵌浏览器页面已关闭', undefined, 'kuaishou');
    }

    const ready = await wc.executeJavaScript('document.readyState !== "loading"').catch(() => false);
    if (!wc.isLoadingMainFrame() && ready) {
      return;
    }

    await sleep(500);
  }

  throw new SelectorError('等待内嵌浏览器页面加载超时', undefined, 'kuaishou');
}

async function waitForEmbeddedUploadSurface(wc: WebContents, timeoutMs: number): Promise<void> {
  logger.info('等待快手发布页上传控件渲染...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('账号浏览器弹窗页面已关闭', undefined, 'kuaishou');
    }

    const state = await wc.executeJavaScript(`
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const bodyText = document.body?.innerText || '';
        const fileInputs = document.querySelectorAll('input[type="file"], div.progress-div [class^="upload-btn-input"]');
        const uploadButtons = Array.from(document.querySelectorAll('button[class^="_upload-btn"], button[class*="_upload-btn"], [class^="_upload-btn"], [class*="_upload-btn"], button, [role="button"], label'))
          .filter((el) => isVisible(el) && /上传视频|选择视频|上传/.test((el.innerText || el.textContent || '').trim()));
        return {
          url: location.href,
          fileInputCount: fileInputs.length,
          uploadButtonCount: uploadButtons.length,
          loginVisible: /扫码登录|登录后|请登录/.test(bodyText),
          publishPageVisible: /上传视频|选择视频|发布作品|作品描述|封面设置/.test(bodyText),
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

    if (!state.url.includes('/article/publish/video') && Date.now() - start > 3000) {
      await wc.loadURL(KUAISHOU_URLS.upload).catch(() => undefined);
      await waitForEmbeddedReady(wc, 30000).catch(() => undefined);
    }

    if (state.loginVisible) {
      throw new AuthError('账号浏览器弹窗显示登录页，请先完成快手账号登录', undefined, 'kuaishou');
    }

    if (state.fileInputCount > 0 || state.uploadButtonCount > 0 || state.publishPageVisible) {
      logger.info(`快手发布页上传区域已就绪: inputs=${state.fileInputCount} buttons=${state.uploadButtonCount}`);
      return;
    }

    await sleep(1000);
  }

  throw new SelectorError(`等待快手发布页上传控件超时: url=${wc.getURL()}`, undefined, 'kuaishou');
}

async function setEmbeddedFileInput(wc: WebContents, videoPath: string): Promise<void> {
  const resolvedPath = path.resolve(videoPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new ValidationError(`视频文件不存在: ${resolvedPath}`, undefined, 'kuaishou');
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
    throw new SelectorError(`未找到快手视频上传控件: ${diagnostics}`, undefined, 'kuaishou');
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
    ? [
      'div[role="document"] input[type="file"][accept*="image"]',
      'input[type="file"][accept*="image"]',
      'div[role="document"] input[type="file"]',
      'input[type="file"]',
    ]
    : kind === 'video'
      ? [
        'div.progress-div [class^="upload-btn-input"]',
        'input[class^="upload-btn-input"]',
        'input[class*="upload-btn-input"]',
        'div.progress-div input[type="file"]',
        'input[type="file"][accept*="video"]',
        'input[type="file"][accept*="mp4"]',
        'input[type="file"][accept*=".mp4"]',
        'input[type="file"][accept*="quicktime"]',
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
        logger.warn(`快手文件选择器拦截设置文件失败: ${error}`);
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
        'button[class^="_upload-btn"]',
        'button[class*="_upload-btn"]',
        '[class^="_upload-btn"]',
        '[class*="_upload-btn"]',
        '.upload-btn',
        '[class*="upload-btn"]',
        'div.progress-div [class^="upload-btn-input"]',
      ];

      for (const selector of selectorCandidates) {
        const el = Array.from(document.querySelectorAll(selector)).find((node) => isVisible(node));
        const clickable = el?.closest?.('button, [role="button"], label') || el;
        if (clickable instanceof HTMLElement) {
          clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
          clickable.click();
          return true;
        }
      }

      const candidates = Array.from(document.querySelectorAll('button, [role="button"], label, div, span'))
        .filter((el) => isVisible(el) && /上传视频|选择视频|上传/.test(textOf(el)));
      const target = candidates.find((el) => /上传视频|选择视频/.test(textOf(el))) || candidates[0];
      const clickable = target?.closest('button, [role="button"], label') || target;
      if (clickable instanceof HTMLElement) {
        clickable.click();
        return true;
      }
      const input = document.querySelector('input[type="file"]');
      if (input instanceof HTMLElement) {
        input.click();
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
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], label, [class*="upload"], [class*="Upload"]'))
        .filter(isVisible)
        .slice(0, 8)
        .map((el) => (el.innerText || el.textContent || el.className || '').trim().slice(0, 40))
        .filter(Boolean);
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        fileInputCount: document.querySelectorAll('input[type="file"]').length,
        uploadClassCount: document.querySelectorAll('[class*="upload"], [class*="Upload"]').length,
        buttons,
      };
    })()
  `, true).catch(() => null) as {
    url?: string;
    title?: string;
    ready?: string;
    fileInputCount?: number;
    uploadClassCount?: number;
    buttons?: string[];
  } | null;

  if (!diagnostic) return `url=${wc.getURL()}`;
  return `url=${diagnostic.url || wc.getURL()}, title=${diagnostic.title || ''}, ready=${diagnostic.ready || ''}, fileInputs=${diagnostic.fileInputCount ?? 0}, uploadNodes=${diagnostic.uploadClassCount ?? 0}, buttons=${(diagnostic.buttons || []).join('|')}`;
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
      const visibleTexts = Array.from(document.querySelectorAll('button, [role="button"], label, .ant-select, .ant-radio-wrapper, .ant-checkbox-wrapper, [role="switch"], [class*="edit-form-item"]'))
        .filter((el) => el instanceof HTMLElement && isVisible(el))
        .map(textOf)
        .filter(Boolean)
        .slice(0, 40);
      const sectionLabels = ['作者声明', '查看权限', '发布时间', '互动设置', '作品描述', '封面设置', '添加地点'];
      const sections = {};
      for (const label of sectionLabels) {
        const node = Array.from(document.querySelectorAll('label, span, div, p'))
          .find((el) => el instanceof HTMLElement && isVisible(el) && textOf(el).includes(label));
        const container = node?.closest?.('[class*="edit-form-item"], [class*="form-item"], .ant-form-item') || node?.parentElement;
        sections[label] = container ? textOf(container).slice(0, 500) : '';
      }
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        bodyLength: document.body?.innerText?.length || 0,
        visibleTexts,
        sections,
      };
    })()
  `, true).catch((error) => ({ error: error instanceof Error ? error.message : String(error), url: wc.getURL() })) as unknown;

  logger.warn(`[KuaishouDebug] 发布失败页面诊断: reason=${reason} data=${JSON.stringify(diagnostic)}`);
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

      if (clickByText([/^我知道了$/, /^知道了$/, /^跳过$/, /^Skip$/i])) {
        return true;
      }

      const closeSelectors = [
        '[aria-label="Skip"]',
        '[data-action="skip"]',
        'button[title="Skip"]',
        '[class*="close"]',
        '[class*="Close"]',
      ];
      for (const selector of closeSelectors) {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement && isVisible(el)) {
          el.click();
          return true;
        }
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
      const editableSelector = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"], .ProseMirror';
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const isMultiline = (el) => el instanceof HTMLTextAreaElement
        || el.getAttribute('contenteditable') === 'true'
        || el.getAttribute('role') === 'textbox'
        || el.classList.contains('ProseMirror');
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
  logger.info('在内嵌浏览器中填写快手视频标题、描述和话题...');

  const titleText = (title || '未命名视频').trim();
  const normalizedTags = TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 4, platform: 'kuaishou' });
  const descriptionText = description?.trim() ?? '';
  const riskControl = new EmbeddedRiskControl(wc);

  const titleSet = await setEmbeddedTextFieldByLabel(
    wc,
    [/^标题$/, /标题/],
    [/标题/, /填写标题/, /输入标题/],
    titleText,
  );
  if (!titleSet) {
    logger.warn('未找到快手标题输入框，将标题合并到作品描述中');
  }

  const descContent = titleSet
    ? descriptionText
    : [titleText, descriptionText].filter(Boolean).join('\n');
  const descSet = await riskControl.humanizedFillField({
    labelPatterns: [/作品描述/, /^描述$/, /视频描述/, /文案/, /正文/, /说点什么/],
    placeholderPatterns: [/作品描述/, /描述/, /视频描述/, /文案/, /正文/, /说点什么/],
    preferMultiline: true,
    allowFallback: true,
  }, descContent);

  if (!descSet) {
    throw new SelectorError('未找到快手作品描述框', undefined, 'kuaishou');
  }

  await riskControl.humanizedAppendTags(normalizedTags, {
    newlineBeforeFirst: descContent.length > 0,
    maxTags: 4,
  });
  for (const tag of normalizedTags) {
    logger.info(`快手话题已回车确认: #${tag}`);
  }
}

async function setEmbeddedCover(wc: WebContents, coverPath?: string): Promise<void> {
  const normalizedCoverPath = normalizeLocalFilePath(coverPath);
  if (!normalizedCoverPath || !fs.existsSync(normalizedCoverPath)) {
    return;
  }

  logger.info('在内嵌浏览器中设置快手封面...');
  const opened = await clickEmbeddedText(wc, [/封面设置/, /设置封面/, /封面/]);
  if (!opened) {
    logger.warn('未找到快手封面设置入口，跳过封面设置');
    return;
  }
  await sleep(1000);

  await clickEmbeddedText(wc, [/上传封面/, /本地上传/]);
  await sleep(500);

  const shouldDetach = await attachDebuggerIfNeeded(wc);
  try {
    const nodeId = await findEmbeddedFileInputNodeId(wc, 'image');
    if (!nodeId) {
      logger.warn('未找到封面上传控件，跳过封面设置');
      return;
    }
    await wc.debugger.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files: [normalizedCoverPath],
    });
  } finally {
    if (shouldDetach && wc.debugger.isAttached()) {
      wc.debugger.detach();
    }
  }

  await sleep(1000);
  await clickEmbeddedText(wc, [/^确认$/, /^确定$/, /^完成$/]);
}

async function setEmbeddedLocation(wc: WebContents, locationText?: string): Promise<boolean> {
  const value = locationText?.trim();
  if (!value) return true;

  logger.info(`映射快手添加地点: ${value}`);
  let focused = await setEmbeddedTextFieldByLabel(
    wc,
    [/添加地点/, /添加位置/, /地理位置/, /^位置$/],
    [/添加地点/, /添加位置/, /搜索地点/, /地点/, /位置/],
    value,
  );

  if (!focused) {
    await clickEmbeddedText(wc, [/添加地点/, /添加位置/, /地理位置/, /^位置$/]);
    await sleep(600);
    focused = await setEmbeddedTextFieldByLabel(
      wc,
      [/添加地点/, /添加位置/, /地理位置/, /^位置$/],
      [/添加地点/, /添加位置/, /搜索地点/, /地点/, /位置/],
      value,
      { allowFallback: true },
    );
  }

  if (!focused) {
    return false;
  }

  await sleep(1000);
  const selected = await selectEmbeddedLocationSuggestion(wc, value);
  if (!selected) {
    await wc.executeJavaScript(`
      (() => {
        const active = document.activeElement;
        active?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        active?.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `, true).catch(() => undefined);
  }
  await sleep(400);
  return true;
}

async function selectEmbeddedLocationSuggestion(wc: WebContents, locationText: string): Promise<boolean> {
  const source = escapeRegExpText(locationText);
  return await wc.executeJavaScript(`
    (() => {
      const pattern = new RegExp(${JSON.stringify(source)});
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('[role="option"], li, button, [role="button"], div, span'))
        .filter((el) => {
          if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
          const text = (el.innerText || el.textContent || '').trim();
          return text.length > 0 && text.length <= 120 && pattern.test(text);
        })
        .sort((a, b) => {
          const at = (a.innerText || a.textContent || '').trim();
          const bt = (b.innerText || b.textContent || '').trim();
          return at.length - bt.length;
        });
      for (const el of candidates) {
        const clickable = el.closest('[role="option"], li, button, [role="button"]') || el;
        if (!(clickable instanceof HTMLElement)) continue;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        return true;
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function applyEmbeddedPublishOptions(wc: WebContents, ctx: UploadContext): Promise<void> {
  logger.info(`在内嵌浏览器中设置快手发布选项: ${optionSummary(ctx)}`);
  const riskControl = new EmbeddedRiskControl(wc);

  if (ctx.location) {
    const mapped = await setEmbeddedLocation(wc, ctx.location);
    if (!mapped) throw new ValidationError('未映射快手添加地点', undefined, 'kuaishou');
    await riskControl.randomActionDelay();
  }

  if (ctx.declaration !== undefined) {
    const mapped = await selectEmbeddedAntSelectNearLabel(
      wc,
      [/作者声明/, /自主声明/, /作品声明/, /声明/],
      declarationPatterns(ctx.declaration),
      declarationOptionIndex(ctx.declaration),
    ) || await selectEmbeddedOptionNearLabel(
      wc,
      [/作者声明/, /自主声明/, /作品声明/, /声明/],
      declarationPatterns(ctx.declaration),
    );
    if (ctx.declaration && !mapped) throw new ValidationError('未映射快手作者声明', undefined, 'kuaishou');
    await riskControl.randomActionDelay();
  }

  if (ctx.visibility) {
    const mapped = await selectEmbeddedOptionNearLabel(
      wc,
      [/查看权限/, /谁可以看/, /可见范围/, /可见/],
      visibilityPatterns(ctx.visibility),
    );
    if (!mapped) throw new ValidationError('未映射快手查看权限', undefined, 'kuaishou');
    await riskControl.randomActionDelay();
  }

  const scheduleTime = formatScheduleDateTime(ctx.scheduledAt, { withSeconds: true });
  if (scheduleTime) {
    const mapped = await setEmbeddedScheduleTime(wc, scheduleTime);
    if (!mapped) throw new ValidationError('未映射快手发布时间: 定时发布', undefined, 'kuaishou');
  } else {
    const mapped = await selectEmbeddedOptionNearLabel(wc, [/发布时间/, /发布设置/], [/立即发布/])
      || await clickEmbeddedText(wc, [/立即发布/]);
    if (!mapped) logger.warn('未确认快手发布时间为立即发布，可能保持平台默认立即发布');
  }
  await riskControl.randomActionDelay();

  if (!(await setEmbeddedSwitchByText(wc, [/允许别人跟我同拍/, /允许别人跟我同框/, /允许同拍/, /允许同框/, /同拍/, /同框/], ctx.allowSameFrame))) {
    throw new ValidationError('未映射快手互动设置: 允许别人跟我同拍', undefined, 'kuaishou');
  }
  await riskControl.randomActionDelay();
  if (!(await setEmbeddedSwitchByText(wc, [/允许下载此作品/, /允许下载/, /下载此作品/], ctx.allowDownload))) {
    throw new ValidationError('未映射快手互动设置: 允许下载此作品', undefined, 'kuaishou');
  }
  await riskControl.randomActionDelay();
  if (!(await setEmbeddedSwitchByText(wc, [/作品展示在同城页/, /同城页/, /同城/], ctx.showInCity))) {
    throw new ValidationError('未映射快手互动设置: 作品展示在同城页', undefined, 'kuaishou');
  }
  await riskControl.randomActionDelay();
}

async function setEmbeddedScheduleTime(wc: WebContents, scheduleTime: string): Promise<boolean> {
  logger.info(`设置内嵌快手定时发布时间: ${scheduleTime}`);
  const parts = parseScheduleDateTimeParts(scheduleTime);
  if (!parts) {
    logger.warn(`快手定时发布时间格式无效: ${scheduleTime}`);
    return false;
  }

  const selected = await selectEmbeddedOptionNearLabel(wc, [/发布时间/, /发布设置/], [/定时发布/, /^定时$/])
    || await clickEmbeddedText(wc, [/定时发布/, /定时/, /发布时间/]);
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
        return /选择日期时间|选择发布时间|发布时间|日期|时间|datetime-local|ant-picker/.test(attrs);
      });
    })()
  `, true).catch(() => false);
  if (!selected && !inputAlreadyVisible) {
    logger.warn('未找到快手定时发布入口，跳过定时设置');
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
            return /选择日期时间|选择发布时间|发布时间|日期|时间|datetime-local|ant-picker/.test(attrs);
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
        input.select();
        dispatchValue(input, '');
        dispatchValue(input, value);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

        const okBtn = Array.from(document.querySelectorAll('.ant-picker-ok button, .ant-picker-footer button, button, [role="button"]'))
          .find((el) => {
            if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
            const text = (el.innerText || el.textContent || '').trim();
            return /^OK$/i.test(text) || /^确定$|^确认$|^完成$/.test(text) || el.closest('.ant-picker-ok');
          });
        if (okBtn instanceof HTMLElement) okBtn.click();
        input.blur();
        return { found: true, value: input.value };
      })()
    `, true).catch(() => ({ found: false, value: '' })) as { found: boolean; value: string };

    if (!result.found) {
      logger.warn(`未找到快手定时发布时间输入框，attempt=${attempt}`);
      const pickedByPanel = await setEmbeddedScheduleTimeByPickerPanel(wc, scheduleTime, parts);
      if (pickedByPanel) {
        return true;
      }
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
            return /选择日期时间|选择发布时间|发布时间|日期|时间|datetime-local|ant-picker/.test(attrs);
          });
        return input instanceof HTMLInputElement ? input.value : '';
      })()
    `, true).catch(() => result.value) as string;

    logger.info(`快手定时发布回读: 期望=${scheduleTime} 实际=${actual || result.value} attempt=${attempt}`);
    if (isScheduleDateTimeValueApplied(actual || result.value, scheduleTime)) {
      return true;
    }
  }

  logger.warn(`快手定时发布时间未成功写入: ${scheduleTime}`);
  return false;
}

async function setEmbeddedScheduleTimeByPickerPanel(
  wc: WebContents,
  scheduleTime: string,
  parts: ScheduleDateTimeParts,
): Promise<boolean> {
  logger.info(`尝试通过快手日历面板设置定时发布时间: ${scheduleTime}`);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await wc.executeJavaScript(`
      (() => {
        const target = ${JSON.stringify(parts)};
        const expected = ${JSON.stringify(scheduleTime)};
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const textOf = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
        const clickElement = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
          el.click();
          return true;
        };
        const panel = Array.from(document.querySelectorAll('.ant-picker-dropdown, .ant-picker-panel, [class*="picker"]'))
          .filter((el) => el instanceof HTMLElement && isVisible(el))
          .sort((a, b) => textOf(b).length - textOf(a).length)[0] || document.body;
        if (!(panel instanceof HTMLElement)) {
          return { ok: false, reason: 'panel-not-found', actual: '' };
        }

        const panelText = textOf(panel);
        const monthText = String(target.month) + '月';
        const yearText = String(target.year) + '年';
        const prevButton = () => Array.from(panel.querySelectorAll('.ant-picker-header-prev-btn, .ant-picker-header-super-prev-btn, button[aria-label*="Previous"], button[title*="Previous"], button'))
          .find((el) => el instanceof HTMLElement && isVisible(el) && /上|prev|previous|‹|«|</i.test(textOf(el) || el.getAttribute('aria-label') || el.getAttribute('title') || ''));
        const nextButton = () => Array.from(panel.querySelectorAll('.ant-picker-header-next-btn, .ant-picker-header-super-next-btn, button[aria-label*="Next"], button[title*="Next"], button'))
          .find((el) => el instanceof HTMLElement && isVisible(el) && /下|next|›|»|>/i.test(textOf(el) || el.getAttribute('aria-label') || el.getAttribute('title') || ''));

        const headerYearMatch = panelText.match(/(\\d{4})\\s*年/);
        const headerMonthMatch = panelText.match(/(\\d{1,2})\\s*月/);
        const currentYear = headerYearMatch ? Number(headerYearMatch[1]) : target.year;
        const currentMonth = headerMonthMatch ? Number(headerMonthMatch[1]) : target.month;
        const currentIndex = currentYear * 12 + currentMonth;
        const targetIndex = target.year * 12 + target.month;
        if ((currentYear !== target.year || currentMonth !== target.month) && Math.abs(targetIndex - currentIndex) <= 24) {
          const nav = targetIndex > currentIndex ? nextButton() : prevButton();
          if (nav instanceof HTMLElement) {
            nav.click();
            return { ok: false, reason: 'navigated-month', actual: panelText };
          }
        }

        const dayText = String(target.day);
        const dayCandidates = Array.from(panel.querySelectorAll('.ant-picker-cell:not(.ant-picker-cell-disabled), td, button, div, span'))
          .filter((el) => {
            if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
            const text = textOf(el);
            if (text !== dayText) return false;
            if (/ant-picker-cell-in-view/.test(String(el.className || ''))) return true;
            const cell = el.closest('.ant-picker-cell');
            return !cell || /ant-picker-cell-in-view/.test(String(cell.className || ''));
          })
          .sort((a, b) => {
            const ac = String((a.closest('.ant-picker-cell') || a).className || '');
            const bc = String((b.closest('.ant-picker-cell') || b).className || '');
            return (bc.includes('ant-picker-cell-in-view') ? 1 : 0) - (ac.includes('ant-picker-cell-in-view') ? 1 : 0);
          });
        const dayTarget = dayCandidates
          .map((el) => el.closest('.ant-picker-cell') || el)
          .find((el) => el instanceof HTMLElement && isVisible(el));
        if (!clickElement(dayTarget)) {
          return { ok: false, reason: 'day-not-found', actual: panelText };
        }

        const selectTimeOption = (kind, value) => {
          const lists = Array.from(panel.querySelectorAll('.ant-picker-time-panel-column, [class*="time-panel-column"], ul, ol'))
            .filter((el) => el instanceof HTMLElement && isVisible(el));
          const index = kind === 'hour' ? 0 : kind === 'minute' ? 1 : 2;
          const preferred = lists[index] ? [lists[index]] : [];
          const candidates = [...preferred, ...lists];
          for (const list of candidates) {
            const option = Array.from(list.querySelectorAll('li, div, span, button'))
              .find((el) => el instanceof HTMLElement && isVisible(el) && textOf(el).replace(/\\D/g, '').padStart(2, '0') === value);
            if (option instanceof HTMLElement) {
              option.scrollIntoView({ block: 'center', inline: 'nearest' });
              option.click();
              return true;
            }
          }
          return false;
        };
        selectTimeOption('hour', target.hour);
        selectTimeOption('minute', target.minute);
        selectTimeOption('second', target.second);

        const okBtn = Array.from(document.querySelectorAll('.ant-picker-ok button, .ant-picker-footer button, button, [role="button"]'))
          .find((el) => {
            if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
            const text = textOf(el);
            return /^OK$/i.test(text) || /^确定$|^确认$|^完成$/.test(text) || el.closest('.ant-picker-ok');
          });
        if (okBtn instanceof HTMLElement) okBtn.click();

        const actual = [
          ...Array.from(document.querySelectorAll('input')).map((el) => el instanceof HTMLInputElement ? el.value : ''),
          document.body?.innerText || '',
        ].filter(Boolean).join(' ');
        return { ok: actual.includes(target.dateIso) || actual.includes(yearText) && actual.includes(monthText) && actual.includes(dayText), reason: 'picked', actual };
      })()
    `, true).catch((error) => ({
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      actual: '',
    })) as { ok: boolean; reason: string; actual: string };

    await sleep(600);
    const actual = await getEmbeddedScheduleActualText(wc);
    logger.info(`快手日历面板回读: 期望=${scheduleTime} 实际=${actual || result.actual} attempt=${attempt} reason=${result.reason}`);
    if (result.ok && (isScheduleDateTimeValueApplied(actual || result.actual, scheduleTime) || isEmbeddedScheduleDateApplied(actual || result.actual, parts))) {
      return true;
    }
  }

  return false;
}

async function getEmbeddedScheduleActualText(wc: WebContents): Promise<string> {
  return await wc.executeJavaScript(`
    (() => {
      const values = Array.from(document.querySelectorAll('input'))
        .map((el) => el instanceof HTMLInputElement ? el.value : '')
        .filter(Boolean);
      const text = document.body?.innerText || '';
      return [...values, text].join(' ');
    })()
  `, true).catch(() => '') as string;
}

function isEmbeddedScheduleDateApplied(actual: string | undefined, parts: ScheduleDateTimeParts): boolean {
  if (!actual) return false;
  const normalized = actual.replace(/\s+/g, ' ').trim();
  const hasDate = normalized.includes(parts.dateIso)
    || normalized.includes(`${parts.year}年${parts.month}月${parts.day}日`)
    || new RegExp(`${parts.year}年\\s*${parts.month}月\\s*${parts.day}日?`).test(normalized);
  return hasDate;
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

async function clickEmbeddedPoint(wc: WebContents, x: number, y: number): Promise<void> {
  wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
  wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await sleep(60);
  wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
}

async function getEmbeddedAntSelectPointNearLabel(
  wc: WebContents,
  labelPatterns: TextPattern[],
): Promise<{ x: number; y: number } | null> {
  const serializedPatterns = labelPatterns.map(patternToSource);
  return await wc.executeJavaScript(`
    (() => {
      const patterns = ${JSON.stringify(serializedPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const labels = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter((el) => {
          if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && patterns.some((pattern) => pattern.test(text));
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      for (const label of labels) {
        let container = label.closest('[class*="edit-form-item"], [class*="form-item"], .ant-form-item') || label.parentElement;
        for (let depth = 0; container && depth < 7; depth += 1) {
          const selector = Array.from(container.querySelectorAll('.ant-select:not(.ant-select-disabled) .ant-select-selector'))
            .find((el) => el instanceof HTMLElement && isVisible(el) && !label.contains(el));
          if (selector instanceof HTMLElement) {
            selector.scrollIntoView({ block: 'center', inline: 'nearest' });
            const rect = selector.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }
          container = container.parentElement;
        }
      }
      return null;
    })()
  `, true).catch(() => null) as Promise<{ x: number; y: number } | null>;
}

async function getEmbeddedDropdownOptionPoint(
  wc: WebContents,
  optionPatterns: TextPattern[],
  fallbackIndex?: number,
): Promise<{ x: number; y: number } | null> {
  const payload = {
    options: optionPatterns.map(patternToSource),
    fallbackIndex,
  };
  return await wc.executeJavaScript(`
    (() => {
      const payload = ${JSON.stringify(payload)};
      const patterns = payload.options.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const options = Array.from(document.querySelectorAll(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled), [role="listbox"] [role="option"], [role="option"]'
      )).filter((el) => el instanceof HTMLElement && isVisible(el));
      const matched = options.find((el) => patterns.some((pattern) => pattern.test(textOf(el))));
      const fallback = typeof payload.fallbackIndex === 'number' ? options[payload.fallbackIndex] : undefined;
      const target = matched || fallback;
      if (!(target instanceof HTMLElement)) return null;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()
  `, true).catch(() => null) as Promise<{ x: number; y: number } | null>;
}

async function selectEmbeddedAntSelectByMouse(
  wc: WebContents,
  labelPatterns: TextPattern[],
  optionPatterns: TextPattern[],
  fallbackIndex?: number,
): Promise<boolean> {
  const selectPoint = await getEmbeddedAntSelectPointNearLabel(wc, labelPatterns);
  if (!selectPoint) return false;

  await clickEmbeddedPoint(wc, selectPoint.x, selectPoint.y);
  await sleep(500);

  const optionPoint = await getEmbeddedDropdownOptionPoint(wc, optionPatterns, fallbackIndex);
  if (!optionPoint) return false;

  await clickEmbeddedPoint(wc, optionPoint.x, optionPoint.y);
  await sleep(300);
  return true;
}

async function selectEmbeddedAntSelectNearLabel(
  wc: WebContents,
  labelPatterns: TextPattern[],
  optionPatterns: TextPattern[],
  fallbackIndex?: number,
): Promise<boolean> {
  const selectedByMouse = await selectEmbeddedAntSelectByMouse(wc, labelPatterns, optionPatterns, fallbackIndex);
  if (selectedByMouse) return true;

  const payload = {
    labels: labelPatterns.map(patternToSource),
    options: optionPatterns.map(patternToSource),
    fallbackIndex,
  };

  return await wc.executeJavaScript(`
    (async () => {
      const payload = ${JSON.stringify(payload)};
      const labelPatterns = payload.labels.map((p) => new RegExp(p.source, p.flags));
      const optionPatterns = payload.options.map((p) => new RegExp(p.source, p.flags));
      const PointerEventCtor = window.PointerEvent || window.MouseEvent;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const fireMouse = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = el.getBoundingClientRect();
        const init = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1)),
          clientY: rect.top + Math.max(1, Math.min(rect.height / 2, rect.height - 1)),
          button: 0,
          buttons: 1,
        };
        el.dispatchEvent(new PointerEventCtor('pointerdown', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mousedown', init));
        el.focus?.();
        el.dispatchEvent(new PointerEventCtor('pointerup', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
        return true;
      };
      const labels = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter((el) => {
          if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && labelPatterns.some((pattern) => pattern.test(text));
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      for (const label of labels) {
        let container = label.closest('[class*="edit-form-item"], [class*="form-item"], .ant-form-item') || label.parentElement;
        for (let depth = 0; container && depth < 7; depth += 1) {
          const select = Array.from(container.querySelectorAll('.ant-select:not(.ant-select-disabled)'))
            .find((el) => el instanceof HTMLElement && isVisible(el) && !label.contains(el));
          const selector = select?.querySelector?.('.ant-select-selector, [role="combobox"], [aria-haspopup="listbox"]');
          if (selector instanceof HTMLElement && fireMouse(selector)) {
            await sleep(500);
            const options = Array.from(document.querySelectorAll(
              '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled), [role="listbox"] [role="option"], [role="option"]'
            )).filter((el) => el instanceof HTMLElement && isVisible(el));
            const matched = options.find((el) => optionPatterns.some((pattern) => pattern.test(textOf(el))));
            const fallback = typeof payload.fallbackIndex === 'number' ? options[payload.fallbackIndex] : undefined;
            const target = matched || fallback;
            if (target instanceof HTMLElement) {
              fireMouse(target);
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
              await sleep(300);
              return true;
            }
            return false;
          }
          container = container.parentElement;
        }
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function selectEmbeddedOptionNearLabel(
  wc: WebContents,
  labelPatterns: TextPattern[],
  optionPatterns: TextPattern[],
): Promise<boolean> {
  const selected = await selectEmbeddedControlByText(wc, optionPatterns, labelPatterns);
  if (selected) return true;

  const opened = await openEmbeddedControlNearLabel(wc, labelPatterns)
    || await clickEmbeddedText(wc, labelPatterns);
  if (!opened) return false;
  await sleep(600);
  return await selectEmbeddedControlByText(wc, optionPatterns, labelPatterns)
    || await clickEmbeddedText(wc, optionPatterns);
}

async function openEmbeddedControlNearLabel(
  wc: WebContents,
  labelPatterns: TextPattern[],
): Promise<boolean> {
  const serializedPatterns = labelPatterns.map(patternToSource);
  return await wc.executeJavaScript(`
    (() => {
      const patterns = ${JSON.stringify(serializedPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const isDisabled = (el) => el.hasAttribute('disabled')
        || el.getAttribute('aria-disabled') === 'true'
        || /\\bdisabled\\b|ant-select-disabled/.test(String(el.className || ''));
      const labels = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter((el) => {
          if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && patterns.some((pattern) => pattern.test(text));
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      const controlSelector = [
        '.ant-select:not(.ant-select-disabled) .ant-select-selector',
        '[role="combobox"]:not([disabled])',
        '[aria-haspopup="listbox"]:not([disabled])',
        'button:not([disabled])',
        '[role="button"]:not([aria-disabled="true"])',
        'input[type="radio"]:not([disabled])',
        'input[type="checkbox"]:not([disabled])',
        '[role="switch"]:not([aria-disabled="true"])'
      ].join(',');

      for (const label of labels) {
        let container = label.closest('[class*="edit-form-item"], [class*="form-item"], .ant-form-item, label') || label.parentElement;
        for (let depth = 0; container && depth < 7; depth += 1) {
          const controls = Array.from(container.querySelectorAll(controlSelector))
            .filter((el) => el instanceof HTMLElement && isVisible(el) && !isDisabled(el));
          const target = controls.find((el) => !label.contains(el)) || controls[0];
          if (target instanceof HTMLElement) {
            target.scrollIntoView({ block: 'center', inline: 'nearest' });
            target.click();
            return true;
          }
          container = container.parentElement;
        }
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function selectEmbeddedControlByText(
  wc: WebContents,
  optionPatterns: TextPattern[],
  groupPatterns: TextPattern[] = [],
): Promise<boolean> {
  const serializedOptionPatterns = optionPatterns.map(patternToSource);
  const serializedGroupPatterns = groupPatterns.map(patternToSource);
  return await wc.executeJavaScript(`
    (() => {
      const optionPatterns = ${JSON.stringify(serializedOptionPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const groupPatterns = ${JSON.stringify(serializedGroupPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const hasGroupContext = (el) => {
        if (groupPatterns.length === 0) return true;
        let node = el;
        for (let depth = 0; node && depth < 7; depth += 1) {
          const text = textOf(node);
          if (text.length <= 500 && groupPatterns.some((pattern) => pattern.test(text))) return true;
          node = node.parentElement;
        }
        return false;
      };
      const findClickable = (el) => {
        const label = el.closest('label');
        if (label) {
          const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
          return input || label;
        }
        const roleControl = el.closest('[role="radio"], [role="option"], [role="button"], button, li');
        if (roleControl) return roleControl;
        let node = el;
        for (let depth = 0; node && depth < 6; depth += 1) {
          const input = node.querySelector?.('input[type="radio"], input[type="checkbox"]');
          const switchEl = node.querySelector?.('[role="switch"], .ant-switch, [class*="switch"], [class*="Switch"]');
          if (input || switchEl) return input || switchEl;
          node = node.parentElement;
        }
        return el;
      };
      const candidates = Array.from(document.querySelectorAll('label, [role="radio"], [role="option"], button, [role="button"], li, span, div'))
        .filter((el) => {
          if (!isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && optionPatterns.some((pattern) => pattern.test(text)) && hasGroupContext(el);
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      for (const el of candidates) {
        const clickable = findClickable(el);
        if (!(clickable instanceof HTMLElement)) continue;
        if (clickable.hasAttribute('disabled') || clickable.getAttribute('aria-disabled') === 'true') continue;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        clickable.dispatchEvent(new Event('input', { bubbles: true }));
        clickable.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function setEmbeddedSwitchByText(
  wc: WebContents,
  labelPatterns: TextPattern[],
  enabled?: boolean,
): Promise<boolean> {
  if (typeof enabled !== 'boolean') return false;
  const serializedPatterns = labelPatterns.map(patternToSource);
  return await wc.executeJavaScript(`
    (() => {
      const enabled = ${JSON.stringify(enabled)};
      const patterns = ${JSON.stringify(serializedPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const candidates = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter((el) => {
          if (!isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 100;
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);
      for (const el of candidates) {
        const text = textOf(el);
        if (!patterns.some((pattern) => pattern.test(text))) continue;
        let container = el.closest('label') || el.parentElement || el;
        let input = container.querySelector?.('input[type="checkbox"], input[type="radio"]');
        let switchEl = container.querySelector?.('[role="switch"], .ant-switch, [class*="switch"], [class*="Switch"]');
        for (let depth = 0; !input && !switchEl && container.parentElement && depth < 5; depth += 1) {
          container = container.parentElement;
          input = container.querySelector?.('input[type="checkbox"], input[type="radio"]');
          switchEl = container.querySelector?.('[role="switch"], .ant-switch, [class*="switch"], [class*="Switch"]');
        }
        const checked = input instanceof HTMLInputElement
          ? input.checked
          : switchEl instanceof HTMLElement
            ? switchEl.getAttribute('aria-checked') === 'true' || /checked/.test(switchEl.className)
            : false;
        if (checked === enabled) return true;
        const clickable = input || switchEl || container;
        if (clickable instanceof HTMLElement) {
          clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
          clickable.click();
          clickable.dispatchEvent(new Event('input', { bubbles: true }));
          clickable.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function waitForEmbeddedUploadComplete(
  wc: WebContents,
  timeoutMs: number,
): Promise<EmbeddedUploadStatus> {
  logger.info('等待内嵌浏览器视频上传完成...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = await wc.executeJavaScript(`
      (() => {
        const bodyText = document.body?.innerText || '';
        return {
          failed: /上传失败|上传出错|文件异常|格式不支持/.test(bodyText),
          uploading: /上传中|正在上传|处理中|转码中/.test(bodyText),
          hasPublishArea: /发布|发布时间|封面设置|查看权限|谁可以看|作品描述|添加地点/.test(bodyText),
        };
      })()
    `).catch(() => ({ failed: false, uploading: true, hasPublishArea: false })) as {
      failed: boolean;
      uploading: boolean;
      hasPublishArea: boolean;
    };

    if (state.failed) {
      return { success: false, message: '视频上传失败' };
    }

    if (!state.uploading && Date.now() - start > 4000) {
      logger.info('内嵌浏览器视频上传完成');
      return { success: true };
    }

    await sleep(2000);
  }

  return { success: false, message: '视频上传超时' };
}

async function clickEmbeddedPublish(wc: WebContents, timeoutMs: number): Promise<EmbeddedPublishState> {
  const start = Date.now();
  let clicked = false;

  while (Date.now() - start < timeoutMs) {
    const currentState = await getEmbeddedPublishState(wc);
    if (currentState !== 'timeout') {
      return currentState;
    }

    if (!clicked) {
      clicked = await clickEmbeddedButtonByText(wc, /^发布$/);
      if (clicked) {
        logger.info('已在内嵌浏览器点击快手发布按钮');
        await sleep(1000);
      }
    }

    await clickEmbeddedButtonByText(wc, /确认发布|确定发布|确认/);
    const stateAfterConfirm = await getEmbeddedPublishState(wc);
    if (stateAfterConfirm !== 'timeout') {
      return stateAfterConfirm;
    }

    await sleep(1000);
  }

  return 'timeout';
}

async function clickEmbeddedButtonByText(wc: WebContents, pattern: RegExp): Promise<boolean> {
  const source = pattern.source;
  const flags = pattern.flags;
  return await wc.executeJavaScript(`
    (() => {
      const pattern = new RegExp(${JSON.stringify(source)}, ${JSON.stringify(flags)});
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], span, div')).filter(isVisible);
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!pattern.test(text)) continue;
        const clickable = el.closest('button, [role="button"]') || el;
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

async function getEmbeddedPublishState(wc: WebContents): Promise<EmbeddedPublishState> {
  if (KUAISHOU_MANAGE_URL_PATTERN.test(wc.getURL())) {
    return 'success';
  }

  const state = await wc.executeJavaScript(`
    (() => {
      const bodyText = document.body?.innerText || '';
      if (/发布成功|作品发布成功|提交成功/.test(bodyText)) return 'success';
      if (/发布失败|提交失败|发布出错|审核失败|上传失败/.test(bodyText)) return 'failed';
      return 'timeout';
    })()
  `).catch(() => 'timeout') as EmbeddedPublishState;

  return state;
}

export async function uploadVideo(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId } = ctx;

  if (!fs.existsSync(videoPath)) {
    return { success: false, message: `视频文件不存在: ${videoPath}` };
  }

  const browserMode = normalizeBrowserMode(ctx.browserMode);
  const userDataDir = getUserDataDir(accountId);
  const headless = ctx.headless ?? false;
  const slowMo = ctx.slowMo ?? 200;

  if (browserMode === 'embedded' && !headless) {
    return uploadVideoInStandaloneBrowser(ctx);
  }

  logger.info(`启动快手自动化浏览器: mode=${browserMode} headless=${headless} slowMo=${slowMo}`);

  const launched = await launchPatchrightContext(ctx, userDataDir, browserMode, headless, slowMo);
  const { context } = launched;
  context.setDefaultNavigationTimeout(120000);
  let page: Page | undefined;
  let uploadSucceeded = false;
  let failureMessage = '';

  try {
    const allPages = context.pages();
    page = allPages.length > 0 ? allPages[0] : await context.newPage();

    logger.info('导航到快手上传页...');
    await page.goto(KUAISHOU_URLS.upload, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const isOnUploadPage = page.url().includes('/article/publish') || page.url().includes('/article/manage');

    if (!isOnUploadPage) {
      logger.info('页面未跳转到上传页，等待用户手动登录...');
      const loginCompleted = await waitForUserLogin(page, 300000);
      if (!loginCompleted) {
        failureMessage = '等待用户登录超时（5分钟）';
        return { success: false, message: failureMessage };
      }
      logger.info('用户登录成功，继续上传');
      await page.goto(KUAISHOU_URLS.upload, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }

    await saveCookie(context, getCookiePath(accountId));
    logger.info('Cookie 已保存');

    const result = await doUpload(page, ctx);
    uploadSucceeded = result.success;
    if (!result.success) {
      failureMessage = result.message;
      await logPagePublishDiagnostics(page, failureMessage);
    }
    return result;
  } catch (error) {
    failureMessage = `上传过程出错: ${error}`;
    if (page) {
      await logPagePublishDiagnostics(page, failureMessage);
    }
    return { success: false, message: failureMessage };
  } finally {
    if (!uploadSucceeded && !headless && shouldKeepBrowserOnPublishFailure()) {
      logger.warn(`已保留快手发布失败浏览器现场: accountId=${accountId} reason=${failureMessage || '未知失败原因'}`);
    } else {
      await launched.close().catch(() => {});
    }
  }
}

async function waitForUserLogin(page: Page, timeoutMs: number = 300000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    if (url.includes('/article/publish') || url.includes('/article/manage') || url.includes('/data/')) {
      return true;
    }

    const noLoginVisible = !(await page
      .getByText('扫码登录', { exact: true })
      .isVisible()
      .catch(() => false));
    if (noLoginVisible && !url.includes('id.kuaishou.com') && !url.includes('login')) {
      await page.waitForTimeout(2000);
      const newUrl = page.url();
      if (newUrl.includes('cp.kuaishou.com')) return true;
    }

    await page.waitForTimeout(3000);
  }
  return false;
}

async function doUpload(
  page: Page,
  ctx: UploadContext,
): Promise<UploadResult> {
  const { videoPath, title, description, tags } = ctx;
  const recorder = getDebugRecorder();

  await runPageDebugStep(page, ctx, '选择视频文件', async () => {
    // 等待上传按钮出现
    const uploadButton = page.locator("button[class^='_upload-btn']").first();
    await uploadButton.waitFor({ state: 'visible', timeout: 10000 });

    // 选择视频文件
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      uploadButton.click(),
    ]);
    await fileChooser.setFiles(videoPath);
    logger.info(`视频文件已选择: ${videoPath}`);
  });

  await recorder.recordStep('文件选择完成', async () => {
    return true;
  }, { page });

  // 关闭"我知道了"弹窗
  const knowBtn = page.locator('button[type="button"] span:text("我知道了")').first();
  try {
    if (await knowBtn.count() && await knowBtn.isVisible().catch(() => false)) {
      await knowBtn.click();
    }
  } catch {}

  // 关闭引导遮罩
  await closeGuideOverlay(page);

  await runPageDebugStep(page, ctx, '填写标题、作品描述和话题', async () => {
    await fillDescriptionAndTags(page, title, description, tags);
  });

  await recorder.recordStep('填写描述话题完成', async () => {
    return true;
  }, { page });

  // 等待视频上传完成
  const uploadComplete = await runPageDebugStep(page, ctx, '等待视频上传完成', async () => {
    logger.info('等待视频上传...');
    for (let i = 0; i < 90; i++) {
      const uploading = await page.locator('text=上传中').count();
      if (uploading === 0) {
        const failed = await page.locator('text=上传失败').count();
        if (failed > 0) {
          return false;
        }
        return true;
      }

      if (i % 10 === 0) {
        logger.info(`视频上传中... (${i * 2}s)`);
      }
      await page.waitForTimeout(2000);
    }
    return false;
  });

  if (!uploadComplete) {
    return { success: false, message: '视频上传超时' };
  }

  logger.info('视频上传完成');

  await recorder.recordStep('视频上传完成', async () => {
    return true;
  }, { page });

  await runPageDebugStep(page, ctx, '设置封面', async () => {
    await setThumbnail(page, ctx.coverPath);
  });
  await runPageDebugStep(page, ctx, '映射快手发布选项', async () => {
    await applyKuaishouPublishOptions(page, ctx);
  });

  await recorder.recordStep('发布选项设置完成', async () => {
    return true;
  }, { page });

  // 点击发布
  return await runPageDebugStep(page, ctx, '提交发布', async () => {
    logger.info(`所有元素设置完成，等待${PRE_PUBLISH_CONFIRMATION_DELAY_SECONDS}秒后发布...`);
    await page.waitForTimeout(PRE_PUBLISH_CONFIRMATION_DELAY_MS);

    await recorder.recordStep('发布前确认', async () => {
      return true;
    }, { page });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const publishBtn = page.getByText('发布', { exact: true }).first();
        if (await publishBtn.count() > 0 && await publishBtn.isVisible().catch(() => false)) {
          await publishBtn.click();
        }

        await page.waitForTimeout(1000);

        const confirmBtn = page.getByText('确认发布').first();
        if (await confirmBtn.count() > 0 && await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
        }

        const publishState = await waitForPublishState(page, 5000);
        if (publishState === 'success') {
          logger.info('视频发布成功');
          return { success: true, message: '视频发布成功', videoId: extractVideoId(page.url()) };
        }
        if (publishState === 'failed') {
          return { success: false, message: '视频发布失败' };
        }
      } catch {
        logger.info(`发布重试 ${attempt + 1}/5...`);
        await page.waitForTimeout(1000);
      }
    }

    return { success: false, message: '视频发布失败（发布按钮超时）' };
  });
}

async function setThumbnail(page: Page, coverPath?: string): Promise<void> {
  const normalizedCoverPath = normalizeLocalFilePath(coverPath);
  if (!normalizedCoverPath || !fs.existsSync(normalizedCoverPath)) {
    return;
  }

  logger.info('设置快手视频封面...');
  try {
    const coverLabel = page.locator('span').filter({ hasText: '封面设置' }).first();
    await coverLabel.waitFor({ state: 'visible', timeout: 10000 });
    await coverLabel.locator('xpath=../following-sibling::div[1]').locator('div').nth(0).click();

    const modal = page.locator('div[role="document"].ant-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 30000 });

    const uploadCoverTab = modal.getByText('上传封面', { exact: true });
    if (await uploadCoverTab.count()) {
      await uploadCoverTab.click();
    }

    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 30000 });
    await fileInput.setInputFiles(normalizedCoverPath);
    await page.waitForTimeout(1000);

    const confirmButton = modal.getByRole('button', { name: '确认', exact: true }).first();
    if (await confirmButton.count()) {
      await confirmButton.click();
    } else {
      await modal.getByText(/^确认$|^确定$|^完成$/).first().click();
    }

    await modal.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    logger.info('快手封面设置完成');
  } catch (error) {
    logger.warn(`设置快手封面失败，继续发布: ${error}`);
  }
}

async function setPageTextFieldByLabel(
  page: Page,
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

  return await page.evaluate((payload) => {
    const win = globalThis as any;
    const doc = win.document;
    const HTMLElementCtor = win.HTMLElement;
    const HTMLInputElementCtor = win.HTMLInputElement;
    const HTMLTextAreaElementCtor = win.HTMLTextAreaElement;
    const InputEventCtor = win.InputEvent || win.Event;
    const labelRegexes = payload.labels.map((p) => new RegExp(p.source, p.flags));
    const placeholderRegexes = payload.placeholders.map((p) => new RegExp(p.source, p.flags));
    const editableSelector = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"], .ProseMirror';
    const isElement = (el: any) => el && (!HTMLElementCtor || el instanceof HTMLElementCtor);
    const isInput = (el: any) => HTMLInputElementCtor && el instanceof HTMLInputElementCtor;
    const isTextarea = (el: any) => HTMLTextAreaElementCtor && el instanceof HTMLTextAreaElementCtor;
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: any) => (el.innerText || el.textContent || '').trim();
    const isMultiline = (el: any) => isTextarea(el)
      || el.getAttribute('contenteditable') === 'true'
      || el.getAttribute('role') === 'textbox'
      || el.classList.contains('ProseMirror');
    const editables = (Array.from(doc.querySelectorAll(editableSelector)) as any[])
      .filter((el: any) => isElement(el) && isVisible(el) && !el.matches('[disabled], [readonly], [type="hidden"]'));
    const matchesEditable = (el: any) => {
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
    const setText = (target: any) => {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      target.focus();
      if (isInput(target) || isTextarea(target)) {
        const prototype = isInput(target) ? HTMLInputElementCtor.prototype : HTMLTextAreaElementCtor.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) {
          setter.call(target, payload.value);
        } else {
          target.value = payload.value;
        }
        target.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
        target.dispatchEvent(new win.Event('change', { bubbles: true }));
        return true;
      }

      const selection = win.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      doc.execCommand('delete');
      target.innerText = payload.value;
      target.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
      target.dispatchEvent(new win.Event('change', { bubbles: true }));
      return true;
    };

    const placeholderTarget = editables.find(matchesEditable);
    if (placeholderTarget) return setText(placeholderTarget);

    const labels = (Array.from(doc.querySelectorAll('label, span, div, p')) as any[])
      .filter((el: any) => {
        if (!isElement(el) || !isVisible(el)) return false;
        const text = textOf(el);
        return text.length > 0 && text.length <= 80 && labelRegexes.some((pattern) => pattern.test(text));
      })
      .sort((a, b) => textOf(a).length - textOf(b).length);

    for (const label of labels) {
      let node: any = label;
      for (let depth = 0; node && depth < 7; depth += 1) {
        const candidates = (Array.from(node.querySelectorAll(editableSelector)) as any[])
          .filter((el: any) => isElement(el) && isVisible(el) && (!payload.preferMultiline || isMultiline(el)));
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
  }, payload).catch(() => false);
}

async function setKuaishouLocation(page: Page, locationText?: string): Promise<boolean> {
  const value = locationText?.trim();
  if (!value) return true;

  logger.info(`映射快手添加地点: ${value}`);
  let focused = await setPageTextFieldByLabel(
    page,
    [/添加地点/, /添加位置/, /地理位置/, /^位置$/],
    [/添加地点/, /添加位置/, /搜索地点/, /地点/, /位置/],
    value,
  );

  if (!focused) {
    await clickPageText(page, [/添加地点/, /添加位置/, /地理位置/, /^位置$/]);
    await page.waitForTimeout(600);
    focused = await setPageTextFieldByLabel(
      page,
      [/添加地点/, /添加位置/, /地理位置/, /^位置$/],
      [/添加地点/, /添加位置/, /搜索地点/, /地点/, /位置/],
      value,
      { allowFallback: true },
    );
  }

  if (!focused) return false;
  await page.waitForTimeout(1000);
  const selected = await selectPageLocationSuggestion(page, value);
  if (!selected) {
    await page.keyboard.press('Enter').catch(() => undefined);
  }
  await page.waitForTimeout(400);
  return true;
}

async function selectPageLocationSuggestion(page: Page, locationText: string): Promise<boolean> {
  return await page.evaluate((text) => {
    const win = globalThis as any;
    const doc = win.document;
    const HTMLElementCtor = win.HTMLElement;
    const pattern = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const isElement = (el: any) => el && (!HTMLElementCtor || el instanceof HTMLElementCtor);
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const candidates = (Array.from(doc.querySelectorAll('[role="option"], li, button, [role="button"], div, span')) as any[])
      .filter((el: any) => {
        if (!isElement(el) || !isVisible(el)) return false;
        const value = (el.innerText || el.textContent || '').trim();
        return value.length > 0 && value.length <= 120 && pattern.test(value);
      })
      .sort((a: any, b: any) => {
        const at = (a.innerText || a.textContent || '').trim();
        const bt = (b.innerText || b.textContent || '').trim();
        return at.length - bt.length;
      });
    for (const el of candidates) {
      const clickable = el.closest('[role="option"], li, button, [role="button"]') || el;
      if (!isElement(clickable)) continue;
      clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
      clickable.click();
      return true;
    }
    return false;
  }, locationText).catch(() => false);
}

async function applyKuaishouPublishOptions(page: Page, ctx: UploadContext): Promise<void> {
  logger.info(`设置快手发布选项: ${optionSummary(ctx)}`);
  const riskControl = new PageRiskControl(page);

  if (ctx.location) {
    const mapped = await setKuaishouLocation(page, ctx.location);
    if (!mapped) throw new ValidationError('未映射快手添加地点', undefined, 'kuaishou');
    await riskControl.randomActionDelay();
  }

  if (ctx.declaration !== undefined) {
    const mapped = await selectAntSelectNearLabel(
      page,
      [/作者声明/, /自主声明/, /作品声明/, /声明/],
      declarationPatterns(ctx.declaration),
      declarationOptionIndex(ctx.declaration),
    ) || await selectOptionNearLabel(
      page,
      [/作者声明/, /自主声明/, /作品声明/, /声明/],
      declarationPatterns(ctx.declaration),
    );
    if (ctx.declaration && !mapped) throw new ValidationError('未映射快手作者声明', undefined, 'kuaishou');
    await riskControl.randomActionDelay();
  }

  if (ctx.visibility) {
    const mapped = await selectOptionNearLabel(
      page,
      [/查看权限/, /谁可以看/, /可见范围/, /可见/],
      visibilityPatterns(ctx.visibility),
    );
    if (!mapped) throw new ValidationError('未映射快手查看权限', undefined, 'kuaishou');
    await riskControl.randomActionDelay();
  }

  const scheduleTime = formatScheduleDateTime(ctx.scheduledAt, { withSeconds: true });
  if (scheduleTime) {
    const mapped = await setScheduleTime(page, scheduleTime);
    if (!mapped) throw new ValidationError('未映射快手发布时间: 定时发布', undefined, 'kuaishou');
  } else {
    const mapped = await selectOptionNearLabel(page, [/发布时间/, /发布设置/], [/立即发布/])
      || await clickPageText(page, [/立即发布/]);
    if (!mapped) logger.warn('未确认快手发布时间为立即发布，可能保持平台默认立即发布');
  }
  await riskControl.randomActionDelay();

  if (!(await setSwitchByText(page, [/允许别人跟我同拍/, /允许别人跟我同框/, /允许同拍/, /允许同框/, /同拍/, /同框/], ctx.allowSameFrame))) {
throw new ValidationError('未映射快手互动设置: 允许别人跟我同拍', undefined, 'kuaishou');
  }
  await riskControl.randomActionDelay();
  if (!(await setSwitchByText(page, [/允许下载此作品/, /允许下载/, /下载此作品/], ctx.allowDownload))) {
    throw new ValidationError('未映射快手互动设置: 允许下载此作品', undefined, 'kuaishou');
  }
  await riskControl.randomActionDelay();
  if (!(await setSwitchByText(page, [/作品展示在同城页/, /同城页/, /同城/], ctx.showInCity))) {
    throw new ValidationError('未映射快手互动设置: 作品展示在同城页', undefined, 'kuaishou');
  }
  await riskControl.randomActionDelay();
}

async function setScheduleTime(page: Page, scheduleTime: string): Promise<boolean> {
  try {
    logger.info(`设置快手定时发布时间: ${scheduleTime}`);
    const selected = await selectOptionNearLabel(page, [/发布时间/, /发布设置/], [/定时发布/, /^定时$/]);
    if (!selected) {
      const clicked = await clickPageText(page, [/定时发布/, /定时/]);
      if (!clicked) return false;
    }

    await page.waitForTimeout(800);
    const input = page.locator('div.ant-picker-input input[placeholder*="时间"], div.ant-picker-input input[placeholder*="日期"], input[placeholder*="发布时间"], input[placeholder*="日期"], input[placeholder*="时间"], input[type="datetime-local"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await input.click();
      await page.waitForTimeout(attempt === 1 ? 500 : 300);
      await input.evaluate((el, value) => {
        const inputEl = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(inputEl, '');
          setter.call(inputEl, value);
        } else {
          inputEl.value = value;
        }
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }, scheduleTime);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      const pickerOk = page.locator('.ant-picker-ok button, .ant-picker-footer button, button:has-text("确定"), button:has-text("确认"), button:has-text("完成")').first();
      if (await pickerOk.isVisible().catch(() => false)) {
        await pickerOk.click();
      } else {
        await clickPageText(page, [/^确定$/, /^确认$/, /^完成$/]);
      }
      await page.waitForTimeout(500);

      const actual = await input.inputValue().catch(() => '');
      logger.info(`快手定时发布回读: 期望=${scheduleTime} 实际=${actual} attempt=${attempt}`);
      if (isScheduleDateTimeValueApplied(actual, scheduleTime)) {
        return true;
      }
    }

    logger.warn(`快手定时发布时间回读不匹配: ${scheduleTime}`);
    return false;
  } catch (error) {
    logger.warn(`设置快手定时发布时间失败: ${error}`);
    return false;
  }
}

async function clickPageText(page: Page, patterns: TextPattern[]): Promise<boolean> {
  for (const pattern of patterns) {
    const locator = typeof pattern === 'string'
      ? page.getByText(pattern, { exact: false }).first()
      : page.getByText(pattern).first();
    if (await locator.count() > 0 && await locator.isVisible().catch(() => false)) {
      await locator.click().catch(async () => {
        await locator.click({ force: true }).catch(() => {});
      });
      return true;
    }
  }
  return false;
}

async function logPagePublishDiagnostics(page: Page, reason: string): Promise<void> {
  const diagnostic = await page.evaluate(() => {
    const win = globalThis as any;
    const doc = win.document;
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: any) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    const visibleTexts = (Array.from(doc.querySelectorAll('button, [role="button"], label, .ant-select, .ant-radio-wrapper, .ant-checkbox-wrapper, [role="switch"], [class*="edit-form-item"]')) as any[])
      .filter((el: any) => isVisible(el))
      .map(textOf)
      .filter(Boolean)
      .slice(0, 40);
    const sectionLabels = ['作者声明', '查看权限', '发布时间', '互动设置', '作品描述', '封面设置', '添加地点'];
    const sections: Record<string, string> = {};
    for (const label of sectionLabels) {
      const node = (Array.from(doc.querySelectorAll('label, span, div, p')) as any[])
        .find((el: any) => isVisible(el) && textOf(el).includes(label));
      const container = node?.closest?.('[class*="edit-form-item"], [class*="form-item"], .ant-form-item') || node?.parentElement;
      sections[label] = container ? textOf(container).slice(0, 500) : '';
    }
    return {
      url: win.location.href,
      title: doc.title,
      ready: doc.readyState,
      bodyLength: doc.body?.innerText?.length || 0,
      visibleTexts,
      sections,
    };
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error), url: page.url() })) as unknown;

  logger.warn(`[KuaishouDebug] 发布失败页面诊断: reason=${reason} data=${JSON.stringify(diagnostic)}`);
}

async function selectAntSelectNearLabel(
  page: Page,
  labelPatterns: TextPattern[],
  optionPatterns: TextPattern[],
  fallbackIndex?: number,
): Promise<boolean> {
  const payload = {
    labels: labelPatterns.map(patternToSource),
    options: optionPatterns.map(patternToSource),
    fallbackIndex,
  };

  return await page.evaluate(async (payload: {
    labels: Array<{ source: string; flags: string }>;
    options: Array<{ source: string; flags: string }>;
    fallbackIndex?: number;
  }) => {
    const win = globalThis as any;
    const doc = win.document;
    const HTMLElementCtor = win.HTMLElement;
    const PointerEventCtor = win.PointerEvent || win.MouseEvent;
    const labelRegexes = payload.labels.map((p) => new RegExp(p.source, p.flags));
    const optionRegexes = payload.options.map((p) => new RegExp(p.source, p.flags));
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const isElement = (el: any) => el && (!HTMLElementCtor || el instanceof HTMLElementCtor);
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: any) => (el.innerText || el.textContent || '').trim();
    const fireMouse = (el: any) => {
      if (!isElement(el)) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = el.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        view: win,
        clientX: rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1)),
        clientY: rect.top + Math.max(1, Math.min(rect.height / 2, rect.height - 1)),
        button: 0,
        buttons: 1,
      };
      el.dispatchEvent(new PointerEventCtor('pointerdown', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new win.MouseEvent('mousedown', init));
      el.focus?.();
      el.dispatchEvent(new PointerEventCtor('pointerup', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
      el.dispatchEvent(new win.MouseEvent('mouseup', { ...init, buttons: 0 }));
      el.dispatchEvent(new win.MouseEvent('click', { ...init, buttons: 0 }));
      return true;
    };
    const labels = (Array.from(doc.querySelectorAll('label, span, div, p')) as any[])
      .filter((el: any) => {
        if (!isElement(el) || !isVisible(el)) return false;
        const text = textOf(el);
        return text.length > 0 && text.length <= 80 && labelRegexes.some((pattern) => pattern.test(text));
      })
      .sort((a, b) => textOf(a).length - textOf(b).length);

    for (const label of labels) {
      let container = label.closest?.('[class*="edit-form-item"], [class*="form-item"], .ant-form-item') || label.parentElement;
      for (let depth = 0; container && depth < 7; depth += 1) {
        const select = (Array.from(container.querySelectorAll('.ant-select:not(.ant-select-disabled)')) as any[])
          .find((el: any) => isElement(el) && isVisible(el) && !label.contains?.(el));
        const selector = select?.querySelector?.('.ant-select-selector, [role="combobox"], [aria-haspopup="listbox"]');
        if (isElement(selector) && fireMouse(selector)) {
          await sleep(500);
          const options = (Array.from(doc.querySelectorAll(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled), [role="listbox"] [role="option"], [role="option"]',
          )) as any[]).filter((el: any) => isElement(el) && isVisible(el));
          const matched = options.find((el: any) => optionRegexes.some((pattern) => pattern.test(textOf(el))));
          const fallback = typeof payload.fallbackIndex === 'number' ? options[payload.fallbackIndex] : undefined;
          const target = matched || fallback;
          if (isElement(target)) {
            fireMouse(target);
            target.dispatchEvent?.(new win.Event('input', { bubbles: true }));
            target.dispatchEvent?.(new win.Event('change', { bubbles: true }));
            await sleep(300);
            return true;
          }
          return false;
        }
        container = container.parentElement;
      }
    }
    return false;
  }, payload).catch(() => false);
}

async function selectOptionNearLabel(
  page: Page,
  labelPatterns: TextPattern[],
  optionPatterns: TextPattern[],
): Promise<boolean> {
  const selected = await selectControlByText(page, optionPatterns, labelPatterns);
  if (selected) return true;

  const opened = await openControlNearLabel(page, labelPatterns)
    || await clickPageText(page, labelPatterns);
  if (!opened) return false;
  await page.waitForTimeout(600);
  return await selectControlByText(page, optionPatterns, labelPatterns)
    || await clickPageText(page, optionPatterns);
}

async function openControlNearLabel(
  page: Page,
  labelPatterns: TextPattern[],
): Promise<boolean> {
  const serializedPatterns = labelPatterns.map(patternToSource);
  return await page.evaluate((payload: Array<{ source: string; flags: string }>) => {
    const win = globalThis as any;
    const doc = win.document;
    const HTMLElementCtor = win.HTMLElement;
    const patterns = payload.map((p) => new RegExp(p.source, p.flags));
    const isElement = (el: any) => el && (!HTMLElementCtor || el instanceof HTMLElementCtor);
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = win.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: any) => (el.innerText || el.textContent || '').trim();
    const isDisabled = (el: any) => el.hasAttribute?.('disabled')
      || el.getAttribute?.('aria-disabled') === 'true'
      || /\bdisabled\b|ant-select-disabled/.test(String(el.className || ''));
    const labels = (Array.from(doc.querySelectorAll('label, span, div, p')) as any[])
      .filter((el: any) => {
        if (!isElement(el) || !isVisible(el)) return false;
        const text = textOf(el);
        return text.length > 0 && text.length <= 80 && patterns.some((pattern) => pattern.test(text));
      })
      .sort((a, b) => textOf(a).length - textOf(b).length);

    const controlSelector = [
      '.ant-select:not(.ant-select-disabled) .ant-select-selector',
      '[role="combobox"]:not([disabled])',
      '[aria-haspopup="listbox"]:not([disabled])',
      'button:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      'input[type="radio"]:not([disabled])',
      'input[type="checkbox"]:not([disabled])',
      '[role="switch"]:not([aria-disabled="true"])',
    ].join(',');

    for (const label of labels) {
      let container = label.closest?.('[class*="edit-form-item"], [class*="form-item"], .ant-form-item, label') || label.parentElement;
      for (let depth = 0; container && depth < 7; depth += 1) {
        const controls = (Array.from(container.querySelectorAll(controlSelector)) as any[])
          .filter((el: any) => isElement(el) && isVisible(el) && !isDisabled(el));
        const target = controls.find((el: any) => !label.contains?.(el)) || controls[0];
        if (target && typeof target.click === 'function') {
          target.scrollIntoView({ block: 'center', inline: 'nearest' });
          target.click();
          return true;
        }
        container = container.parentElement;
      }
    }
    return false;
  }, serializedPatterns).catch(() => false);
}

async function selectControlByText(
  page: Page,
  optionPatterns: TextPattern[],
  groupPatterns: TextPattern[] = [],
): Promise<boolean> {
  const serializedOptionPatterns = optionPatterns.map(patternToSource);
  const serializedGroupPatterns = groupPatterns.map(patternToSource);
  return await page.evaluate((payload: { options: Array<{ source: string; flags: string }>; groups: Array<{ source: string; flags: string }> }) => {
    const doc = (globalThis as any).document;
    const optionRegexes = payload.options.map((p) => new RegExp(p.source, p.flags));
    const groupRegexes = payload.groups.map((p) => new RegExp(p.source, p.flags));
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = (globalThis as any).getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: any) => (el.innerText || el.textContent || '').trim();
    const hasGroupContext = (el: any) => {
      if (groupRegexes.length === 0) return true;
      let node = el;
      for (let depth = 0; node && depth < 7; depth += 1) {
        const text = textOf(node);
        if (text.length <= 500 && groupRegexes.some((pattern) => pattern.test(text))) return true;
        node = node.parentElement;
      }
      return false;
    };
    const findClickable = (el: any) => {
      const label = el.closest?.('label');
      if (label) {
        const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
        return input || label;
      }
      const roleControl = el.closest?.('[role="radio"], [role="option"], [role="button"], button, li');
      if (roleControl) return roleControl;
      let node = el;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const input = node.querySelector?.('input[type="radio"], input[type="checkbox"]');
        const switchEl = node.querySelector?.('[role="switch"], .ant-switch, [class*="switch"], [class*="Switch"]');
        if (input || switchEl) return input || switchEl;
        node = node.parentElement;
      }
      return el;
    };
    const candidates = (Array.from(doc.querySelectorAll('label, [role="radio"], [role="option"], button, [role="button"], li, span, div')) as any[])
      .filter((el) => {
        if (!isVisible(el)) return false;
        const text = textOf(el);
        return text.length > 0 && text.length <= 80 && optionRegexes.some((pattern) => pattern.test(text)) && hasGroupContext(el);
      })
      .sort((a, b) => textOf(a).length - textOf(b).length);

    for (const el of candidates) {
      const clickable = findClickable(el);
      if (!clickable || typeof clickable.click !== 'function') continue;
      if (clickable.hasAttribute?.('disabled') || clickable.getAttribute?.('aria-disabled') === 'true') continue;
      clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
      clickable.click();
      clickable.dispatchEvent?.(new Event('input', { bubbles: true }));
      clickable.dispatchEvent?.(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, { options: serializedOptionPatterns, groups: serializedGroupPatterns }).catch(() => false);
}

async function setSwitchByText(page: Page, labelPatterns: TextPattern[], enabled?: boolean): Promise<boolean> {
  if (typeof enabled !== 'boolean') return false;
  const serializedPatterns = labelPatterns.map(patternToSource);
  return await page.evaluate((payload: any) => {
    const doc = (globalThis as any).document;
    const regexes = payload.patterns.map((p: any) => new RegExp(p.source, p.flags));
    const isVisible = (el: any) => {
      const rect = el.getBoundingClientRect();
      const style = (globalThis as any).getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: any) => (el.innerText || el.textContent || '').trim();
    const candidates = (Array.from(doc.querySelectorAll('label, span, div, p')).filter((el: any) => {
      if (!isVisible(el)) return false;
      const text = textOf(el);
      return text.length > 0 && text.length <= 100;
    }) as any[]).sort((a, b) => textOf(a).length - textOf(b).length);
    for (const el of candidates) {
      const text = textOf(el);
      if (!regexes.some((pattern: RegExp) => pattern.test(text))) continue;
      let container = el.closest('label') || el.parentElement || el;
      let input = container.querySelector?.('input[type="checkbox"], input[type="radio"]');
      let switchEl = container.querySelector?.('[role="switch"], .ant-switch, [class*="switch"], [class*="Switch"]');
      for (let depth = 0; !input && !switchEl && container.parentElement && depth < 5; depth += 1) {
        container = container.parentElement;
        input = container.querySelector?.('input[type="checkbox"], input[type="radio"]');
        switchEl = container.querySelector?.('[role="switch"], .ant-switch, [class*="switch"], [class*="Switch"]');
      }
      const checked = input && input.tagName === 'INPUT'
        ? input.checked
        : switchEl
          ? switchEl.getAttribute('aria-checked') === 'true' || /checked/.test(String(switchEl.className))
          : false;
      if (checked === payload.enabled) return true;
      const clickable = input || switchEl || container;
      if (clickable && typeof clickable.click === 'function') {
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        clickable.dispatchEvent?.(new Event('input', { bubbles: true }));
        clickable.dispatchEvent?.(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, { patterns: serializedPatterns, enabled });
}

async function fillDescriptionAndTags(
  page: Page,
  title: string,
  description?: string,
  tags?: string[],
): Promise<void> {
  logger.info('填写视频标题、描述和话题...');
  const titleText = (title || '未命名视频').trim();
  const normalizedTags = TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 4, platform: 'kuaishou' });
  const descriptionText = description?.trim() ?? '';
  const riskControl = new PageRiskControl(page);

  const titleSet = await setPageTextFieldByLabel(
    page,
    [/^标题$/, /标题/],
    [/标题/, /填写标题/, /输入标题/],
    titleText,
  );
  if (!titleSet) {
    logger.warn('未找到快手标题输入框，将标题合并到作品描述中');
  }

  const descContent = titleSet
    ? descriptionText
    : [titleText, descriptionText].filter(Boolean).join('\n');
  const descSet = await riskControl.humanizedFillField({
    labelPatterns: [/作品描述/, /^描述$/, /视频描述/, /文案/, /正文/, /说点什么/],
    placeholderPatterns: [/作品描述/, /描述/, /视频描述/, /文案/, /正文/, /说点什么/],
    preferMultiline: true,
    allowFallback: true,
  }, descContent);

  if (!descSet) {
    throw new SelectorError('未找到快手作品描述框', undefined, 'kuaishou');
  }

  await riskControl.humanizedAppendTags(normalizedTags, {
    newlineBeforeFirst: descContent.length > 0,
    maxTags: 4,
  });
  for (const tag of normalizedTags) {
    logger.info(`快手话题已回车确认: #${tag}`);
  }
}

async function waitForPublishState(
  page: Page,
  timeoutMs: number,
): Promise<'success' | 'failed' | 'timeout'> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (KUAISHOU_MANAGE_URL_PATTERN.test(page.url())) {
      return 'success';
    }

    const successVisible = await page
      .getByText('发布成功', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (successVisible) {
      return 'success';
    }

    const failedVisible = await page
      .getByText(/发布失败|提交失败|错误/)
      .first()
      .isVisible()
      .catch(() => false);
    if (failedVisible) {
      return 'failed';
    }

    await page.waitForTimeout(500);
  }

  return 'timeout';
}

function closeGuideOverlay(page: Page): Promise<void> {
  const overlay = page
    .locator('div[id^="react-joyride-step"] div[role="alertdialog"], .guide-overlay, .modal-mask, [class*="guide"]')
    .first();
  return overlay.isVisible()
    .then(async (v) => {
      if (!v) return;
      const closeButton = overlay.locator('[aria-label="Skip"], [data-action="skip"], button[title="Skip"]').first();
      if (await closeButton.count()) {
        await closeButton.click({ force: true }).catch(() => {});
      } else {
        await overlay.click().catch(() => {});
      }
      logger.info('已关闭引导遮罩');
    })
    .catch(() => {});
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/photoId=([^&]+)/) || url.match(/\/video\/([^?/]+)/);
  return match ? match[1] : undefined;
}
