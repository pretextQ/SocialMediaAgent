<template>
  <div class="card">
    <div class="card-header">公共配置</div>
    <div class="card-body">
      <div class="form-group">
        <label class="form-label">
          标题 <span class="required">*</span>
        </label>
        <input
          v-model="localConfig.title"
          type="text"
          class="form-input"
          placeholder="输入视频标题（全平台共享）"
          @input="emit('update:modelValue', localConfig)"
        />
      </div>

      <div class="form-group">
        <label class="form-label">作品描述</label>
        <textarea
          v-model="localConfig.description"
          class="form-textarea"
          placeholder="输入视频作品描述"
          rows="3"
          @input="emit('update:modelValue', localConfig)"
        ></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">标签</label>
        <div class="tag-input" @click="focusTagInput">
          <span v-for="(tag, index) in localConfig.tags" :key="index" class="chip">
            {{ tag }}
            <span class="chip-remove" @click.stop="removeTag(index)">×</span>
          </span>
          <input
            ref="tagInputRef"
            v-model="tagInput"
            class="tag-input-field"
            placeholder="添加标签"
            @keydown.enter.prevent="addTag"
            @keydown.backspace="handleTagBackspace"
            @input="emit('update:modelValue', localConfig)"
          />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">发布时间</label>
        <div class="mode-radio-group">
          <label class="mode-radio">
            <input
              v-model="localConfig.scheduleMode"
              type="radio"
              value="immediate"
              @change="emit('update:modelValue', localConfig)"
            />
            <span class="mode-label">立即发布</span>
          </label>
          <label class="mode-radio">
            <input
              v-model="localConfig.scheduleMode"
              type="radio"
              value="scheduled"
              @change="emit('update:modelValue', localConfig)"
            />
            <span class="mode-label-content">
              <span class="mode-label">定时发布</span>
              <input
                v-if="localConfig.scheduleMode === 'scheduled'"
                v-model="localConfig.scheduledAt"
                type="datetime-local"
                step="60"
                class="datetime-input"
                @input="emit('update:modelValue', localConfig)"
              />
            </span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';

interface CommonConfig {
  title: string;
  description: string;
  tags: string[];
  scheduleMode: 'immediate' | 'scheduled';
  scheduledAt?: string;
}

const props = defineProps<{
  modelValue: CommonConfig;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: CommonConfig];
}>();

const localConfig = reactive<CommonConfig>({ ...props.modelValue });
const tagInput = ref('');
const tagInputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.modelValue,
  (newVal) => {
    Object.assign(localConfig, newVal);
  },
  { deep: true }
);

function focusTagInput() {
  tagInputRef.value?.focus();
}

function addTag() {
  const tag = tagInput.value.trim();
  if (tag && !localConfig.tags.includes(tag)) {
    localConfig.tags.push(tag);
    emit('update:modelValue', localConfig);
  }
  tagInput.value = '';
}

function removeTag(index: number) {
  localConfig.tags.splice(index, 1);
  emit('update:modelValue', localConfig);
}

function handleTagBackspace() {
  if (tagInput.value === '' && localConfig.tags.length > 0) {
    localConfig.tags.pop();
    emit('update:modelValue', localConfig);
  }
}
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

.form-group {
  margin-bottom: var(--space-3);
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.required {
  color: var(--color-danger);
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-lighter);
}

.form-input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.form-textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  resize: vertical;
  min-height: 60px;
  box-sizing: border-box;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-lighter);
}

.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  min-height: 32px;
  align-items: center;
  cursor: text;
}

.tag-input:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-lighter);
}

.chip {
  padding: 1px 6px;
  font-size: 12px;
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 2px;
}

.chip-remove {
  cursor: pointer;
  margin-left: 2px;
}

.chip-remove:hover {
  color: var(--color-danger);
}

.tag-input-field {
  border: none;
  outline: none;
  font-size: 13px;
  flex: 1;
  min-width: 60px;
  font-family: var(--font-family);
  background: transparent;
}

.mode-radio-group {
  display: flex;
  gap: var(--space-4);
  align-items: center;
}

.mode-radio {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.mode-radio input[type="radio"] {
  accent-color: var(--color-primary);
  width: 16px;
  height: 16px;
}

.mode-label {
  font-weight: 500;
}

.mode-label-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.datetime-input {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
}

.datetime-input:focus {
  outline: none;
  border-color: var(--color-primary);
}
</style>
