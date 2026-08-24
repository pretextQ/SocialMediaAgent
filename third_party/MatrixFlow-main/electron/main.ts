import { initSentryMain } from './core/SentryInit';
initSentryMain();

import { app, BrowserWindow, ipcMain, protocol, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AppLifecycle } from './core/AppLifecycle';
import { ConfigManager } from './core/ConfigManager';
import { EventBus } from './core/EventBus';
import { Logger } from './core/Logger';
import { browserPool } from './core/BrowserPool';
import { securityLayer } from './core/SecurityLayer';
import { taskScheduler } from './core/TaskScheduler';
import { selectorUpdateService } from './core/SelectorUpdateService';
import { platformConfigLoader } from './core/PlatformConfigLoader';
import { registerIpcHandlers } from './ipc/handlers';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);
import { registerAccountLoginHandlers } from './services/ipc-handlers';
import { autoUpdaterService } from './core/AutoUpdater';
import { initDatabase, closeDatabase } from './data/Database';
import { registerAllAdapters, PlatformRegistry } from './platform/adapter';
import { multiPanelService } from './services/MultiPanelService';
import { publishService } from './services/PublishService';
import { accountService } from './services/AccountService';
import { materialService } from './services/MaterialService';
import { browserManager } from './services/embedded-browser/browser-manager';

const logger = new Logger('Main');

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'AutomationControlled');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_interface_only');

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'Cache-Control': 'no-cache' } });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  await mainWindow.webContents.session.clearCache();
  await mainWindow.webContents.session.clearStorageData({ storages: ['cachestorage'] });

  autoUpdaterService.initialize(mainWindow);
  multiPanelService.setMainWindow(mainWindow);
  browserManager.setMainWindow(mainWindow);

  if (process.env.NODE_ENV === 'development') {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.hdslb.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.bilibili.com';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  protocol.handle('local-file', async (request) => {
    try {
      const url = new URL(request.url);
      // Chromium 会把 // 后的第一段当 host 并转小写
      // local-file:///Volumes/... → host="" pathname="/Volumes/..."
      // local-file://Volumes/... → host="volumes" pathname="/..."
      // 两种情况都需要处理
      let filePath: string;
      if (url.host) {
        filePath = '/' + url.host + decodeURIComponent(url.pathname);
      } else {
        filePath = decodeURIComponent(url.pathname);
      }

      if (!path.isAbsolute(filePath)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fs.existsSync(filePath)) {
        return new Response(`Not found: ${path.basename(filePath)}`, { status: 404 });
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';

      switch (ext) {
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.webp':
          contentType = 'image/webp';
          break;
        case '.mp4':
          contentType = 'video/mp4';
          break;
        case '.webm':
          contentType = 'video/webm';
          break;
        case '.mov':
          contentType = 'video/quicktime';
          break;
      }

      // 处理 Range 请求（<video> 元素需要）
      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
          const chunkSize = end - start + 1;

          if (start >= stat.size || end >= stat.size) {
            return new Response('Range Not Satisfiable', { status: 416 });
          }

          const buffer = Buffer.alloc(chunkSize);
          const fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, buffer, 0, chunkSize, start);
          fs.closeSync(fd);

          return new Response(buffer, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Content-Length': String(chunkSize),
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=31536000',
            },
          });
        }
      }

      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(`Error: ${message}`, { status: 500 });
    }
  });

  logger.info('MatrixFlow 启动中...');

  initDatabase();
  logger.info('数据库初始化完成');

  const config = ConfigManager.getInstance();
  await config.initialize();

  await securityLayer.initialize();
  logger.info('安全层初始化完成');

  await browserPool.initialize();
  logger.info('浏览器池初始化完成');

  taskScheduler.start();
  logger.info('任务调度器已启动');

  publishService.initialize();
  logger.info('发布管理服务已初始化');

  await selectorUpdateService.initialize();
  logger.info('选择器更新服务已启动');

  await platformConfigLoader.initialize();
  logger.info('平台配置加载器已启动');

  await materialService.initialize();
  logger.info('素材管理服务已启动');

  const eventBus = EventBus.getInstance();
  const lifecycle = new AppLifecycle(config, eventBus);
  await lifecycle.initialize();

  registerAllAdapters();
  logger.info(`已注册平台: ${PlatformRegistry.getSupportedPlatforms().join(', ')}`);

  await accountService.initialize();
  logger.info('账号管理服务已初始化');

  registerIpcHandlers();
  registerAccountLoginHandlers();

  await createWindow();

  logger.info('MatrixFlow 启动完成');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  logger.info('MatrixFlow 正在关闭...');

  taskScheduler.stop();
  logger.info('任务调度器已停止');

  materialService.dispose();
  logger.info('素材管理服务已停止');

  browserManager.dispose();
  logger.info('内嵌浏览器已关闭');

  await browserPool.shutdown();
  logger.info('浏览器池已关闭');

  closeDatabase();
  logger.info('数据库已关闭');

  const lifecycle = AppLifecycle.getInstance();
  await lifecycle.shutdown();
  logger.info('MatrixFlow 已关闭');
});
