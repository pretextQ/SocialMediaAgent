<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import { ElMessage } from 'element-plus';
import { usePanelStore } from '@/stores/panel';
import PanelSidebar from '@/renderer/components/panel/PanelSidebar.vue';
import BrowserTabs from '@/renderer/components/panel/BrowserTabs.vue';
import BrowserContent from '@/renderer/components/panel/BrowserContent.vue';

const router = useRouter();
const panelStore = usePanelStore();

const activePanels = computed(() => panelStore.panels);
const activePanelId = computed(() => panelStore.focusedPanelId);
const activePanel = computed(() =>
  activePanels.value.find(p => p.id === activePanelId.value) || null
);

onMounted(async () => {
  await panelStore.loadAvailableAccounts();
  await panelStore.loadPanels();
  await panelStore.showAllPanels();
});

onBeforeRouteLeave(async (_to, _from, next) => {
  await panelStore.hideAllPanels();
  next();
});

async function handleSelectAccount(accountId: string) {
  const result = await panelStore.openPanel(accountId);
  if (result) {
    ElMessage.success(`已打开 ${result.nickname} 的工作区`);
  } else if (panelStore.panels.length >= panelStore.maxPanels) {
    ElMessage.warning(`最多同时打开 ${panelStore.maxPanels} 个工作区`);
  }
}

function handleCloseTab(panelId: string) {
  panelStore.closePanel(panelId);
}

function handleCloseAllTabs() {
  panelStore.panels.forEach(p => panelStore.closePanel(p.id));
}

function handleSelectTab(panelId: string) {
  panelStore.focusPanel(panelId);
}

function handleReorder(fromId: string, toId: string) {
  const panels = panelStore.panels;
  const fromIdx = panels.findIndex(p => p.id === fromId);
  const toIdx = panels.findIndex(p => p.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = panels.splice(fromIdx, 1);
  panels.splice(toIdx, 0, moved);
}

function handleRefresh() {
  // 刷新账号列表
  panelStore.loadAvailableAccounts();

  // 刷新所有内嵌浏览器标签页
  const panelApi = (window as any).matrixflow?.panel;
  if (!panelApi) return;

  panelStore.panels.forEach(panel => {
    if (panel.browser_mode === 'embedded' || !panel.browser_mode) {
      panelApi.navigate(panel.id, 'refresh');
    }
  });
}

function handleAddAccount() {
  router.push({ name: 'Accounts', query: { action: 'add' } });
}
</script>

<template>
  <div class="multi-panel-view">
    <PanelSidebar
      :accounts="panelStore.availableAccounts"
      :active-panel-ids="panelStore.panels.map(p => p.accountId)"
      :loading="false"
      @refresh="handleRefresh"
      @add-account="handleAddAccount"
      @select-account="handleSelectAccount"
    />

    <div class="workspace">
      <template v-if="activePanels.length > 0">
        <BrowserTabs
          :panels="activePanels"
          :active-panel-id="activePanelId"
          @select="handleSelectTab"
          @close="handleCloseTab"
          @close-all="handleCloseAllTabs"
          @reorder="handleReorder"
        />

        <BrowserContent
          :panel="activePanel"
          @close="handleCloseTab"
        />
      </template>

      <template v-else>
        <div class="workspace__empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <h3 class="workspace__empty-title">选择账号开始矩阵管理</h3>
          <p class="workspace__empty-hint">从左侧面板选择账号，打开创作者中心</p>
          <div class="workspace__empty-features">
            <div class="workspace__feature">
              <span class="workspace__feature-dot" />
              <span>支持抖音、小红书、视频号、快手、B站等平台</span>
            </div>
            <div class="workspace__feature">
              <span class="workspace__feature-dot" />
              <span>内嵌浏览器与外部浏览器自由切换</span>
            </div>
            <div class="workspace__feature">
              <span class="workspace__feature-dot" />
              <span>最多同时管理 10 个账号工作区</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.multi-panel-view {
  display: flex;
  height: 100%;
  background: transparent;
}

.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: transparent;
}

.workspace__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  text-align: center;
  background: var(--color-workspace-bg);
}

.workspace__empty-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-workspace-text);
  margin: 16px 0 8px;
  font-family: 'Inter', -apple-system, 'PingFang SC', sans-serif;
}

.workspace__empty-hint {
  font-size: 14px;
  color: var(--color-workspace-text-muted);
  margin: 0 0 24px;
  font-family: 'Inter', -apple-system, 'PingFang SC', sans-serif;
}

.workspace__empty-features {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 320px;
}

.workspace__feature {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--color-workspace-text-muted);
  font-family: 'Inter', -apple-system, 'PingFang SC', sans-serif;
}

.workspace__feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-workspace-active);
  flex-shrink: 0;
}
</style>
