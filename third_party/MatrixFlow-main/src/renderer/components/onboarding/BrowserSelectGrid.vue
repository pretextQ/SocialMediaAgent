<template>
  <div class="browser-select-grid">
    <!-- 内嵌浏览器 -->
    <div
      class="browser-card"
      :class="{ 'browser-card--active': selectedType === 'built-in' }"
      @click="selectBuiltIn"
    >
      <div class="browser-card__icon">
        <el-icon :size="40"><Monitor /></el-icon>
      </div>
      <h3 class="browser-card__title">内嵌浏览器</h3>
      <p class="browser-card__desc">推荐用于首次使用</p>
      <div class="browser-card__action">
        <el-button type="primary" @click.stop="selectBuiltIn">开始使用</el-button>
      </div>
    </div>

    <!-- 外置 Chrome -->
    <div
      class="browser-card"
      :class="{ 'browser-card--active': selectedType === 'external-chrome' }"
      @click="selectedType = 'external-chrome'"
    >
      <div class="browser-card__icon browser-card__icon--chrome">
        <el-icon :size="40"><ChromeFilled /></el-icon>
      </div>
      <h3 class="browser-card__title">外置 Chrome</h3>
      <p class="browser-card__desc">使用已安装的 Chrome 浏览器</p>
      <div class="browser-card__action">
        <el-input
          v-model="chromePath"
          placeholder="/Applications/Google Chrome.app"
          size="small"
          readonly
          @click.stop="selectFile('chrome')"
        >
          <template #append>
            <el-button :icon="FolderOpened" @click.stop="selectFile('chrome')" />
          </template>
        </el-input>
      </div>
      <div v-if="chromeError" class="browser-card__error">{{ chromeError }}</div>
    </div>

    <!-- 指纹浏览器 -->
    <div
      class="browser-card"
      :class="{ 'browser-card--active': selectedType === 'fingerprint' }"
      @click="selectedType = 'fingerprint'"
    >
      <div class="browser-card__icon browser-card__icon--fingerprint">
        <el-icon :size="40"><Operation /></el-icon>
      </div>
      <h3 class="browser-card__title">指纹浏览器</h3>
      <p class="browser-card__desc">如 Dolphin Anty 等指纹浏览器</p>
      <div class="browser-card__action">
        <el-input
          v-model="fingerprintPath"
          placeholder="请选择指纹浏览器路径"
          size="small"
          readonly
          @click.stop="selectFile('fingerprint')"
        >
          <template #append>
            <el-button :icon="FolderOpened" @click.stop="selectFile('fingerprint')" />
          </template>
        </el-input>
      </div>
      <div v-if="fingerprintError" class="browser-card__error">{{ fingerprintError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Monitor, ChromeFilled, FolderOpened, Operation } from '@element-plus/icons-vue';

interface Props {
  /** 当前选中的浏览器类型 */
  modelValue?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'select', type: string, path?: string): void;
}>();

const selectedType = ref<string | null>(props.modelValue || null);
const chromePath = ref('');
const fingerprintPath = ref('');
const chromeError = ref('');
const fingerprintError = ref('');

watch(
  () => props.modelValue,
  (val) => {
    if (val && val !== selectedType.value) {
      selectedType.value = val;
    }
  },
);

watch(selectedType, (val) => {
  emit('update:modelValue', val ?? '');
});

function selectBuiltIn() {
  selectedType.value = 'built-in';
  chromeError.value = '';
  fingerprintError.value = '';
  emit('select', 'built-in');
}

async function selectFile(type: 'chrome' | 'fingerprint') {
  // 通过 electronAPI 打开文件选择对话框
  // 需要在 preload.ts 中注册 dialog:openFile 通道
  try {
    const result = await (window as any).matrixflow?.['dialog:openFile']?.({
      title: type === 'chrome' ? '选择 Chrome 程序' : '选择指纹浏览器程序',
      properties: ['openFile'],
      filters: [
        {
          name: '可执行文件',
          extensions: ['app', 'exe', '*'],
        },
      ],
    });

    if (result) {
      if (type === 'chrome') {
        chromePath.value = result;
        selectedType.value = 'external-chrome';
        chromeError.value = '';
        emit('select', 'external-chrome', result);
      } else {
        fingerprintPath.value = result;
        selectedType.value = 'fingerprint';
        fingerprintError.value = '';
        emit('select', 'fingerprint', result);
      }
    }
  } catch {
    // electronAPI 未就绪时静默处理
  }
}

/** 外部调用校验 */
function validate(): boolean {
  if (selectedType.value === 'external-chrome' && !chromePath.value) {
    chromeError.value = '请选择 Chrome 程序路径';
    return false;
  }
  if (selectedType.value === 'fingerprint' && !fingerprintPath.value) {
    fingerprintError.value = '请选择指纹浏览器路径';
    return false;
  }
  chromeError.value = '';
  fingerprintError.value = '';
  return true;
}

defineExpose({ validate });
</script>

<style scoped>
.browser-select-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.browser-card {
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 200px;
}

.browser-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary-light);
}

.browser-card--active {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
}

.browser-card__icon {
  color: var(--color-primary);
  margin-bottom: var(--space-4);
  transition: transform var(--transition-fast);
}

.browser-card:hover .browser-card__icon {
  transform: scale(1.08);
}

.browser-card__icon--chrome {
  color: #4285f4;
}

.browser-card__icon--fingerprint {
  color: var(--color-plat-kuaishou);
}

.browser-card__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2) 0;
}

.browser-card__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-4) 0;
  line-height: var(--line-height-base);
}

.browser-card__action {
  display: flex;
  width: 100%;
  margin-top: auto;
}

.browser-card__action .el-input {
  flex: 1;
}

.browser-card__error {
  margin-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-danger);
  width: 100%;
  text-align: left;
}

@media (max-width: 680px) {
  .browser-select-grid {
    grid-template-columns: 1fr;
  }
}
</style>
