<template>
  <Teleport to="body">
    <Transition name="preview-fade">
      <div
        v-if="visible && material"
        class="preview-overlay"
        @click.self="handleClose"
      >
        <div class="preview-shell">
          <button class="preview-close" @click="handleClose" aria-label="关闭">
            <el-icon :size="18"><Close /></el-icon>
          </button>

          <div class="preview-stage">
            <button
              class="preview-arrow"
              :class="{ 'preview-arrow--hidden': !hasPrev }"
              :disabled="!hasPrev"
              @click="hasPrev && emit('navigate', currentIndex - 1)"
              aria-label="上一个"
            >
              <el-icon :size="22"><ArrowLeft /></el-icon>
            </button>

            <div class="preview-viewport">
              <img
                v-if="material.type === 'image'"
                :src="`local-file://${material.filePath}`"
                class="preview-asset preview-asset--image"
                @error="handleMediaError"
              />
              <video
                v-else-if="material.type === 'video'"
                :key="material.id"
                :src="`local-file://${material.filePath}`"
                class="preview-asset preview-asset--video"
                controls
                @error="handleMediaError"
              />
              <div v-else class="preview-unsupported">
                <el-icon :size="48"><Document /></el-icon>
                <span>暂不支持预览此文件类型</span>
              </div>
            </div>

            <button
              class="preview-arrow"
              :class="{ 'preview-arrow--hidden': !hasNext }"
              :disabled="!hasNext"
              @click="hasNext && emit('navigate', currentIndex + 1)"
              aria-label="下一个"
            >
              <el-icon :size="22"><ArrowRight /></el-icon>
            </button>
          </div>

          <div class="preview-divider" />

          <div class="preview-sidebar">
            <div class="preview-sidebar__inner">
              <div class="preview-sidebar__title">
                <h3>{{ material.title }}</h3>
                <span v-if="total > 0" class="preview-sidebar__counter">{{ currentIndex + 1 }} / {{ total }}</span>
              </div>

              <div class="preview-sidebar__badges">
                <span class="preview-badge">
                  <el-icon v-if="material.type === 'image'" :size="13"><Picture /></el-icon>
                  <el-icon v-else :size="13"><VideoCamera /></el-icon>
                  {{ material.type === 'image' ? '图片' : '视频' }}
                </span>
                <span v-if="material.platform" class="preview-badge">{{ material.platform }}</span>
              </div>

              <div class="preview-sidebar__meta">
                <div class="preview-meta-row">
                  <span class="preview-meta-row__label">文件大小</span>
                  <span class="preview-meta-row__value">{{ formatFileSize(material.fileSize) }}</span>
                </div>
                <div class="preview-meta-row">
                  <span class="preview-meta-row__label">上传时间</span>
                  <span class="preview-meta-row__value">{{ formatDate(material.createdAt) }}</span>
                </div>
              </div>

              <div v-if="material.description" class="preview-sidebar__desc">
                <p>{{ material.description }}</p>
              </div>

              <div class="preview-sidebar__path" :title="material.filePath" @click="handleOpenFolder">
                <el-icon :size="13"><FolderOpened /></el-icon>
                <span>{{ material.filePath }}</span>
                <el-icon :size="11"><Right /></el-icon>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import {
  Close, Picture, VideoCamera, Document, FolderOpened, Right,
  ArrowLeft, ArrowRight,
} from '@element-plus/icons-vue';
import type { Material } from '../../stores/materials';

const props = defineProps<{
  visible: boolean;
  material: Material | null;
  materials: Material[];
  currentIndex: number;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  error: [error: Error];
  navigate: [index: number];
}>();

const total = computed(() => props.materials.length);
const hasPrev = computed(() => props.currentIndex > 0);
const hasNext = computed(() => props.currentIndex < total.value - 1);

function handleClose() {
  emit('update:visible', false);
}

function handleMediaError(e: Event) {
  emit('error', new Error('媒体文件加载失败'));
  console.error('Media load error:', e);
}

async function handleOpenFolder() {
  if (!props.material?.filePath) return;
  try {
    await window.matrixflow.material.openInFolder(props.material.filePath);
  } catch {
    console.error('打开文件夹失败');
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${d}日 ${h}:${min}`;
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === 'Escape') {
    handleClose();
  } else if (e.key === 'ArrowLeft' && hasPrev.value) {
    emit('navigate', props.currentIndex - 1);
  } else if (e.key === 'ArrowRight' && hasNext.value) {
    emit('navigate', props.currentIndex + 1);
  }
}

watch(() => props.visible, (val) => {
  document.body.style.overflow = val ? 'hidden' : '';
});

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
</script>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.92);
}

.preview-shell {
  position: relative;
  width: calc(100% - 80px);
  max-width: 1440px;
  height: calc(100vh - 64px);
  display: flex;
  border-radius: var(--radius-xl);
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.preview-close {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 20;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  color: #e2e8f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.preview-close:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: scale(1.05);
}

.preview-close:active {
  transform: scale(0.95);
}

.preview-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.preview-arrow {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(226, 232, 240, 0.45);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 var(--space-3);
  transition: color var(--transition-fast), background var(--transition-fast), transform var(--transition-fast);
}

.preview-arrow:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.14);
  transform: scale(1.08);
}

.preview-arrow:active {
  transform: scale(0.95);
}

.preview-arrow--hidden {
  visibility: hidden;
  pointer-events: none;
}

.preview-viewport {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.preview-asset {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.preview-asset--image {
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.preview-asset--video {
  width: 100%;
  height: 100%;
}

.preview-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  color: #94a3b8;
}

.preview-divider {
  width: 1px;
  flex-shrink: 0;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(255, 255, 255, 0.08) 20%,
    rgba(255, 255, 255, 0.08) 80%,
    transparent
  );
}

.preview-sidebar {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
}

.preview-sidebar__inner {
  padding: var(--space-8) var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.preview-sidebar__title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-sidebar__title h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: #f1f5f9;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.preview-sidebar__counter {
  font-size: var(--font-size-xs);
  color: #475569;
  letter-spacing: 0.02em;
}

.preview-sidebar__badges {
  display: flex;
  gap: var(--space-2);
}

.preview-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  background: rgba(37, 99, 235, 0.15);
  color: #60a5fa;
}

.preview-sidebar__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-meta-row__label {
  font-size: var(--font-size-sm);
  color: #64748b;
}

.preview-meta-row__value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: #e2e8f0;
}

.preview-sidebar__desc {
  padding-top: var(--space-4);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-sidebar__desc p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: #cbd5e1;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
}

.preview-sidebar__path {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-6) var(--space-6);
  margin: 0 calc(var(--space-6) * -1) calc(var(--space-6) * -1);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: #475569;
  cursor: pointer;
  overflow: hidden;
  transition: color var(--transition-fast);
}

.preview-sidebar__path:hover {
  color: #94a3b8;
}

.preview-sidebar__path span {
  flex: 1;
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-fade-enter-active {
  transition: opacity 250ms ease;
}

.preview-fade-leave-active {
  transition: opacity 200ms ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}

.preview-fade-enter-from .preview-shell {
  transform: scale(0.97);
}

.preview-fade-leave-to .preview-shell {
  transform: scale(0.97);
}
</style>

<style>
html.dark .preview-shell {
  background: rgba(2, 6, 23, 0.8);
  border-color: rgba(255, 255, 255, 0.04);
}
</style>
