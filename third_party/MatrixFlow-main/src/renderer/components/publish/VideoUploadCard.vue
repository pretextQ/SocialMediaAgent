<template>
  <div class="card">
    <div class="card-header">上传视频</div>
    <div class="card-body">
      <!-- 空闲：上传区域 -->
      <div
        v-if="uploadStatus === 'idle'"
        class="upload-zone"
        :class="{ 'upload-zone--active': isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="handleDrop"
        @click="triggerFileInput"
      >
        <div class="upload-zone__content">
          <el-icon :size="40" color="var(--color-text-placeholder)"><Upload /></el-icon>
          <h4>拖拽视频到此处</h4>
          <p>或点击选择文件</p>
          <p class="upload-hint">支持 MP4 / MOV / AVI，最大 2GB</p>
        </div>
      </div>

      <!-- 上传中 -->
      <div v-else-if="uploadStatus === 'uploading'" class="upload-zone upload-zone--uploading">
        <div class="upload-zone__content">
          <el-icon :size="40" color="var(--color-primary)"><Loading /></el-icon>
          <h4>上传中...</h4>
          <div class="progress-bar-wrap">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
            </div>
            <div class="progress-text">{{ progress }}% · {{ remainingTime }}</div>
          </div>
        </div>
      </div>

      <!-- 上传失败 -->
      <div v-else-if="uploadStatus === 'error'" class="upload-zone upload-zone--error" @click="triggerFileInput">
        <div class="upload-zone__content">
          <el-icon :size="40" color="var(--color-danger)"><CircleClose /></el-icon>
          <h4>上传失败</h4>
          <p>{{ errorMessage || '点击重新上传' }}</p>
        </div>
      </div>

      <!-- 上传完成：可播放视频预览 -->
      <div v-else-if="uploadStatus === 'done'" class="video-done">
        <div class="video-done__preview">
          <video
            ref="videoRef"
            :src="videoSrc"
            class="video-done__player"
            controls
            preload="metadata"
            @error="handleVideoError"
          />
        </div>

        <!-- 操作按钮 -->
        <div class="video-done__actions">
          <el-button size="small" @click="handleCaptureFrame" :loading="capturing">
            <el-icon v-if="!capturing" :size="13"><Camera /></el-icon>
            截取首帧为封面
          </el-button>
          <el-button size="small" @click="handleViewCover" :disabled="!coverPreviewSrc">
            <el-icon :size="13"><Picture /></el-icon>
            查看封面
          </el-button>
          <el-button size="small" @click="handleReupload">
            <el-icon :size="13"><RefreshRight /></el-icon>
            重新上传
          </el-button>
          <el-button size="small" type="danger" plain @click="handleDelete">
            <el-icon :size="13"><Delete /></el-icon>
            删除视频
          </el-button>
        </div>
      </div>

      <!-- 封面预览弹窗 -->
      <Teleport to="body">
        <Transition name="cover-fade">
          <div v-if="showCoverPreview" class="cover-overlay" @click="showCoverPreview = false">
            <img :src="coverPreviewSrc" class="cover-overlay__image" @click.stop />
            <button class="cover-overlay__close" @click="showCoverPreview = false">
              <el-icon :size="22"><Close /></el-icon>
            </button>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Upload, Loading, CircleClose, VideoCamera,
  Picture, RefreshRight, Delete, Close, Camera,
} from '@element-plus/icons-vue';

interface UploadState {
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number;
  fileName?: string;
  fileSize?: number;
  coverUrl?: string;
  thumbnailPath?: string;
  filePath?: string;
  videoUrl?: string;
  errorMessage?: string;
}

const props = defineProps<{
  modelValue: UploadState;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: UploadState];
  'capture-frame': [];
  reupload: [];
  delete: [];
  'auto-title': [title: string];
}>();

const isDragging = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
const showCoverPreview = ref(false);
const capturing = ref(false);
let progressListener: ((data: { progress: number }) => void) | null = null;
let cleanupProgressListener: (() => void) | null = null;

const uploadStatus = computed(() => props.modelValue.status);
const progress = computed(() => props.modelValue.progress);
const errorMessage = computed(() => props.modelValue.errorMessage);
const coverPreviewSrc = computed(() => {
  if (props.modelValue.coverUrl) return props.modelValue.coverUrl;
  if (props.modelValue.thumbnailPath) return `local-file://${props.modelValue.thumbnailPath}`;
  return '';
});
const videoSrc = computed(() => {
  if (props.modelValue.filePath) {
    return `local-file://${props.modelValue.filePath}`;
  }
  return '';
});

const remainingTime = computed(() => {
  const remaining = ((100 - progress.value) / 100) * 30;
  if (remaining < 60) return `约${Math.ceil(remaining)}秒`;
  return `约${Math.ceil(remaining / 60)}分钟`;
});

async function triggerFileInput() {
  if (!window.matrixflow?.dialog?.openFile) {
    emit('update:modelValue', {
      ...props.modelValue,
      status: 'error',
      errorMessage: '文件选择功能不可用',
    });
    return;
  }

  try {
    const result = await window.matrixflow.dialog.openFile({
      title: '选择视频文件',
      properties: ['openFile'],
      filters: [
        { name: '视频', extensions: ['mp4', 'mov', 'avi'] },
      ],
    });

    if (result) {
      const filePath = Array.isArray(result) ? result[0] : result;
      if (filePath) {
        const name = filePath.split(/[\\/]/).pop() || 'video';
        const titleName = name.replace(/\.[^.]+$/, '');
        startUpload(filePath, name, titleName);
      }
    }
  } catch {
    emit('update:modelValue', {
      ...props.modelValue,
      status: 'error',
      errorMessage: '文件选择失败',
    });
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('video/')) {
    emit('update:modelValue', {
      ...props.modelValue,
      status: 'error',
      errorMessage: '请使用点击方式选择视频文件',
    });
  }
}

