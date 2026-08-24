<template>
  <el-collapse-item name="advanced">
    <template #title>
      <div class="collapse-title">
        <span>高级配置</span>
        <el-tag v-if="hasCustomizations" size="small" type="info">已自定义</el-tag>
      </div>
    </template>

    <div class="advanced-config">
      <div class="config-group">
        <div class="group-label">语言与时区</div>
        <div class="group-row">
          <el-form-item label="语言">
            <el-input
              v-model="localData.lang"
              placeholder="zh-CN"
              maxlength="50"
              @blur="syncToParent"
            />
          </el-form-item>
          <el-form-item label="接受语言">
            <el-input
              v-model="localData.accept_lang"
              placeholder="zh-CN,en-US;q=0.9"
              maxlength="200"
              @blur="syncToParent"
            />
          </el-form-item>
        </div>
        <div class="group-row group-row--single">
          <el-form-item label="时区">
            <el-select
              v-model="localData.timezone"
              filterable
              allow-create
              placeholder="选择或输入时区"
              style="width: 100%"
              @change="syncToParent"
            >
              <el-option label="Asia/Shanghai" value="Asia/Shanghai" />
              <el-option label="Asia/Tokyo" value="Asia/Tokyo" />
              <el-option label="Asia/Seoul" value="Asia/Seoul" />
              <el-option label="America/New_York" value="America/New_York" />
              <el-option label="America/Los_Angeles" value="America/Los_Angeles" />
              <el-option label="Europe/London" value="Europe/London" />
              <el-option label="UTC" value="UTC" />
            </el-select>
          </el-form-item>
        </div>
      </div>

      <div class="config-group">
        <div class="group-label">硬件与版本</div>
        <div class="group-row">
          <el-form-item label="系统版本">
            <el-input
              v-model="localData.platform_version"
              placeholder="由种子自动生成"
              maxlength="100"
              @blur="syncToParent"
            />
          </el-form-item>
          <el-form-item label="浏览器版本">
            <el-input
              v-model="localData.brand_version"
              placeholder="由种子自动生成"
              maxlength="100"
              @blur="syncToParent"
            />
          </el-form-item>
        </div>
        <div class="group-row group-row--single">
          <el-form-item label="CPU核心数">
            <el-input
              :model-value="localData.hardware_concurrency ?? '自动'"
              readonly
              class="readonly-field"
            />
          </el-form-item>
        </div>
        <div class="group-row group-row--single">
          <el-form-item label="GPU供应商">
            <el-input
              :model-value="localData.gpu_vendor ?? '自动'"
              readonly
              class="readonly-field"
            />
          </el-form-item>
        </div>
        <div class="group-row group-row--single">
          <el-form-item label="GPU渲染器">
            <el-input
              :model-value="localData.gpu_renderer ?? '自动'"
              readonly
              class="readonly-field"
            />
          </el-form-item>
        </div>
      </div>
      <div class="gpu-tip">
        <el-icon><InfoFilled /></el-icon>
        <span>GPU 和 CPU 核心数由指纹种子自动生成，手动修改可能导致风控检测</span>
      </div>
    </div>
  </el-collapse-item>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';

export interface AdvancedData {
  lang: string;
  accept_lang: string;
  timezone: string;
  platform_version: string | null;
  brand_version: string | null;
  hardware_concurrency: number | null;
  gpu_vendor: string | null;
  gpu_renderer: string | null;
}

const props = defineProps<{
  modelValue: AdvancedData;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AdvancedData];
}>();

const localData = ref<AdvancedData>({ ...props.modelValue });

let skipNextPropWatch = false;

watch(
  () => props.modelValue,
  (val) => {
    if (skipNextPropWatch) {
      skipNextPropWatch = false;
      return;
    }
    localData.value = { ...val };
  }
);

function syncToParent() {
  skipNextPropWatch = true;
  emit('update:modelValue', { ...localData.value });
}

const hasCustomizations = computed(() => {
  const d = localData.value;
  return (
    d.lang !== '' ||
    d.accept_lang !== '' ||
    d.timezone !== '' ||
    d.platform_version !== null ||
    d.brand_version !== null ||
    d.hardware_concurrency !== null ||
    d.gpu_vendor !== null ||
    d.gpu_renderer !== null
  );
});
</script>

<style scoped>
.collapse-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.advanced-config {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-2) 0;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.group-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
  padding-left: var(--space-1);
}

.group-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.group-row--single {
  grid-template-columns: 1fr;
}

.group-row :deep(.el-form-item) {
  margin-bottom: 0;
}

.group-row :deep(.el-form-item__label) {
  font-size: var(--font-size-xs);
  color: var(--color-text-regular);
}

.gpu-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  padding-left: var(--space-1);
  white-space: nowrap;
}

.readonly-field :deep(.el-input__inner) {
  color: var(--color-text-secondary);
  cursor: default;
}

.readonly-field :deep(.el-input__wrapper) {
  background-color: var(--color-bg-page);
}
</style>
