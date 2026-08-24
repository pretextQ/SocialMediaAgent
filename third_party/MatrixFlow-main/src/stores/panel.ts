import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type BrowserMode = 'embedded' | 'external_chrome' | 'external_fingerprint';

interface PanelInfo {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  avatar?: string;
  browser_mode?: BrowserMode;
}

interface Account {
  id: string;
  platform: string;
  nickname?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'expired';
  browser_mode?: BrowserMode;
  cookieValid?: boolean;
  groupId?: string;
  groupIds?: string[];
  groupInfos?: Array<{ id: string; name: string; color: string }>;
}

export const usePanelStore = defineStore('panel', () => {
  const panels = ref<PanelInfo[]>([]);
  const availableAccounts = ref<Account[]>([]);
  const focusedPanelId = ref<string | null>(null);
  const loading = ref(false);
  const maxPanels = 10;

  function getAccountBrowserType(account: Account): BrowserMode {
    return account.browser_mode ?? 'embedded';
  }

  function isExternalBrowser(account: Account): boolean {
    return getAccountBrowserType(account) !== 'embedded';
  }

  const openedAccountIds = computed(() => panels.value.map(p => p.accountId));

  const accountsByPlatform = computed(() => {
    const groups: Record<string, Account[]> = {
      douyin: [],
      xiaohongshu: [],
      kuaishou: [],
      bilibili: [],
      channels: [],
    };

    availableAccounts.value.forEach((account) => {
      if (groups[account.platform]) {
        groups[account.platform].push(account);
      }
    });

    return groups;
  });

  async function loadAvailableAccounts() {
    loading.value = true;
    try {
      const accounts = await window.matrixflow.accounts.list();
      availableAccounts.value = accounts || [];
    } catch (error) {
      console.error('加载账号列表失败:', error);
      availableAccounts.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function openPanel(accountId: string): Promise<PanelInfo | null> {
    if (panels.value.length >= maxPanels) {
      return null;
    }

    const existing = panels.value.find(p => p.accountId === accountId);
    if (existing) {
      focusedPanelId.value = existing.id;
      return existing;
    }

    const account = availableAccounts.value.find(a => a.id === accountId);
    const browserMode = account ? getAccountBrowserType(account) : 'embedded';

    try {
      const result = await window.matrixflow.panel.open(accountId);

      if (result.success && result.data) {
        const panel: PanelInfo = {
          id: result.data.id,
          accountId: result.data.accountId,
          platform: result.data.platform,
          nickname: result.data.nickname,
          avatar: account?.avatar,
          browser_mode: browserMode,
        };
        panels.value.push(panel);
        focusedPanelId.value = panel.id;
        return panel;
      }
      return null;
    } catch (error) {
      console.error('打开面板失败:', error);
      return null;
    }
  }

  async function closePanel(panelId: string) {
    try {
      await window.matrixflow.panel.close(panelId);

      panels.value = panels.value.filter(p => p.id !== panelId);
      if (focusedPanelId.value === panelId) {
        focusedPanelId.value = panels.value.length > 0 ? panels.value[0].id : null;
      }
    } catch (error) {
      console.error('关闭面板失败:', error);
    }
  }

  async function closeAllPanels() {
    for (const panel of panels.value) {
      await closePanel(panel.id);
    }
  }

  async function focusPanel(panelId: string) {
    try {
      const panel = panels.value.find(p => p.id === panelId);

      if (panel?.browser_mode === 'embedded') {
        await window.matrixflow.panel.focus(panelId);
      }

      focusedPanelId.value = panelId;
    } catch (error) {
      console.error('聚焦面板失败:', error);
    }
  }

  async function loadPanels() {
    loading.value = true;
    try {
      const result = await window.matrixflow.panel.list();
      if (result.success && result.data) {
        panels.value = result.data.map((p: any) => ({
          id: p.id,
          accountId: p.accountId,
          platform: p.platform,
          nickname: p.nickname,
          browser_mode: p.browser_mode ?? 'embedded',
        }));
        if (panels.value.length > 0) {
          focusedPanelId.value = panels.value[0].id;
        }
      }
    } catch (error) {
      console.error('加载面板列表失败:', error);
    } finally {
      loading.value = false;
    }
  }

  async function hideAllPanels() {
    if (!window.matrixflow) return;
    try {
      await window.matrixflow.panel.hideAll();
    } catch (error) {
      console.error('隐藏面板失败:', error);
    }
  }

  async function showAllPanels() {
    if (!window.matrixflow) return;
    try {
      await window.matrixflow.panel.showAll();
    } catch (error) {
      console.error('显示面板失败:', error);
    }
  }

  return {
    panels,
    availableAccounts,
    focusedPanelId,
    loading,
    maxPanels,
    openedAccountIds,
    accountsByPlatform,
    getAccountBrowserType,
    isExternalBrowser,
    loadAvailableAccounts,
    openPanel,
    closePanel,
    closeAllPanels,
    focusPanel,
    loadPanels,
    hideAllPanels,
    showAllPanels,
  };
});