async function startUpload(filePath: string, name: string, titleName: string) {
  if (!window.matrixflow?.material?.upload) {
    emit('update:modelValue', {
      ...props.modelValue,
      status: 'error',
      errorMessage: '上传功能不可用',
    });
    return;
  }

  emit('update:modelValue', {
    status: 'uploading',
    progress: 0,
    fileName: name,
  });

  if (window.matrixflow.on) {
    progressListener = (data: { progress: number }) => {
      emit('update:modelValue', {
        status: 'uploading',
        progress: Math.round(data.progress),
        fileName: name,
      });
    };
    cleanupProgressListener = window.matrixflow.on('material:upload-progress', progressListener);
  }

  try {
    const result = await window.matrixflow.material.upload(filePath);

    cleanupProgress();

    if (result && result.success && result.data) {
      const m = result.data;
      emit('update:modelValue', {
        status: 'done',
        progress: 100,
        fileName: m.title || name,
        fileSize: m.fileSize || 0,
        thumbnailPath: m.thumbnailPath,
        coverUrl: m.thumbnailPath ? `local-file://${m.thumbnailPath}` : undefined,
        filePath: m.filePath || filePath,
        videoUrl: m.id,
      });
      emit('auto-title', m.title || titleName);

      // 自动截取原尺寸首帧作为封面
      autoCaptureFrame(m.filePath || filePath);
    } else {
      emit('update:modelValue', {
        status: 'done',
        progress: 100,
        fileName: name,
        filePath: filePath,
      });
      emit('auto-title', titleName);

      // 自动截取原尺寸首帧
      autoCaptureFrame(filePath);
    }
  } catch (err) {
    cleanupProgress();
    emit('update:modelValue', {
      ...props.modelValue,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : '上传失败',
    });
  }
}

// ── 操作按钮 ──

async function handleCaptureFrame() {
  if (!props.modelValue.filePath) return;
  capturing.value = true;
  try {
    const result = await window.matrixflow.material.captureFrame(
      props.modelValue.filePath,
      '00:00:00',
    );
    if (result && result.success && result.data) {
      emit('update:modelValue', {
        ...props.modelValue,
        coverUrl: `local-file://${result.data.imagePath}`,
      });
      ElMessage.success('封面已截取（原尺寸首帧）');
    } else {
      ElMessage.error('截取失败，请重试');
    }
  } catch (e) {
    ElMessage.error('截取失败：' + (e instanceof Error ? e.message : '未知错误'));
  } finally {
    capturing.value = false;
  }
}

// 上传后自动截取原尺寸首帧，静默执行不弹提示
async function autoCaptureFrame(filePath: string) {
  try {
    const result = await window.matrixflow.material.captureFrame(filePath, '00:00:00');
    if (result && result.success && result.data) {
      emit('update:modelValue', {
        ...props.modelValue,
        coverUrl: `local-file://${result.data.imagePath}`,
      });
    }
  } catch {
    // 静默失败，保留缩略图作为封面
  }
}

function handleViewCover() {
  if (!coverPreviewSrc.value) return;
  showCoverPreview.value = true;
}

function handleReupload() {
  // 直接打开文件选择器，选中后替换
  triggerFileInput();
}

function handleDelete() {
  emit('update:modelValue', {
    status: 'idle',
    progress: 0,
  });
  emit('delete');
}

function handleVideoError(e: Event) {
  console.error('视频加载失败:', e);
}

function cleanupProgress() {
  cleanupProgressListener?.();
  cleanupProgressListener = null;
  progressListener = null;
}

onUnmounted(() => {
  cleanupProgress();
});
</script>

<style scoped>
.card {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.card-header {
  padding: var(--space-3) var(--space-4);
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.card-body {
  padding: var(--space-4);
}

/* ── 上传区域 ── */
.upload-zone {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 40px var(--space-6);
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}

.upload-zone:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
}

.upload-zone--active {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
}

.upload-zone--uploading {
  cursor: default;
  border-style: solid;
  border-color: var(--color-primary-lighter);
}

.upload-zone--error {
  border-color: var(--color-danger);
  cursor: pointer;
}

.upload-zone--error:hover {
  background: var(--color-danger-light);
}

.upload-zone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.upload-zone__content h4 {
  font-size: 16px;
  font-weight: 600;
  margin: var(--space-2) 0 var(--space-1);
}

.upload-zone__content p {
  font-size: 13px;
  color: var(--color-text-placeholder);
}

.upload-hint {
  margin-top: 8px;
}

.progress-bar-wrap {
  margin-top: var(--space-3);
  width: 100%;
  max-width: 300px;
}

.progress-bar {
  height: 6px;
  background: var(--color-border-light);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

/* ── 上传完成：视频预览 ── */
.video-done {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.video-done__preview {
  position: relative;
  background: #000;
}

.video-done__player {
  width: 100%;
  max-height: 260px;
  display: block;
}

.video-done__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3);
}

/* ── 封面预览弹窗 ── */
.cover-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
  padding: var(--space-8);
}

.cover-overlay__image {
  max-width: 90vw;
  max-height: 90vh;
  width: auto;
  height: auto;
  cursor: default;
  border-radius: var(--radius-sm);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.cover-overlay__close {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.cover-overlay__close:hover {
  background: rgba(255, 255, 255, 0.25);
}

.cover-fade-enter-active,
.cover-fade-leave-active {
  transition: opacity 0.2s;
}
.cover-fade-enter-from,
.cover-fade-leave-to {
  opacity: 0;
}
</style>
