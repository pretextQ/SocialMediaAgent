<template>
  <div class="seed-input">
    <el-select
      v-model="mode"
      placeholder="选择模式"
      style="width: 120px"
      @change="onModeChange"
    >
      <el-option label="自动生成" value="auto" />
      <el-option label="手动输入" value="manual" />
    </el-select>

    <el-input-number
      v-if="mode === 'manual'"
      v-model="manualValue"
      :min="1"
      :max="2147483647"
      placeholder="1-2147483647"
      style="width: 160px"
      @change="onManualChange"
    />

    <el-tooltip content="重新生成随机种子" placement="top">
      <el-button
        :icon="Refresh"
        circle
        plain
        size="small"
        @click="generateSeed"
        :loading="generating"
      />
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue: number | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  'seedGenerated': [value: number];
}>();

type Mode = 'auto' | 'manual';

const mode = ref<Mode>(props.modelValue === null ? 'auto' : 'manual');
const manualValue = ref<number | undefined>(
  props.modelValue !== null ? props.modelValue : undefined
);
const generating = ref(false);

watch(
  () => props.modelValue,
  (val) => {
    mode.value = val === null ? 'auto' : 'manual';
    manualValue.value = val !== null ? val : undefined;
  }
);

function onModeChange() {
  if (mode.value === 'auto') {
    manualValue.value = undefined;
    emit('update:modelValue', null);
  } else {
    if (manualValue.value === undefined) {
      manualValue.value = Math.floor(Math.random() * 2147483647) + 1;
    }
    emit('update:modelValue', manualValue.value ?? null);
  }
}

function onManualChange(val: number | undefined) {
  if (val !== undefined) {
    emit('update:modelValue', val);
  }
}

async function generateSeed() {
  generating.value = true;
  try {
    const result = await window.matrixflow.fingerprint.generateSeed();
    console.log('[FingerprintSeedInput] generateSeed IPC result:', result);
    if (result.success && result.data !== undefined) {
      manualValue.value = result.data;
      mode.value = 'manual';
      emit('update:modelValue', result.data);
      emit('seedGenerated', result.data);
      console.log('[FingerprintSeedInput] emitted seedGenerated:', result.data);
    }
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
.seed-input {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.seed-input :deep(.el-select) {
  width: 120px;
}
</style>