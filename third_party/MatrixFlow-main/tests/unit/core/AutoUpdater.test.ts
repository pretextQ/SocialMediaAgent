import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-updater before importing
const mockAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
};

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

// Mock electron dialog
const mockDialog = {
  showMessageBox: vi.fn(),
};

vi.mock('electron', async (importOriginal) => {
  const original = await importOriginal<typeof import('electron')>();
  return {
    ...original,
    dialog: mockDialog,
  };
});

// Helper to capture event handlers registered via autoUpdater.on
function getEventHandler(event: string): ((...args: unknown[]) => void) | undefined {
  for (const call of mockAutoUpdater.on.mock.calls) {
    if (call[0] === event) return call[1];
  }
  return undefined;
}

// We need to create a fresh service per test — import the class directly
// The module exports a singleton, so we use dynamic import with reset
describe('AutoUpdaterService', () => {
  let AutoUpdaterService: any;
  let service: any;
  let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> }; isDestroyed: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();

    // Re-mock electron-updater (fresh mocks per test)
    vi.doMock('electron-updater', () => ({
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        quitAndInstall: vi.fn(),
        on: vi.fn(),
      },
    }));

    mockDialog.showMessageBox = vi.fn();

    vi.doMock('electron', async (importOriginal) => {
      const original = await importOriginal<typeof import('electron')>();
      return {
        ...original,
        dialog: mockDialog,
      };
    });

    const mod = await import('@electron/core/AutoUpdater');

    // The module exports a singleton; get the class constructor to create a fresh instance
    // autoUpdaterService is an instance of AutoUpdaterService class (not exported)
    // We access the service from the exported singleton's constructor
    service = mod.autoUpdaterService;
    // We need a fresh instance for proper test isolation — use constructor via Object.getPrototypeOf
    const ServiceClass = service.constructor;
    service = new ServiceClass();

    mockWindow = {
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn(() => false),
    };

    // Reset env
    delete process.env.NODE_ENV;
  });

  describe('initialize', () => {
    it('should set autoDownload false and autoInstallOnAppQuit true', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      expect(au.autoDownload).toBe(false);
      expect(au.autoInstallOnAppQuit).toBe(true);
    });

    it('should skip event registration in development mode', async () => {
      process.env.NODE_ENV = 'development';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      expect(au.on).not.toHaveBeenCalled();
    });

    it('should register 6 event handlers in production', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      expect(au.on).toHaveBeenCalledTimes(6);
      const events = au.on.mock.calls.map((c: string[]) => c[0]);
      expect(events).toContain('checking-for-update');
      expect(events).toContain('update-available');
      expect(events).toContain('update-not-available');
      expect(events).toContain('download-progress');
      expect(events).toContain('update-downloaded');
      expect(events).toContain('error');
    });

    it('checking-for-update handler updates status and sends to renderer', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      const handler = getEventHandler.call(null, 'checking-for-update');
      // Since we re-mocked, get from au.on calls
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'checking-for-update')?.[1];
      handlerFn?.();

      expect(service.getStatus().status).toBe('checking');
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:status', { status: 'checking' });
    });

    it('update-available handler updates status with version info', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-available')?.[1];
      handlerFn?.({ version: '2.0.0', releaseNotes: 'Bug fixes', releaseDate: '2026-05-19' });

      expect(service.getStatus().status).toBe('available');
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:status', {
        status: 'available',
        version: '2.0.0',
        releaseNotes: 'Bug fixes',
        releaseDate: '2026-05-19',
      });
    });

    it('update-not-available handler sets status to not-available', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-not-available')?.[1];
      handlerFn?.();

      expect(service.getStatus().status).toBe('not-available');
    });

    it('download-progress handler sends progress to renderer', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'download-progress')?.[1];
      handlerFn?.({ bytesPerSecond: 1024000, percent: 45.7, transferred: 4570000, total: 10000000 });

      expect(service.getStatus().status).toBe('downloading');
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:progress', {
        percent: 46,
        bytesPerSecond: 1024000,
        transferred: 4570000,
        total: 10000000,
      });
    });

    it('update-downloaded handler stores downloaded info and sends to renderer', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-downloaded')?.[1];
      handlerFn?.({ version: '2.0.0' });

      expect(service.getStatus().status).toBe('downloaded');
      expect(service.getStatus().version).toBe('2.0.0');
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:status', {
        status: 'downloaded',
        version: '2.0.0',
      });
    });

    it('error handler sets error status and sends message to renderer', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      service.initialize(mockWindow);

      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'error')?.[1];
      handlerFn?.(new Error('Network failure'));

      expect(service.getStatus().status).toBe('error');
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:status', {
        status: 'error',
        message: 'Network failure',
      });
    });

    it('should not send to renderer when window is destroyed', async () => {
      process.env.NODE_ENV = 'production';
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      mockWindow.isDestroyed = vi.fn(() => true);
      service.initialize(mockWindow);

      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'checking-for-update')?.[1];
      handlerFn?.();

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('checkForUpdates', () => {
    it('should return current status on successful check', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;
      au.checkForUpdates = vi.fn().mockResolvedValue({});

      const result = await service.checkForUpdates();

      expect(au.checkForUpdates).toHaveBeenCalled();
      expect(result).toBe('not-available');
    });

    it('should return error status when check fails', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;
      au.checkForUpdates = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.checkForUpdates();

      expect(result).toBe('error');
    });
  });

  describe('downloadUpdate', () => {
    it('should not download when status is not available', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      // status is 'not-available' by default
      await service.downloadUpdate();

      expect(au.downloadUpdate).not.toHaveBeenCalled();
    });

    it('should download when status is available', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;
      au.downloadUpdate = vi.fn().mockResolvedValue([]);

      // Set status to 'available' via the event handler
      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-available')?.[1];
      handlerFn?.({ version: '2.0.0', releaseNotes: '', releaseDate: '' });

      await service.downloadUpdate();

      expect(au.downloadUpdate).toHaveBeenCalled();
    });

    it('should handle download errors gracefully', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;
      au.downloadUpdate = vi.fn().mockRejectedValue(new Error('Download failed'));

      // Set status to 'available'
      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-available')?.[1];
      handlerFn?.({ version: '2.0.0', releaseNotes: '', releaseDate: '' });

      // Should not throw
      await expect(service.downloadUpdate()).resolves.toBeUndefined();
    });
  });

  describe('installUpdate', () => {
    it('should not install when status is not downloaded', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      await service.installUpdate();

      expect(au.quitAndInstall).not.toHaveBeenCalled();
    });

    it('should quitAndInstall directly when window is destroyed', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-downloaded')?.[1];
      handlerFn?.({ version: '2.0.0' });

      mockWindow.isDestroyed = vi.fn(() => true);

      await service.installUpdate();

      expect(au.quitAndInstall).toHaveBeenCalled();
    });

    it('should quitAndInstall directly when mainWindow is null', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-downloaded')?.[1];
      handlerFn?.({ version: '2.0.0' });

      service.mainWindow = null;

      await service.installUpdate();

      expect(au.quitAndInstall).toHaveBeenCalled();
    });

    it('should show dialog and quitAndInstall when user chooses to restart', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;
      mockDialog.showMessageBox = vi.fn().mockResolvedValue({ response: 1 });

      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-downloaded')?.[1];
      handlerFn?.({ version: '2.0.0' });

      await service.installUpdate();

      expect(mockDialog.showMessageBox).toHaveBeenCalled();
      expect(au.quitAndInstall).toHaveBeenCalled();
    });

    it('should not quitAndInstall when user chooses later', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;
      mockDialog.showMessageBox = vi.fn().mockResolvedValue({ response: 0 });

      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-downloaded')?.[1];
      handlerFn?.({ version: '2.0.0' });

      await service.installUpdate();

      expect(mockDialog.showMessageBox).toHaveBeenCalled();
      expect(au.quitAndInstall).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return initial status', () => {
      const status = service.getStatus();
      expect(status.status).toBe('not-available');
      expect(status.version).toBeUndefined();
    });

    it('should return version after download', async () => {
      const updaterMod = await import('electron-updater');
      const au = updaterMod.autoUpdater;

      process.env.NODE_ENV = 'production';
      service.initialize(mockWindow);
      const handlerFn = au.on.mock.calls.find((c: string[]) => c[0] === 'update-downloaded')?.[1];
      handlerFn?.({ version: '3.0.0' });

      const status = service.getStatus();
      expect(status.status).toBe('downloaded');
      expect(status.version).toBe('3.0.0');
    });
  });
});
