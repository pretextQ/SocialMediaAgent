import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  installMatrixflowMock,
  removeMatrixflowMock,
} from '../../../mocks/window-matrixflow';
import { usePanelStore } from '@/renderer/stores/panel';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';

let mock: MatrixflowMock;

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

function makePanelData(overrides: Record<string, unknown> = {}) {
  return {
    id: 'panel-1',
    accountId: 'acc-1',
    platform: 'douyin',
    nickname: 'TestUser',
    ...overrides,
  };
}

describe('panel store', () => {
  describe('initial state', () => {
    it('starts with empty panels', () => {
      const store = usePanelStore();
      expect(store.panels).toEqual([]);
    });

    it('starts with empty availableAccounts', () => {
      const store = usePanelStore();
      expect(store.availableAccounts).toEqual([]);
    });

    it('starts with null focusedPanelId', () => {
      const store = usePanelStore();
      expect(store.focusedPanelId).toBeNull();
    });

    it('has maxPanels set to 10', () => {
      const store = usePanelStore();
      expect(store.maxPanels).toBe(10);
    });
  });

  describe('loadAvailableAccounts', () => {
    it('loads accounts from IPC', async () => {
      const accounts = [
        { id: 'acc-1', platform: 'douyin', nickname: 'User1' },
        { id: 'acc-2', platform: 'xiaohongshu', nickname: 'User2' },
      ];
      mock.accounts.list.mockResolvedValue(accounts);

      const store = usePanelStore();
      await store.loadAvailableAccounts();

      expect(store.availableAccounts).toEqual(accounts);
      expect(mock.accounts.list).toHaveBeenCalled();
    });

    it('sets empty array when IPC returns null', async () => {
      mock.accounts.list.mockResolvedValue(null);

      const store = usePanelStore();
      await store.loadAvailableAccounts();

      expect(store.availableAccounts).toEqual([]);
    });

    it('sets empty array when IPC throws', async () => {
      mock.accounts.list.mockRejectedValue(new Error('IPC failure'));

      const store = usePanelStore();
      await store.loadAvailableAccounts();

      expect(store.availableAccounts).toEqual([]);
    });
  });

  describe('openPanel', () => {
    it('opens panel and adds to list', async () => {
      const panelData = makePanelData();
      mock.panel.open.mockResolvedValue({
        success: true,
        data: panelData,
      });

      const store = usePanelStore();
      const result = await store.openPanel('acc-1');

      expect(result).toEqual({
        id: 'panel-1',
        accountId: 'acc-1',
        platform: 'douyin',
        nickname: 'TestUser',
      });
      expect(store.panels).toHaveLength(1);
      expect(store.panels[0].id).toBe('panel-1');
    });

    it('sets focusedPanelId to new panel', async () => {
      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData(),
      });

      const store = usePanelStore();
      await store.openPanel('acc-1');

      expect(store.focusedPanelId).toBe('panel-1');
    });

    it('returns null when panels count reaches maxPanels (10)', async () => {
      const store = usePanelStore();

      for (let i = 0; i < 10; i++) {
        mock.panel.open.mockResolvedValue({
          success: true,
          data: makePanelData({
            id: `panel-${i}`,
            accountId: `acc-${i}`,
          }),
        });
        await store.openPanel(`acc-${i}`);
      }

      expect(store.panels).toHaveLength(10);

      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData({ id: 'panel-11' }),
      });
      const result = await store.openPanel('acc-11');

      expect(result).toBeNull();
      expect(store.panels).toHaveLength(10);
      expect(mock.panel.open).toHaveBeenCalledTimes(10);
    });

    it('returns null when IPC result is not successful', async () => {
      mock.panel.open.mockResolvedValue({
        success: false,
        error: 'open failed',
      });

      const store = usePanelStore();
      const result = await store.openPanel('acc-1');

      expect(result).toBeNull();
      expect(store.panels).toHaveLength(0);
    });

    it('returns null when IPC result has no data', async () => {
      mock.panel.open.mockResolvedValue({ success: true });

      const store = usePanelStore();
      const result = await store.openPanel('acc-1');

      expect(result).toBeNull();
    });

    it('returns null when IPC throws', async () => {
      mock.panel.open.mockRejectedValue(new Error('IPC failure'));

      const store = usePanelStore();
      const result = await store.openPanel('acc-1');

      expect(result).toBeNull();
      expect(store.panels).toHaveLength(0);
    });
  });

  describe('closePanel', () => {
    it('removes panel from list', async () => {
      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData(),
      });

      const store = usePanelStore();
      await store.openPanel('acc-1');
      expect(store.panels).toHaveLength(1);

      mock.panel.close.mockResolvedValue({ success: true, data: null });
      await store.closePanel('panel-1');

      expect(store.panels).toHaveLength(0);
      expect(mock.panel.close).toHaveBeenCalledWith('panel-1');
    });

    it('resets focusedPanelId to first panel when closing focused panel', async () => {
      const store = usePanelStore();

      mock.panel.open.mockResolvedValueOnce({
        success: true,
        data: makePanelData({ id: 'panel-1' }),
      });
      mock.panel.open.mockResolvedValueOnce({
        success: true,
        data: makePanelData({ id: 'panel-2', accountId: 'acc-2' }),
      });

      await store.openPanel('acc-1');
      await store.openPanel('acc-2');
      expect(store.focusedPanelId).toBe('panel-2');

      mock.panel.close.mockResolvedValue({ success: true, data: null });
      await store.closePanel('panel-2');

      expect(store.focusedPanelId).toBe('panel-1');
    });

    it('sets focusedPanelId to null when closing last panel', async () => {
      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData(),
      });

      const store = usePanelStore();
      await store.openPanel('acc-1');

      mock.panel.close.mockResolvedValue({ success: true, data: null });
      await store.closePanel('panel-1');

      expect(store.focusedPanelId).toBeNull();
    });

    it('does not change focusedPanelId when closing non-focused panel', async () => {
      const store = usePanelStore();

      mock.panel.open.mockResolvedValueOnce({
        success: true,
        data: makePanelData({ id: 'panel-1' }),
      });
      mock.panel.open.mockResolvedValueOnce({
        success: true,
        data: makePanelData({ id: 'panel-2', accountId: 'acc-2' }),
      });

      await store.openPanel('acc-1');
      await store.openPanel('acc-2');
      expect(store.focusedPanelId).toBe('panel-2');

      mock.panel.close.mockResolvedValue({ success: true, data: null });
      await store.closePanel('panel-1');

      expect(store.focusedPanelId).toBe('panel-2');
    });

    it('handles IPC error gracefully', async () => {
      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData(),
      });

      const store = usePanelStore();
      await store.openPanel('acc-1');

      mock.panel.close.mockRejectedValue(new Error('IPC failure'));
      await store.closePanel('panel-1');

      expect(store.panels).toHaveLength(1);
    });
  });

  describe('focusPanel', () => {
    it('updates focusedPanelId', async () => {
      const store = usePanelStore();

      mock.panel.open.mockResolvedValueOnce({
        success: true,
        data: makePanelData({ id: 'panel-1' }),
      });
      mock.panel.open.mockResolvedValueOnce({
        success: true,
        data: makePanelData({ id: 'panel-2', accountId: 'acc-2' }),
      });

      await store.openPanel('acc-1');
      await store.openPanel('acc-2');

      mock.panel.focus.mockResolvedValue({ success: true, data: null });
      await store.focusPanel('panel-1');

      expect(store.focusedPanelId).toBe('panel-1');
      expect(mock.panel.focus).toHaveBeenCalledWith('panel-1');
    });

    it('handles IPC error gracefully', async () => {
      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData(),
      });

      const store = usePanelStore();
      await store.openPanel('acc-1');
      expect(store.focusedPanelId).toBe('panel-1');

      mock.panel.focus.mockRejectedValue(new Error('IPC failure'));
      await store.focusPanel('panel-1');

      expect(store.focusedPanelId).toBe('panel-1');
    });
  });

  describe('loadPanels', () => {
    it('loads panels from IPC and maps them', async () => {
      const panelData = [
        makePanelData({ id: 'panel-1' }),
        makePanelData({ id: 'panel-2', accountId: 'acc-2', nickname: 'User2' }),
      ];
      mock.panel.list.mockResolvedValue({ success: true, data: panelData });

      const store = usePanelStore();
      await store.loadPanels();

      expect(store.panels).toHaveLength(2);
      expect(store.panels[0]).toEqual({
        id: 'panel-1',
        accountId: 'acc-1',
        platform: 'douyin',
        nickname: 'TestUser',
      });
      expect(store.panels[1]).toEqual({
        id: 'panel-2',
        accountId: 'acc-2',
        platform: 'douyin',
        nickname: 'User2',
      });
    });

    it('sets focusedPanelId to first panel when panels exist', async () => {
      mock.panel.list.mockResolvedValue({
        success: true,
        data: [makePanelData()],
      });

      const store = usePanelStore();
      await store.loadPanels();

      expect(store.focusedPanelId).toBe('panel-1');
    });

    it('does not set focusedPanelId when no panels', async () => {
      mock.panel.list.mockResolvedValue({ success: true, data: [] });

      const store = usePanelStore();
      await store.loadPanels();

      expect(store.focusedPanelId).toBeNull();
    });

    it('handles IPC error gracefully', async () => {
      mock.panel.list.mockRejectedValue(new Error('IPC failure'));

      const store = usePanelStore();
      await store.loadPanels();

      expect(store.panels).toEqual([]);
    });

    it('handles unsuccessful result gracefully', async () => {
      mock.panel.list.mockResolvedValue({ success: false, error: 'failed' });

      const store = usePanelStore();
      await store.loadPanels();

      expect(store.panels).toEqual([]);
    });
  });

  describe('window.matrixflow undefined', () => {
    it('loadAvailableAccounts handles undefined window.matrixflow gracefully', async () => {
      removeMatrixflowMock();
      const store = usePanelStore();
      await store.loadAvailableAccounts();
      expect(store.availableAccounts).toEqual([]);
    });

    it('openPanel handles undefined window.matrixflow gracefully', async () => {
      removeMatrixflowMock();
      const store = usePanelStore();
      const result = await store.openPanel('acc-1');
      expect(result).toBeNull();
    });

    it('closePanel handles undefined window.matrixflow gracefully', async () => {
      removeMatrixflowMock();
      const store = usePanelStore();
      await store.closePanel('panel-1');
      expect(store.panels).toEqual([]);
    });

    it('focusPanel handles undefined window.matrixflow gracefully', async () => {
      removeMatrixflowMock();
      const store = usePanelStore();
      await store.focusPanel('panel-1');
      expect(store.focusedPanelId).toBeNull();
    });

    it('loadPanels handles undefined window.matrixflow gracefully', async () => {
      removeMatrixflowMock();
      const store = usePanelStore();
      await store.loadPanels();
      expect(store.panels).toEqual([]);
    });
  });

  describe('panel count limit enforcement', () => {
    it('allows opening exactly maxPanels (10) panels', async () => {
      const store = usePanelStore();

      for (let i = 0; i < 10; i++) {
        mock.panel.open.mockResolvedValue({
          success: true,
          data: makePanelData({
            id: `panel-${i}`,
            accountId: `acc-${i}`,
          }),
        });
        const result = await store.openPanel(`acc-${i}`);
        expect(result).not.toBeNull();
      }

      expect(store.panels).toHaveLength(10);
    });

    it('rejects opening panel at maxPanels + 1', async () => {
      const store = usePanelStore();

      for (let i = 0; i < 10; i++) {
        mock.panel.open.mockResolvedValue({
          success: true,
          data: makePanelData({
            id: `panel-${i}`,
            accountId: `acc-${i}`,
          }),
        });
        await store.openPanel(`acc-${i}`);
      }

      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData({ id: 'panel-extra' }),
      });
      const result = await store.openPanel('acc-extra');

      expect(result).toBeNull();
      expect(store.panels).toHaveLength(10);
    });

    it('allows opening after closing a panel', async () => {
      const store = usePanelStore();

      for (let i = 0; i < 10; i++) {
        mock.panel.open.mockResolvedValue({
          success: true,
          data: makePanelData({
            id: `panel-${i}`,
            accountId: `acc-${i}`,
          }),
        });
        await store.openPanel(`acc-${i}`);
      }

      mock.panel.close.mockResolvedValue({ success: true, data: null });
      await store.closePanel('panel-0');

      mock.panel.open.mockResolvedValue({
        success: true,
        data: makePanelData({ id: 'panel-new' }),
      });
      const result = await store.openPanel('acc-new');

      expect(result).not.toBeNull();
      expect(store.panels).toHaveLength(10);
    });
  });
});
