<script setup lang="ts">
import { ref, computed } from 'vue';

interface Panel {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  avatar?: string;
  browser_mode?: 'embedded' | 'external_chrome' | 'external_fingerprint';
  pinned?: boolean;
}

interface Props {
  panels: Panel[];
  activePanelId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [panelId: string];
  close: [panelId: string];
  closeAll: [];
  reorder: [fromId: string, toId: string];
}>();

// 拖拽状态
const draggedId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

// 平台配置 - 硬编码颜色
const platformConfig: Record<string, { label: string; color: string }> = {
  douyin: { label: '抖音', color: '#161823' },
  xiaohongshu: { label: '小红书', color: '#FE2C55' },
  channels: { label: '视频号', color: '#07C160' },
  kuaishou: { label: '快手', color: '#FF4906' },
  bilibili: { label: 'B站', color: '#00A1D6' },
};

function getPlatformConfig(platform: string) {
  return platformConfig[platform as keyof typeof platformConfig] || { label: platform, color: '#64748b' };
}

function getInitial(name: string) {
  return name ? name.charAt(0).toUpperCase() : '?';
}

function handleTabClick(panelId: string) {
  emit('select', panelId);
}

function handleCloseClick(e: Event, panelId: string) {
  e.stopPropagation();
  emit('close', panelId);
}

function handleDragStart(e: DragEvent, panelId: string) {
  draggedId.value = panelId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', panelId);
  }
}

function handleDragOver(e: DragEvent, panelId: string) {
  e.preventDefault();
  if (draggedId.value && draggedId.value !== panelId) {
    dragOverId.value = panelId;
  }
}

function handleDragLeave() {
  dragOverId.value = null;
}

function handleDrop(e: DragEvent, targetId: string) {
  e.preventDefault();
  const sourceId = draggedId.value;
  if (sourceId && sourceId !== targetId) {
    emit('reorder', sourceId, targetId);
  }
  draggedId.value = null;
  dragOverId.value = null;
}

function handleDragEnd() {
  draggedId.value = null;
  dragOverId.value = null;
}
</script>

<template>
  <div class="browser-tabs">
    <!-- macOS 窗口控制按钮 (装饰) -->
    <div class="browser-tabs__traffic-lights">
      <span class="traffic-light traffic-light--red"></span>
      <span class="traffic-light traffic-light--yellow"></span>
      <span class="traffic-light traffic-light--green"></span>
    </div>

    <!-- 标签列表 -->
    <div class="browser-tabs__list">
      <div
        v-for="panel in panels"
        :key="panel.id"
        class="browser-tab"
        :class="{
          'browser-tab--active': panel.id === activePanelId,
          'browser-tab--drag-over': dragOverId === panel.id,
          'browser-tab--dragging': draggedId === panel.id,
          'browser-tab--pinned': panel.pinned,
        }"
        draggable="true"
        @click="handleTabClick(panel.id)"
        @dragstart="handleDragStart($event, panel.id)"
        @dragover="handleDragOver($event, panel.id)"
        @dragleave="handleDragLeave"
        @drop="handleDrop($event, panel.id)"
        @dragend="handleDragEnd"
      >
        <!-- 平台指示点 -->
        <span
          class="browser-tab__platform-dot"
          :style="{ background: getPlatformConfig(panel.platform).color }"
        ></span>

        <!-- 头像/首字母 -->
        <span
          class="browser-tab__avatar"
          :style="{ borderColor: getPlatformConfig(panel.platform).color }"
        >
          <img v-if="panel.avatar" :src="panel.avatar" class="browser-tab__avatar-img" />
          <span v-else class="browser-tab__avatar-init">{{ getInitial(panel.nickname) }}</span>
        </span>

        <!-- 昵称 -->
        <span class="browser-tab__name">{{ panel.nickname }}</span>

        <!-- 关闭按钮 -->
        <button
          class="browser-tab__close"
          @click="handleCloseClick($event, panel.id)"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="browser-tabs__actions">
      <!-- 新建标签 -->
      <button class="browser-tabs__action-btn" title="新建标签">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- 关闭全部 -->
      <button
        v-if="panels.length > 1"
        class="browser-tabs__action-btn browser-tabs__action-btn--danger"
        title="关闭全部"
        @click="emit('closeAll')"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 4H12M5 4V3C5 2.44772 5.44772 2 6 2H8C8.55228 2 9 2.44772 9 3V4M5 7V11M9 7V11M3 4L4 12C4 12.5523 4.44772 13 5 13H9C9.55228 13 10 12.5523 10 12L11 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.browser-tabs {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--color-workspace-surface);
  padding: 0 8px;
  gap: 8px;
  position: relative;
  z-index: var(--z-tabbar);
}

/* ── macOS 窗口控制灯 ── */
.browser-tabs__traffic-lights {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 16px;
  flex-shrink: 0;
}

.traffic-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.traffic-light--red {
  background: #ff5f57;
}

.traffic-light--yellow {
  background: #ffbd2e;
}

.traffic-light--green {
  background: #28c840;
}

/* ── 标签列表 ── */
.browser-tabs__list {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  height: 100%;
  padding: 4px 0;
}

.browser-tabs__list::-webkit-scrollbar {
  height: 0;
}

.browser-tabs__list::-webkit-scrollbar-track {
  display: none;
}

.browser-tabs__list::-webkit-scrollbar-thumb {
  display: none;
}

/* ── 标签项 ── */
.browser-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  max-width: 180px;
  padding: 0 12px;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: background 150ms ease;
  flex-shrink: 0;
  position: relative;
  background: transparent;
}

.browser-tab:hover {
  background: var(--color-workspace-hover);
}

.browser-tab--active {
  background: var(--color-workspace-bg);
  border-bottom: 2px solid var(--color-workspace-active);
}

.browser-tab--drag-over {
  border-left: 2px solid var(--color-workspace-active);
  padding-left: 10px;
}

.browser-tab--dragging {
  opacity: 0.4;
}

/* ── 平台指示点 ── */
.browser-tab__platform-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── 头像/首字母 ── */
.browser-tab__avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid;
  background: var(--color-workspace-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.browser-tab__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.browser-tab__avatar-init {
  font-size: 10px;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1;
}

/* ── 昵称 ── */
.browser-tab__name {
  font-size: 12px;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.browser-tab--active .browser-tab__name {
  color: var(--color-workspace-text);
}

/* ── 关闭按钮 ── */
.browser-tab__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-workspace-text-secondary);
  opacity: 0;
  transition: all 150ms ease;
  flex-shrink: 0;
}

.browser-tab:hover .browser-tab__close {
  opacity: 1;
}

.browser-tab__close:hover {
  background: #ef4444;
  color: white;
}

/* ── 操作区 ── */
.browser-tabs__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.browser-tabs__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-workspace-text-muted);
  transition: all 150ms ease;
}

.browser-tabs__action-btn:hover {
  background: var(--color-workspace-hover);
  color: var(--color-workspace-active);
}

.browser-tabs__action-btn--danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
</style>
