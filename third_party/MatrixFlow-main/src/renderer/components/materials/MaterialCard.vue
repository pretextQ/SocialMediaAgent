<template>
  <div
    class="material-card"
    :class="{ 'material-card--selected': selected }"
    @click="handlePreview"
  >
    <div class="material-card__preview">
      <img
        v-if="thumbnailUrl"
        :src="thumbnailUrl"
        :alt="material.title"
        class="material-card__thumb"
        @error="handleImageError"
      />
      <div v-else class="material-card__placeholder">
        <el-icon :size="32"><VideoCamera /></el-icon>
      </div>

      <div v-if="material.type === 'video'" class="material-card__play-overlay">
        <div class="material-card__play-btn">
          <el-icon :size="28"><VideoPlay /></el-icon>
        </div>
      </div>

      <div class="material-card__checkbox" @click.stop>
        <el-checkbox :model-value="selected" @change="handleSelect" />
      </div>

      <div class="material-card__type-badge">
        <el-icon v-if="material.type === 'image'"><Picture /></el-icon>
        <el-icon v-else><VideoCamera /></el-icon>
      </div>
    </div>

    <div class="material-card__info">
      <div class="material-card__title" :title="material.title">
        {{ material.title }}
      </div>
      <div class="material-card__meta">
        <span>{{ material.type === 'image' ? '图片' : '视频' }}</span>
        <span v-if="material.fileSize">{{ formatSize(material.fileSize) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { VideoPlay, Picture, VideoCamera } from '@element-plus/icons-vue';
import type { Material } from '../../stores/materials';

const props = defineProps<{
  material: Material;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [id: string, selected: boolean];
  preview: [material: Material];
}>();

const thumbnailUrl = computed(() => {
  if (props.material.thumbnailPath) {
    return `local-file://${props.material.thumbnailPath}`;
  }
  if (props.material.type === 'image') {
    return `local-file://${props.material.filePath}`;
  }
  return '';
});

function handleSelect(selected: boolean) {
  emit('select', props.material.id, selected);
}

function handlePreview() {
  emit('preview', props.material);
}

function handleImageError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
</script>

<style scoped>
.material-card {
  width: 180px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.material-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.material-card--selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.material-card__preview {
  position: relative;
  width: 100%;
  height: 120px;
  background: var(--el-fill-color-light);
}

.material-card__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-card__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}

.material-card__play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.material-card__play-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: transform 0.2s, background 0.2s;
}

.material-card:hover .material-card__play-btn {
  background: rgba(0, 0, 0, 0.75);
  transform: scale(1.1);
}

.material-card__checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
}

.material-card__type-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px;
  border-radius: 4px;
  font-size: 12px;
}

.material-card__info {
  padding: 8px 12px;
}

.material-card__title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card__meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
