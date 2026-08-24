<template>
  <div class="custom-params">
    <div
      v-for="(param, index) in localParams"
      :key="param.id"
      class="param-row"
    >
      <el-input
        v-model="param.name"
        placeholder="参数名"
        maxlength="100"
        style="flex: 1"
        @blur="syncToParent"
      />
      <el-input
        v-model="param.value"
        placeholder="参数值"
        maxlength="500"
        style="flex: 2"
        @blur="syncToParent"
      />
      <el-button
        :icon="Delete"
        type="danger"
        plain
        circle
        size="small"
        @click="removeParam(index)"
      />
    </div>

    <el-button
      type="default"
      plain
      :icon="Plus"
      @click="addParam"
    >
      添加参数
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';

interface ParamItem {
  id: string;
  name: string;
  value: string;
}

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

let idCounter = 0;
function genId(): string {
  return `param_${++idCounter}_${Date.now()}`;
}

function parseParams(json: string): ParamItem[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      return arr.map((p) => ({
        id: genId(),
        name: p.name ?? '',
        value: p.value ?? '',
      }));
    }
  } catch {
    // empty
  }
  return [];
}

function stringifyParams(params: ParamItem[]): string {
  return JSON.stringify(params.map(({ name, value }) => ({ name, value })));
}

const localParams = ref<ParamItem[]>([]);

let initialized = false;

watch(
  () => props.modelValue,
  (val) => {
    if (!initialized) {
      localParams.value = parseParams(val);
      initialized = true;
    }
  },
  { immediate: true }
);

function syncToParent() {
  emit('update:modelValue', stringifyParams(localParams.value));
}

function addParam() {
  localParams.value.push({ id: genId(), name: '', value: '' });
}

function removeParam(index: number) {
  localParams.value.splice(index, 1);
  syncToParent();
}
</script>

<style scoped>
.custom-params {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.param-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.param-row :deep(.el-input) {
  flex: 1;
}
</style>
