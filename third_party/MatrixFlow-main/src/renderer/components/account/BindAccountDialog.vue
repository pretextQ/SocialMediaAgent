<template>
  <el-dialog
    v-model="visible"
    title="添加账号"
    width="560px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="bind-account-dialog">
      <!-- 顶部步骤指示器 -->
      <div class="bind-account-dialog__steps">
        <div
          v-for="(stepItem, index) in steps"
          :key="stepItem.key"
          class="step-indicator"
          :class="{
            'step-indicator--active': currentStep === index,
            'step-indicator--done': currentStep > index,
          }"
          @click="currentStep > index && goToStep(index)"
        >
          <div class="step-indicator__number">
            <el-icon v-if="currentStep > index"><Check /></el-icon>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span class="step-indicator__label">{{ stepItem.label }}</span>
        </div>
        <div class="step-indicator__line" />
      </div>

      <!-- Step 1: 选择平台 -->
      <div v-if="currentStep === 0" class="bind-account-dialog__platforms">
        <div class="platform-grid">
          <div
            v-for="platform in platforms"
            :key="platform.value"
            class="platform-card"
            :class="{ 'platform-card--active': selectedPlatform === platform.value }"
            @click="selectedPlatform = platform.value"
          >
            <div class="platform-card__icon" :style="{ background: platform.color + '15', color: platform.color }">
              <span class="platform-card__initial">{{ platform.label.charAt(0) }}</span>
            </div>
            <span class="platform-card__name">{{ platform.label }}</span>
            <div v-if="selectedPlatform === platform.value" class="platform-card__check">
              <el-icon color="#fff"><Check /></el-icon>
            </div>
          </div>
        </div>

        <!-- 网络设置按钮 -->
        <div class="network-setting-trigger">
          <el-button text @click="showNetworkSettings = true">
            <el-icon><Setting /></el-icon>
            网络设置
          </el-button>
        </div>
      </div>

      <!-- Step 2: 扫码绑定 -->
      <div v-else-if="currentStep === 1" class="bind-account-dialog__qr">
        <div class="qr-container">
          <div class="qr-placeholder">
            <template v-if="qrLoading">
              <el-icon class="qr-loading" :size="40"><Loading /></el-icon>
              <span>正在获取二维码...</span>
            </template>
            <template v-else-if="qrCodeUrl">
              <img :src="qrCodeUrl" alt="二维码" class="qr-image" />
            </template>
            <template v-else>
              <el-icon :size="56" color="var(--color-text-placeholder)"><Iphone /></el-icon>
              <span>请使用{{ currentPlatformLabel }}APP扫码登录</span>
            </template>
          </div>

          <div class="qr-platform-info">
            <span class="qr-platform-label">{{ currentPlatformLabel }}</span>
            <el-tag size="small" effect="plain">{{ currentPlatformLabel }} 账号</el-tag>
          </div>

          <el-button text type="primary" @click="refreshQR" :disabled="qrLoading">
            <el-icon><Refresh /></el-icon>
            刷新二维码
          </el-button>
        </div>

        <!-- 绑定的网络配置预览 -->
        <div v-if="hasNetworkConfig" class="network-config-preview">
          <el-icon color="var(--color-text-secondary)"><Connection /></el-icon>
          <span>将使用{{ networkConfigText }}</span>
        </div>
      </div>

      <!-- Step 3: 完成 -->
      <div v-else-if="currentStep === 2" class="bind-account-dialog__done">
        <div class="done-icon">
          <el-icon :size="64" color="var(--color-success)"><CircleCheckFilled /></el-icon>
        </div>
        <h3 class="done-title">账号绑定成功</h3>
        <p class="done-desc">已成功绑定 {{ currentPlatformLabel }} 账号</p>
        <div v-if="boundAccount" class="done-account">
          <el-avatar :size="48" :src="boundAccount.avatar">
            {{ boundAccount.nickname?.charAt(0) || '?' }}
          </el-avatar>
          <div class="done-account__info">
            <span class="done-account__name">{{ boundAccount.nickname }}</span>
            <el-tag size="small">{{ currentPlatformLabel }}</el-tag>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="bind-account-dialog__footer">
        <el-button v-if="currentStep > 0" @click="handlePrev">上一步</el-button>
        <el-button v-if="currentStep === 0" :disabled="!selectedPlatform" type="primary" @click="handleNext">
          下一步
        </el-button>
        <el-button v-if="currentStep === 1" type="primary" :loading="binding" @click="handleBind">
          确认绑定
        </el-button>
        <el-button v-if="currentStep === 2" type="primary" @click="handleFinish">完成</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 网络设置弹窗 -->
  <NetworkSettingsDialog
    v-model="showNetworkSettings"
    :initial-proxy-type="networkSettings.proxyType"
    :initial-proxy-form="networkSettings.proxyForm"
    :initial-fingerprint-id="networkSettings.fingerprintId"
    @confirm="handleNetworkSettingsConfirm"
  />
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import {
  Check, Loading, Iphone, Refresh, CircleCheckFilled, Setting, Connection,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { Account } from '@/renderer/stores/account';
import NetworkSettingsDialog from './NetworkSettingsDialog.vue';

interface NetworkSettings {
  proxyType: string;
  proxyForm: {
    type: string;
    host: string;
    port: number;
    username: string;
    password: string;
  };
  fingerprintId: string;
}

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [val: boolean]; success: [] }>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const currentStep = ref(0);
const selectedPlatform = ref('');
const qrLoading = ref(false);
const qrCodeUrl = ref('');
const binding = ref(false);
const boundAccount = ref<Account | null>(null);
const showNetworkSettings = ref(false);

