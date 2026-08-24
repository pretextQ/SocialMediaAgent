<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import WorkspaceToolbar from './WorkspaceToolbar.vue';

interface Panel {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode?: 'embedded' | 'external_chrome' | 'external_fingerprint';
}

interface Props {
  panel: Panel | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [panelId: string];
}>();

const currentUrl = ref('');
const isLoading = ref(false);
const canGoBack = ref(false);
const canGoForward = ref(false);

const isEmbedded = computed(() => {
  return props.panel?.browser_mode === 'embedded' || props.panel?.browser_mode === undefined;
});

const panelApi = (window as any).matrixflow?.panel;

function handleToolbarBack() {
  if (props.panel && panelApi) panelApi.navigate(props.panel.id, 'back');
}

function handleToolbarForward() {
  if (props.panel && panelApi) panelApi.navigate(props.panel.id, 'forward');
}

function handleToolbarRefresh() {
  if (props.panel && panelApi) panelApi.navigate(props.panel.id, 'refresh');
}

function handleToolbarDevTools() {
  if (props.panel && panelApi) panelApi.openDevTools(props.panel.id);
}

function handleToolbarNavigate(url: string) {
  if (!url || !props.panel || !panelApi) return;
  const finalUrl = url.startsWith('http') ? url : `https://${url}`;
  panelApi.navigate(props.panel.id, 'url', finalUrl);
}

function handleClose() {
  if (props.panel) emit('close', props.panel.id);
}

function onUrlChange(panelId: string, url: string) {
  if (panelId === props.panel?.accountId || panelId === props.panel?.id) {
    currentUrl.value = url;
  }
}

function onNavigationState(panelId: string, back: boolean, forward: boolean) {
  if (panelId === props.panel?.accountId || panelId === props.panel?.id) {
    canGoBack.value = back;
    canGoForward.value = forward;
  }
}

function onLoadingState(panelId: string, loading: boolean) {
  if (panelId === props.panel?.accountId || panelId === props.panel?.id) {
    isLoading.value = loading;
  }
}

onMounted(() => {
  if (panelApi) {
    panelApi.onUrlChange(onUrlChange);
    panelApi.onNavigationState(onNavigationState);
    panelApi.onLoadingState(onLoadingState);
  }
});
</script>

<template>
  <div class="browser-content">
    <template v-if="isEmbedded">
      <WorkspaceToolbar
        :can-go-back="canGoBack"
        :can-go-forward="canGoForward"
        :is-loading="isLoading"
        :current-url="currentUrl"
        @back="handleToolbarBack"
        @forward="handleToolbarForward"
        @refresh="handleToolbarRefresh"
        @open-devtools="handleToolbarDevTools"
        @navigate="handleToolbarNavigate"
      />

      <div class="browser-content__viewport">
        <div class="browser-content__placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <p>WebView 内容区域</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="browser-content__external">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="1.5">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        <h3 class="external-title">已在外部浏览器打开</h3>
        <p class="external-hint">
          {{ panel?.nickname }} 的创作者中心已在独立浏览器窗口中打开
        </p>
        <span class="external-tag">
          {{ panel?.browser_mode === 'external_chrome' ? 'Chrome 浏览器' : '指纹浏览器' }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.browser-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.browser-content__viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.browser-content__viewport > * {
  pointer-events: auto;
}

.browser-content__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-workspace-text-muted);
  font-size: 13px;
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--color-workspace-bg);
  transition: opacity 0.3s ease;
}

.browser-content__external {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  text-align: center;
  background: var(--color-workspace-bg);
  gap: 16px;
}

.external-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-workspace-text);
  font-family: 'Inter', -apple-system, sans-serif;
}

.external-hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-workspace-text-secondary);
  max-width: 400px;
  font-family: 'Inter', -apple-system, sans-serif;
}

.external-tag {
  font-size: 12px;
  color: var(--color-workspace-text-secondary);
  padding: 4px 12px;
  border: 1px solid var(--color-workspace-border);
  border-radius: 6px;
  font-family: 'Inter', -apple-system, sans-serif;
}
</style>
