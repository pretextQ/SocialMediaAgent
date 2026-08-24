import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';
import type { AppSettings } from '@/renderer/stores/settings';
import { useSettingsStore } from '@/renderer/stores/settings';

describe('useSettingsStore', () => {
  let mock: MatrixflowMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    mock = installMatrixflowMock();
  });

  afterEach(() => {
    removeMatrixflowMock();
  });

  describe('state', () => {
    it('initializes with default settings', () => {
      const store = useSettingsStore();
      expect(store.settings.theme).toBe('light');
      expect(store.settings.language).toBe('zh-CN');
      expect(store.settings.concurrentTasks).toBe(3);
      expect(store.settings.retryLimit).toBe(3);
      expect(store.settings.autoCheckCookie).toBe(true);
      expect(store.settings.cookieCheckInterval).toBe(60);
      expect(store.settings.proxyEnabled).toBe(false);
      expect(store.settings.proxyUrl).toBe('');
      expect(store.settings.notificationEnabled).toBe(true);
      expect(store.settings.browserMode).toBe('embedded');
      expect(store.loading).toBe(false);
    });
  });

  describe('actions', () => {
    describe('fetchSettings', () => {
      it('reads all keys via settings.get and populates state', async () => {
        mock.settings.get.mockImplementation(async (key: string) => {
          const overrides: Record<string, unknown> = {
            theme: 'dark',
            language: 'en-US',
            concurrentTasks: 5,
          };
          return overrides[key] ?? null;
        });

        const store = useSettingsStore();
        await store.fetchSettings();

        expect(mock.settings.get).toHaveBeenCalledTimes(18);
        expect(store.settings.theme).toBe('dark');
        expect(store.settings.language).toBe('en-US');
        expect(store.settings.concurrentTasks).toBe(5);
      });

      it('applies default values when IPC returns null', async () => {
        mock.settings.get.mockResolvedValue(null);

        const store = useSettingsStore();
        await store.fetchSettings();

        expect(store.settings.theme).toBe('light');
        expect(store.settings.concurrentTasks).toBe(3);
        expect(store.settings.autoCheckCookie).toBe(true);
      });

      it('sets loading=true during fetch and loading=false after', async () => {
        let loadingDuringCall = false;
        mock.settings.get.mockImplementation(async () => {
          const store = useSettingsStore();
          loadingDuringCall = store.loading;
          return null;
        });

        const store = useSettingsStore();
        await store.fetchSettings();

        expect(loadingDuringCall).toBe(true);
        expect(store.loading).toBe(false);
      });

      it('resets loading to false even on error', async () => {
        mock.settings.get.mockRejectedValue(new Error('IPC fail'));

        const store = useSettingsStore();
        await expect(store.fetchSettings()).rejects.toThrow('IPC fail');

        expect(store.loading).toBe(false);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useSettingsStore();
        await store.fetchSettings();

        expect(store.settings.theme).toBe('light');
      });
    });

    describe('updateSetting', () => {
      it('calls settings.set and updates local state', async () => {
        mock.settings.set.mockResolvedValue({ success: true });

        const store = useSettingsStore();
        await store.updateSetting('theme', 'dark');

        expect(mock.settings.set).toHaveBeenCalledWith('theme', 'dark');
        expect(store.settings.theme).toBe('dark');
      });

      it('updates numeric settings', async () => {
        mock.settings.set.mockResolvedValue({ success: true });

        const store = useSettingsStore();
        await store.updateSetting('concurrentTasks', 10);

        expect(mock.settings.set).toHaveBeenCalledWith('concurrentTasks', 10);
        expect(store.settings.concurrentTasks).toBe(10);
      });

      it('updates boolean settings', async () => {
        mock.settings.set.mockResolvedValue({ success: true });

        const store = useSettingsStore();
        await store.updateSetting('proxyEnabled', true);

        expect(mock.settings.set).toHaveBeenCalledWith('proxyEnabled', true);
        expect(store.settings.proxyEnabled).toBe(true);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useSettingsStore();
        await store.updateSetting('theme', 'dark');

        expect(store.settings.theme).toBe('light');
      });
    });

    describe('updateSettings (batch)', () => {
      it('calls settings.set for each key and updates local state', async () => {
        mock.settings.set.mockResolvedValue({ success: true });

        const store = useSettingsStore();
        const patch: Partial<AppSettings> = {
          theme: 'dark',
          concurrentTasks: 7,
          proxyEnabled: true,
        };
        await store.updateSettings(patch);

        expect(mock.settings.set).toHaveBeenCalledTimes(3);
        expect(mock.settings.set).toHaveBeenCalledWith('theme', 'dark');
        expect(mock.settings.set).toHaveBeenCalledWith('concurrentTasks', 7);
        expect(mock.settings.set).toHaveBeenCalledWith('proxyEnabled', true);
        expect(store.settings.theme).toBe('dark');
        expect(store.settings.concurrentTasks).toBe(7);
        expect(store.settings.proxyEnabled).toBe(true);
      });

      it('handles empty patch', async () => {
        const store = useSettingsStore();
        await store.updateSettings({});

        expect(mock.settings.set).not.toHaveBeenCalled();
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useSettingsStore();
        await store.updateSettings({ theme: 'dark' });

        expect(store.settings.theme).toBe('light');
      });
    });

    describe('resetToDefault', () => {
      it('resets all settings to default values', async () => {
        const store = useSettingsStore();
        store.settings.theme = 'dark';
        store.settings.concurrentTasks = 99;
        store.settings.proxyEnabled = true;
        store.settings.language = 'en-US';

        store.resetToDefault();

        expect(store.settings.theme).toBe('light');
        expect(store.settings.concurrentTasks).toBe(3);
        expect(store.settings.proxyEnabled).toBe(false);
        expect(store.settings.language).toBe('zh-CN');
        expect(store.settings.autoCheckCookie).toBe(true);
        expect(store.settings.cookieCheckInterval).toBe(60);
        expect(store.settings.retryLimit).toBe(3);
      });

      it('does not return a promise (synchronous)', () => {
        const store = useSettingsStore();
        const result = store.resetToDefault();
        expect(result).toBeUndefined();
      });
    });
  });
});