const networkSettings = reactive<NetworkSettings>({
  proxyType: 'none',
  proxyForm: {
    type: 'http',
    host: '127.0.0.1',
    port: 7890,
    username: '',
    password: '',
  },
  fingerprintId: '',
});

const steps = [
  { key: 'select', label: '选择平台' },
  { key: 'bind', label: '扫码绑定' },
  { key: 'done', label: '完成' },
];

const platforms = [
  { label: '抖音', value: 'douyin', color: '#161823' },
  { label: '小红书', value: 'xiaohongshu', color: '#FE2C55' },
  { label: '视频号', value: 'channels', color: '#07C160' },
  { label: '快手', value: 'kuaishou', color: '#FF4906' },
];

const currentPlatformLabel = computed(() => {
  return platforms.find((p) => p.value === selectedPlatform.value)?.label || '';
});

const hasNetworkConfig = computed(() => {
  return networkSettings.proxyType === 'proxy' || networkSettings.fingerprintId;
});

const networkConfigText = computed(() => {
  const parts: string[] = [];
  if (networkSettings.proxyType === 'proxy') {
    parts.push('代理');
  }
  if (networkSettings.fingerprintId) {
    parts.push('指纹模板');
  }
  return parts.join(' + ') || '默认配置';
});

watch(() => props.modelValue, (val) => {
  if (val) {
    reset();
  }
});

function reset() {
  currentStep.value = 0;
  selectedPlatform.value = '';
  qrLoading.value = false;
  qrCodeUrl.value = '';
  binding.value = false;
  boundAccount.value = null;
  networkSettings.proxyType = 'none';
  networkSettings.proxyForm = { type: 'http', host: '127.0.0.1', port: 7890, username: '', password: '' };
  networkSettings.fingerprintId = '';
}

function goToStep(index: number) {
  currentStep.value = index;
}

function handleClose() {
  visible.value = false;
}

function handlePrev() {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
}

async function handleNext() {
  if (!selectedPlatform.value) return;
  currentStep.value = 1;
  await fetchQR();
}

async function fetchQR() {
  qrLoading.value = true;
  try {
    if (window.matrixflow?.accounts?.getQRCode) {
      const result = await window.matrixflow.accounts.getQRCode(selectedPlatform.value);
      if (result && result.qrCode) {
        qrCodeUrl.value = result.qrCode;
      }
    }
  } catch (error) {
    ElMessage.error('获取二维码失败');
  } finally {
    qrLoading.value = false;
  }
}

function refreshQR() {
  fetchQR();
}

async function handleBind() {
  binding.value = true;
  try {
    // Simulate binding success for demo - in production this would call actual IPC
    await new Promise((resolve) => setTimeout(resolve, 1000));
    boundAccount.value = {
      id: 'demo-' + Date.now(),
      platform: selectedPlatform.value,
      nickname: currentPlatformLabel.value + '用户',
      avatar: '',
      status: 'online',
      cookieValid: true,
    } as Account;
    currentStep.value = 2;
  } catch {
    ElMessage.error('绑定失败，请重试');
  } finally {
    binding.value = false;
  }
}

function handleFinish() {
  emit('update:modelValue', false);
  emit('success');
}

function handleNetworkSettingsConfirm(settings: NetworkSettings) {
  Object.assign(networkSettings, settings);
}
</script>

<style scoped>
.bind-account-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-2) 0;
}

/* 步骤指示器 */
.bind-account-dialog__steps {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0 var(--space-8);
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  z-index: 1;
}

.step-indicator__number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-page);
  border: 2px solid var(--color-border);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.step-indicator__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.step-indicator--active .step-indicator__number {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.step-indicator--active .step-indicator__label {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.step-indicator--done .step-indicator__number {
  border-color: var(--color-success);
  background: var(--color-success);
  color: #fff;
}

.step-indicator--done .step-indicator__label {
  color: var(--color-success);
}

.step-indicator__line {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 16px;
  height: 2px;
  background: var(--color-border);
  z-index: 0;
}

/* 平台选择网格 */
.platform-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}

.platform-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-3);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.platform-card:hover {
  border-color: var(--color-primary-light);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.platform-card--active {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
}

.platform-card__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
}

.platform-card__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.platform-card__check {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 网络设置按钮 */
.network-setting-trigger {
  display: flex;
  justify-content: flex-start;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-light);
}

/* 二维码区域 */
.qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.qr-placeholder {
  width: 200px;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: var(--color-bg-page);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
}

.qr-image {
  width: 180px;
  height: 180px;
  object-fit: contain;
}

.qr-loading {
  animation: spin 1s linear infinite;
  color: var(--color-primary);
}

.qr-platform-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.qr-platform-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

/* 网络配置预览 */
.network-config-preview {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 完成状态 */
.bind-account-dialog__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6) 0;
}

.done-icon {
  animation: scaleIn 0.3s ease;
}

.done-title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.done-desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.done-account {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-page);
  border-radius: var(--radius-lg);
  margin-top: var(--space-2);
}

.done-account__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.done-account__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

/* 底部按钮 */
.bind-account-dialog__footer {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes scaleIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>