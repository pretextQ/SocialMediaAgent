<template>
  <el-dialog
    v-model="visible"
    title="网络设置"
    width="520px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="network-settings">
      <!-- 代理设置 -->
      <div class="settings-group">
        <h4 class="settings-group__title">代理设置</h4>
        <div class="proxy-options">
          <div
            v-for="option in proxyOptions"
            :key="option.value"
            class="proxy-option"
            :class="{ 'proxy-option--active': proxyType === option.value }"
            @click="proxyType = option.value"
          >
            <el-icon v-if="proxyType === option.value" color="var(--color-primary)"><Check /></el-icon>
            <span>{{ option.label }}</span>
          </div>
        </div>

        <!-- 代理配置表单 -->
        <div v-if="proxyType === 'proxy'" class="proxy-form">
          <el-form ref="proxyFormRef" :model="proxyForm" :rules="proxyRules" label-width="80px" size="small">
            <el-form-item label="代理类型" prop="type">
              <el-select v-model="proxyForm.type" placeholder="选择代理类型">
                <el-option label="HTTP" value="http" />
                <el-option label="HTTPS" value="https" />
                <el-option label="SOCKS5" value="socks5" />
              </el-select>
            </el-form-item>
            <el-form-item label="地址" prop="host">
              <el-input v-model="proxyForm.host" placeholder="127.0.0.1" />
            </el-form-item>
            <el-form-item label="端口" prop="port">
              <el-input-number v-model="proxyForm.port" :min="1" :max="65535" controls-position="right" style="width: 100%" />
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="proxyForm.username" placeholder="可选" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="proxyForm.password" type="password" show-password placeholder="可选" />
            </el-form-item>
          </el-form>
        </div>
      </div>

      <!-- 指纹设置 -->
      <div class="settings-group">
        <h4 class="settings-group__title">浏览器指纹</h4>
        <div class="fingerprint-section">
          <div class="fingerprint-select">
            <el-select v-model="fingerprintId" placeholder="选择指纹模板" style="width: 100%">
              <el-option
                v-for="fp in fingerprintTemplates"
                :key="fp.id"
                :label="fp.name"
                :value="fp.id"
              >
                <div class="fingerprint-option">
                  <span>{{ fp.name }}</span>
                  <span class="fingerprint-option__detail">{{ fp.screen_width }}x{{ fp.screen_height }}</span>
                </div>
              </el-option>
              <template #empty>
                <div class="fingerprint-empty">暂无指纹模板</div>
              </template>
            </el-select>
          </div>
          <el-button text type="primary" @click="showFingerprintDialog = true">
            <el-icon><Setting /></el-icon>
            管理指纹
          </el-button>
        </div>

        <!-- 指纹预览 -->
        <div v-if="selectedFingerprint" class="fingerprint-preview">
          <div class="fingerprint-preview__item">
            <span class="label">分辨率</span>
            <span class="value">{{ selectedFingerprint.screen_width }}x{{ selectedFingerprint.screen_height }}</span>
          </div>
          <div class="fingerprint-preview__item">
            <span class="label">语言</span>
            <span class="value">{{ selectedFingerprint.language }}</span>
          </div>
          <div class="fingerprint-preview__item">
            <span class="label">平台</span>
            <span class="value">{{ getPlatformLabel(selectedFingerprint.platform) }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确认</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 指纹管理弹窗 -->
  <el-dialog
    v-model="showFingerprintDialog"
    title="指纹模板管理"
    width="600px"
    destroy-on-close
  >
    <FingerprintSettings />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { Check, Setting } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import FingerprintSettings from '../settings/FingerprintSettings.vue';

interface FingerprintTemplate {
  id: string;
  name: string;
  platform: string;
  screen_width: number;
  screen_height: number;
  language: string;
}

interface ProxyForm {
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

const props = defineProps<{
  modelValue: boolean;
  initialProxyType?: string;
  initialProxyForm?: ProxyForm;
  initialFingerprintId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  'confirm': [data: { proxyType: string; proxyForm: ProxyForm; fingerprintId: string }];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const proxyFormRef = ref<FormInstance>();
const proxyType = ref('none');
const proxyForm = reactive<ProxyForm>({
  type: 'http',
  host: '127.0.0.1',
  port: 7890,
  username: '',
  password: '',
});
const fingerprintId = ref('');
const showFingerprintDialog = ref(false);

const fingerprintTemplates = ref<FingerprintTemplate[]>([]);

const proxyOptions = [
  { label: '不使用代理', value: 'none' },
  { label: '使用代理', value: 'proxy' },
];

const proxyRules: FormRules = {
  type: [{ required: true, message: '请选择代理类型', trigger: 'change' }],
  host: [{ required: true, message: '请输入代理地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口号', trigger: 'change' }],
};

const selectedFingerprint = computed(() => {
  return fingerprintTemplates.value.find((fp) => fp.id === fingerprintId.value);
});

watch(() => props.modelValue, async (val) => {
  if (val) {
    await loadFingerprintTemplates();
    // Reset to defaults, then apply initial values if provided
    proxyType.value = 'none';
    Object.assign(proxyForm, { type: 'http', host: '127.0.0.1', port: 7890, username: '', password: '' });
    fingerprintId.value = '';
    
    if (props.initialProxyType) proxyType.value = props.initialProxyType;
    if (props.initialProxyForm) Object.assign(proxyForm, props.initialProxyForm);
    if (props.initialFingerprintId) fingerprintId.value = props.initialFingerprintId;
  }
});

async function loadFingerprintTemplates() {
  try {
    if (window.matrixflow?.fingerprint?.list) {
      const result = await window.matrixflow.fingerprint.list();
      if (result.success && result.data) {
        fingerprintTemplates.value = result.data;
      }
    }
  } catch {
    // ignore
  }
}

function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    wechat: '视频号',
    kuaishou: '快手',
    generic: '通用',
  };
  return labels[platform] || platform;
}

function handleClose() {
  visible.value = false;
}

async function handleConfirm() {
  if (proxyType.value === 'proxy') {
    const valid = await proxyFormRef.value?.validate().catch(() => false);
    if (!valid) return;
  }

  emit('confirm', {
    proxyType: proxyType.value,
    proxyForm: { ...proxyForm },
    fingerprintId: fingerprintId.value,
  });

  visible.value = false;
}
</script>

<style scoped>
.network-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-2) 0;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.settings-group__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

/* 代理选项卡片 */
.proxy-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.proxy-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--color-bg-card);
}

.proxy-option:hover {
  border-color: var(--color-primary-light);
}

.proxy-option--active {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
  color: var(--color-primary);
}

.proxy-option span {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

/* 代理表单 */
.proxy-form {
  padding: var(--space-4);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
}

.proxy-form :deep(.el-form-item) {
  margin-bottom: var(--space-3);
}

.proxy-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

/* 指纹设置 */
.fingerprint-section {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.fingerprint-select {
  flex: 1;
}

.fingerprint-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.fingerprint-option__detail {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.fingerprint-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: var(--font-size-sm);
}

/* 指纹预览 */
.fingerprint-preview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  margin-top: var(--space-2);
}

.fingerprint-preview__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fingerprint-preview__item .label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.fingerprint-preview__item .value {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>