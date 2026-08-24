<template>
  <el-dialog
    v-model="visible"
    title=""
    width="860px"
    destroy-on-close
    :close-on-click-modal="false"
    class="add-account-dialog"
    @close="handleClose"
  >
    <template #header>
      <div class="dialog-header">
        <div class="dialog-header__left">
          <h2 class="dialog-header__title">添加账号</h2>
          <p class="dialog-header__subtitle">选择平台并配置登录方式</p>
        </div>
        <button class="dialog-header__close" @click="handleClose">
          <el-icon :size="18"><Close /></el-icon>
        </button>
      </div>
    </template>

    <!-- 步骤指示器 -->
    <div class="steps-section">
      <div class="steps-track">
        <div class="steps-track__line"></div>
        <div
          class="steps-track__progress"
          :style="{ width: `${(currentStep / (steps.length - 1)) * 100}%` }"
        ></div>
      </div>
      <div class="steps-container">
        <div
          v-for="(stepItem, index) in steps"
          :key="stepItem.key"
          class="step-item"
          :class="{
            'step-item--active': currentStep === index,
            'step-item--done': currentStep > index,
          }"
        >
          <div class="step-item__circle">
            <div v-if="currentStep > index" class="step-item__check">
              <el-icon :size="14"><Check /></el-icon>
            </div>
            <span v-else class="step-item__number">{{ String(index + 1).padStart(2, '0') }}</span>
          </div>
          <span class="step-item__label">{{ stepItem.label }}</span>
          <div
            class="step-item__indicator"
            :class="{ 'step-item__indicator--active': currentStep === index }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Step 1: 选择平台 + 配置模式 -->
    <div v-if="currentStep === 0" class="dialog-body">
      <div class="two-panel">
        <!-- 左面板 — 选择平台 -->
        <div class="panel panel--left">
          <div class="panel__header">
            <div class="panel__title-area">
              <span class="panel__title">选择平台</span>
              <span class="panel__subtitle">请选择需要登录的平台</span>
            </div>
          </div>
              <div class="platform-grid">
                <div
                  v-for="platform in platforms"
                  :key="platform.value"
                  class="platform-card"
                  :class="{ 'platform-card--active': selectedPlatform === platform.value }"
                  :style="{ '--platform-color': platform.color }"
                  @click="selectedPlatform = platform.value"
                >
                  <div class="platform-card__icon" v-html="getPlatformIcon(platform.value)"></div>
                  <span class="platform-card__name">{{ platform.label }}</span>
                </div>
              </div>
        </div>

        <!-- 右面板 — 配置模式 -->
        <div class="panel panel--right">
          <div class="panel__header">
            <div class="panel__title-area">
              <span class="panel__title">配置模式</span>
              <span class="panel__subtitle">根据业务需求选择登录环境</span>
            </div>
          </div>

          <!-- 配置模式卡片 -->
          <div class="config-cards">
            <!-- 快速配置 -->
            <div
              class="config-card"
              :class="{ 'config-card--active': configMode === 'quick' }"
              @click="configMode = 'quick'"
            >
              <div class="config-card__bg"></div>
              <div class="config-card__body">
                <div class="config-card__info">
                  <span class="config-card__title">快速配置</span>
                  <span class="config-card__desc">内嵌浏览器 + 本地指纹 + 本地IP</span>
                </div>
                <span class="config-card__badge config-card__badge--recommend">推荐</span>
              </div>
              <div class="config-card__radio">
                <div v-if="configMode === 'quick'" class="config-card__radio-dot"></div>
              </div>
            </div>

            <!-- 智能配置 -->
            <div
              class="config-card"
              :class="{ 'config-card--active': configMode === 'smart' }"
              @click="configMode = 'smart'"
            >
              <div class="config-card__bg"></div>
              <div class="config-card__body">
                <div class="config-card__info">
                  <span class="config-card__title">智能配置</span>
                  <span class="config-card__desc">AI 风险检测 → 自动推荐最佳配置</span>
                </div>
                <span class="config-card__badge config-card__badge--ai">AI</span>
              </div>
              <div class="config-card__radio">
                <div v-if="configMode === 'smart'" class="config-card__radio-dot"></div>
              </div>
            </div>

            <!-- 自定义配置 -->
            <div
              class="config-card"
              :class="{ 'config-card--active': configMode === 'custom' }"
              @click="configMode = 'custom'"
            >
              <div class="config-card__bg"></div>
              <div class="config-card__body">
                <div class="config-card__info">
                  <span class="config-card__title">自定义配置</span>
                  <span class="config-card__desc">自由选择浏览器、指纹、代理</span>
                </div>
                <span class="config-card__badge config-card__badge--advanced">高级</span>
              </div>
              <div class="config-card__radio">
                <div v-if="configMode === 'custom'" class="config-card__radio-dot"></div>
              </div>
            </div>
          </div>

          <!-- 自定义配置展开 -->
          <div v-if="configMode === 'custom'" class="custom-config-section">
            <div class="config-row">
              <div class="config-item">
                <label class="config-item__label">浏览器类型</label>
                <el-select v-model="browserType" placeholder="选择浏览器" style="width: 100%">
                  <el-option label="内嵌浏览器" value="embedded" />
                  <el-option label="外置 Chrome" value="chrome" />
                  <el-option label="指纹浏览器" value="fingerprint" />
                </el-select>
              </div>
              <div class="config-item">
                <label class="config-item__label">指纹配置</label>
                <el-select v-model="fingerprintId" :placeholder="fingerprintPlaceholder" clearable style="width: 100%">
                  <el-option v-for="fp in fingerprintOptions" :key="fp.id" :label="fp.name" :value="fp.id" />
                </el-select>
              </div>
              <div class="config-item">
                <label class="config-item__label">代理配置</label>
                <el-select v-model="proxyId" :placeholder="proxyPlaceholder" clearable style="width: 100%">
                  <el-option v-for="p in proxyOptions" :key="p.id" :label="`${p.name} (${p.host}:${p.port})`" :value="p.id" />
                </el-select>
              </div>
            </div>

            <div v-if="browserType === 'embedded'" class="config-hint config-hint--embedded">
              <el-icon :size="16"><InfoFilled /></el-icon>
              <p class="config-hint__text">{{ browserTypeHint }}</p>
            </div>

            <div v-if="browserType === 'chrome'" class="config-hint config-hint--chrome">
              <el-icon :size="16"><WarningFilled /></el-icon>
              <p class="config-hint__text">
                外置 Chrome 需要安装指纹修改插件才能使用独立指纹。
                <span class="config-hint__link" @click="openInChrome('https://chromewebstore.google.com/detail/webrtc-network-limiter/npeicpdbkakmehahjeeohfdhnlpdklia')">WebRTC Leak Prevent ↗</span>
              </p>
            </div>

            <div class="config-preview-card">
              <div class="config-preview-card__header">
                <el-icon :size="16"><Document /></el-icon>
                <span>配置预览</span>
              </div>
              <div class="config-preview-card__items">
                <div class="config-preview-item">
                  <span class="config-preview-item__label">浏览器</span>
                  <span class="config-preview-item__value">{{ configPreview.browser }}</span>
                </div>
                <div class="config-preview-item">
                  <span class="config-preview-item__label">指纹</span>
                  <span class="config-preview-item__value">{{ configPreview.fingerprint }}</span>
                </div>
                <div class="config-preview-item">
                  <span class="config-preview-item__label">代理</span>
                  <span class="config-preview-item__value">{{ configPreview.proxy }}</span>
                </div>
                <div class="config-preview-item">
                  <span class="config-preview-item__label">风险等级</span>
                  <span class="config-preview-item__value" :class="`risk--${configPreview.riskLevel}`">
                    {{ configPreview.riskLevel === 'low' ? '低风险' : configPreview.riskLevel === 'medium' ? '中风险' : '高风险' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 智能配置面板 -->
          <div v-if="configMode === 'smart'" class="smart-config-section">
            <div class="ai-analysis-panel">
              <div class="ai-analysis-panel__header">
                <el-icon :size="18"><Warning /></el-icon>
                <span>AI 风险分析</span>
              </div>
              <div v-if="!selectedPlatform" class="ai-analysis-panel__empty">请先选择平台</div>
              <template v-else>
                <div class="ai-analysis-panel__risk-level">
                  <span class="ai-analysis-panel__label">当前风险等级</span>
                  <span class="ai-analysis-panel__risk-badge" :class="`ai-analysis-panel__risk-badge--${aiRiskLevel}`">
                    {{ aiRiskLevel === 'low' ? '低风险' : aiRiskLevel === 'medium' ? '⚠️ 中风险' : '🔴 高风险' }}
                  </span>
                </div>
                <div class="ai-analysis-panel__factors">
                  <span class="ai-analysis-panel__label">检测结果</span>
                  <div class="ai-factor-list">
                    <div class="ai-factor-item">
                      <span class="ai-factor-item__key">本地IP</span>
                      <span class="ai-factor-item__val">{{ riskInfo?.localIP || '本地IP' }}</span>
                    </div>
                    <div class="ai-factor-item">
                      <span class="ai-factor-item__key">同IP同平台账号</span>
                      <span class="ai-factor-item__val">{{ riskInfo?.sameIPCount ?? 0 }} 个</span>
                    </div>
                    <div class="ai-factor-item">
                      <span class="ai-factor-item__key">系统限制</span>
                      <span class="ai-factor-item__val">{{ riskInfo?.limit ?? 5 }} 个</span>
                    </div>
                  </div>
                </div>
                <div class="ai-analysis-panel__recommend">
                  <span class="ai-analysis-panel__label">💡 推荐配置</span>
                  <div class="ai-recommend-list">
                    <div class="ai-recommend-item">
                      <span class="ai-recommend-item__key">浏览器</span>
                      <span class="ai-recommend-item__val">{{ smartRecommend.browser }}</span>
                    </div>
                    <div class="ai-recommend-item">
                      <span class="ai-recommend-item__key">指纹</span>
                      <span class="ai-recommend-item__val">{{ smartRecommend.fingerprint }}</span>
                    </div>
                    <div class="ai-recommend-item">
                      <span class="ai-recommend-item__key">代理</span>
                      <span class="ai-recommend-item__val">{{ smartRecommend.proxy }}</span>
                    </div>
                  </div>
                </div>
                <div class="ai-analysis-panel__actions">
                  <div v-if="!proxyOptions.length && aiRiskLevel !== 'low'" class="ai-analysis-panel__prerequisite">
                    <el-icon :size="14"><Warning /></el-icon>
                    <span>需要先配置代理池才能使用智能配置</span>
                    <el-text size="small" type="info">请在系统设置中添加代理</el-text>
                  </div>
                  <el-button v-else type="primary" @click="applySmartRecommend" :disabled="aiRiskLevel === 'low' && !proxyOptions.length">
                    应用推荐配置
                  </el-button>
                </div>
              </template>
            </div>
          </div>

          <!-- 风险提示横幅 -->
          <div v-if="riskInfo && riskInfo.sameIPCount >= 3" class="risk-warning-banner">
            <el-icon :size="20"><Warning /></el-icon>
            <div class="risk-warning-banner__content">
              <span class="risk-warning-banner__title">风险提示</span>
              <span class="risk-warning-banner__text">
                检测到您已有 <strong>{{ riskInfo.sameIPCount }}</strong> 个 {{ currentPlatformLabel }} 账号使用本地IP，建议使用智能配置或自定义配置
              </span>
            </div>
          </div>

          <!-- 安全提示 -->
          <div class="security-footer">
            <span>当前环境已启用安全检测与行为防护机制</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: 登录中 -->
    <div v-else-if="currentStep === 1" class="dialog-body dialog-body--centered">
      <div class="login-status">
        <div v-if="loginStatus === 'logging_in'" class="login-status__loading">
          <div class="login-status__spinner-wrapper">
            <el-icon class="login-status__spinner" :size="56"><Loading /></el-icon>
          </div>
          <span class="login-status__text">正在启动浏览器...</span>
          <span class="login-status__hint">请稍候，正在为您准备登录环境</span>
        </div>
        <div v-else-if="loginStatus === 'detecting'" class="login-status__detecting">
          <div class="login-status__spinner-wrapper">
            <el-icon class="login-status__spinner" :size="56"><Loading /></el-icon>
          </div>
          <span class="login-status__text">等待登录...</span>
          <span class="login-status__hint">请在浏览器中完成登录操作</span>
          <el-progress :percentage="loginProgress" :show-text="false" :stroke-width="6" class="login-status__progress" />
        </div>
        <div v-else-if="loginStatus === 'failed'" class="login-status__failed">
          <div class="login-status__icon-wrapper login-status__icon-wrapper--danger">
            <el-icon :size="48"><CircleCloseFilled /></el-icon>
          </div>
          <span class="login-status__text">登录失败</span>
          <span class="login-status__error">{{ loginError }}</span>
        </div>
        <div v-else-if="loginStatus === 'timeout'" class="login-status__timeout">
          <div class="login-status__icon-wrapper login-status__icon-wrapper--warning">
            <el-icon :size="48"><WarningFilled /></el-icon>
          </div>
          <span class="login-status__text">登录超时</span>
          <span class="login-status__hint">请检查网络连接后重试</span>
        </div>
      </div>
    </div>

    <!-- Step 3: 完成 -->
    <div v-else-if="currentStep === 2" class="dialog-body dialog-body--centered">
      <div class="login-success">
        <div class="login-success__icon-wrapper">
          <el-icon :size="64"><CircleCheckFilled /></el-icon>
        </div>
        <h3 class="login-success__title">账号绑定成功</h3>
        <p class="login-success__desc">已成功绑定 {{ currentPlatformLabel }} 账号</p>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="dialog-footer__left">
          <span v-if="currentStep === 0" class="dialog-footer__hint">当前环境已启用安全检测与行为防护机制</span>
        </div>
        <div class="dialog-footer__right">
          <el-button v-if="currentStep === 1 && (loginStatus === 'failed' || loginStatus === 'timeout')" @click="handleRetry">
            重试
          </el-button>
          <el-button v-if="currentStep === 1" @click="handleCancel">
            取消
          </el-button>
          <el-button v-if="currentStep === 0" @click="handleClose">
            取消
          </el-button>
          <el-button v-if="currentStep === 0" :disabled="!selectedPlatform" type="primary" @click="handleNext">
            下一步
          </el-button>
          <el-button v-if="currentStep === 2" type="primary" @click="handleFinish">
            完成
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onMounted } from 'vue';
import {
  Check, Loading, CircleCloseFilled, WarningFilled, CircleCheckFilled, Warning, InfoFilled, Close, Document,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAccountStore, type BrowserConfig } from '@/renderer/stores/account';
import { PLATFORM_ICONS } from '@/renderer/constants/platformIcons';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [val: boolean]; success: [] }>();

const accountStore = useAccountStore();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const currentStep = ref(0);
const selectedPlatform = ref('');
const configMode = ref<'quick' | 'smart' | 'custom'>('quick');
const browserType = ref<'embedded' | 'chrome' | 'fingerprint'>('embedded');
const chromePath = ref('');
const fingerprintId = ref<string | null>(null);
const proxyId = ref<string | null>(null);
const loginStatus = ref<'idle' | 'logging_in' | 'detecting' | 'success' | 'failed' | 'timeout' | 'cancelled'>('idle');
const loginError = ref('');
const loginProgress = ref(0);

const steps = [
  { key: 'select', label: '选择平台' },
  { key: 'login', label: '登录' },
  { key: 'done', label: '完成' },
];

const platforms = [
  { label: '抖音', value: 'douyin', color: '#161823' },
  { label: '小红书', value: 'xiaohongshu', color: '#FE2C55' },
  { label: '视频号', value: 'channels', color: '#07C160' },
  { label: '快手', value: 'kuaishou', color: '#FF4906' },
  { label: 'B站', value: 'bilibili', color: '#00A1D6' },
];

function getPlatformIcon(platform: string): string {
  return PLATFORM_ICONS[platform] || '';
}

const fingerprintOptions = ref<Array<{ id: string; name: string }>>([]);
const proxyOptions = ref<Array<{ id: string; name: string; host: string; port: number }>>([]);

const riskInfo = ref<{
  localIP: string;
  sameIPCount: number;
  limit: number;
  riskLevel: 'low' | 'medium' | 'high';
} | null>(null);

const aiRiskLevel = computed(() => {
  if (!riskInfo.value) return 'low';
  return riskInfo.value.riskLevel;
});

const smartRecommend = computed(() => {
  const level = aiRiskLevel.value;
  if (level === 'high') {
    const fpName = fingerprintOptions.value.length
      ? fingerprintOptions.value[0].name
      : '独立指纹（自动生成）';
    const proxyName = proxyOptions.value.length
      ? proxyOptions.value[0].name
      : '请先配置代理池';
    return {
      browser: '内嵌 Patchright',
      fingerprint: fpName,
      proxy: proxyName,
      fingerprintId: fingerprintOptions.value.length ? fingerprintOptions.value[0].id : null,
      proxyId: proxyOptions.value.length ? proxyOptions.value[0].id : null,
    };
  }
  if (level === 'medium') {
    const proxyName = proxyOptions.value.length
      ? proxyOptions.value[0].name
      : '请先配置代理池';
    return {
      browser: '内嵌 Patchright',
      fingerprint: '本地指纹',
      proxy: proxyName,
      fingerprintId: null,
      proxyId: proxyOptions.value.length ? proxyOptions.value[0].id : null,
    };
  }
  return {
    browser: '内嵌 Patchright',
    fingerprint: '本地指纹',
    proxy: '本地IP（无需代理）',
    fingerprintId: null,
    proxyId: null,
  };
});

function applySmartRecommend() {
  browserType.value = 'embedded';
  fingerprintId.value = smartRecommend.value.fingerprintId;
  proxyId.value = smartRecommend.value.proxyId;
}

const currentPlatformLabel = computed(() => {
  return platforms.find((p) => p.value === selectedPlatform.value)?.label || '';
});

const fingerprintPlaceholder = computed(() => {
  switch (browserType.value) {
    case 'embedded': return '默认（本地指纹）';
    case 'chrome': return '默认（本地指纹）';
    case 'fingerprint': return '默认（自动生成）';
    default: return '默认（本地指纹）';
  }
});

const proxyPlaceholder = computed(() => {
  switch (browserType.value) {
    case 'embedded': return '默认（本地IP）';
    case 'chrome': return '默认（本地IP）';
    case 'fingerprint': return '默认（代理IP）';
    default: return '默认（本地IP）';
  }
});

const browserTypeHint = computed(() => {
  if (browserType.value === 'embedded') {
    return '内嵌 Patchright 使用本地真实指纹，防自动化检测能力强（CreepJS: 0% headless）。如需自定义 Canvas/WebGL 指纹，需通过 init scripts 配置。建议高风控平台（小红书、抖音）升级到指纹浏览器。';
  }
  return '';
});

const effectiveRiskLevel = computed(() => {
  let score = 0;
  const baseRisk = riskInfo.value;

  switch (browserType.value) {
    case 'embedded': score += 2; break;
    case 'chrome': score += 3; break;
    case 'fingerprint': score += 1; break;
  }

  if (fingerprintId.value) {
    if (browserType.value === 'chrome') score += 2;
    else score += 0;
  } else {
    if (browserType.value === 'fingerprint') score += 2;
    else score += 1;
  }

  if (!proxyId.value) {
    score += 2;
    if (baseRisk && baseRisk.sameIPCount >= 3) score += 1;
  }

  if (score <= 3) return 'low';
  if (score <= 5) return 'medium';
  return 'high';
});

const configPreview = computed(() => {
  const browserLabel = {
    embedded: '内嵌浏览器',
    chrome: '外置 Chrome',
    fingerprint: '指纹浏览器',
  }[browserType.value];

  let fingerprintLabel: string;
  if (browserType.value === 'chrome' && fingerprintId.value) {
    fingerprintLabel = (fingerprintOptions.value.find(f => f.id === fingerprintId.value)?.name || '独立指纹') + '（需插件）';
  } else if (fingerprintId.value) {
    fingerprintLabel = fingerprintOptions.value.find(f => f.id === fingerprintId.value)?.name || '独立指纹';
  } else if (browserType.value === 'fingerprint') {
    fingerprintLabel = '独立指纹（自动生成）';
  } else {
    fingerprintLabel = '本地指纹';
  }

  let proxyLabel: string;
  if (proxyId.value) {
    proxyLabel = proxyOptions.value.find(p => p.id === proxyId.value)?.name || '代理IP';
  } else {
    proxyLabel = '本地IP';
  }

  return {
    browser: browserLabel,
    fingerprint: fingerprintLabel,
    proxy: proxyLabel,
    riskLevel: effectiveRiskLevel.value,
  };
});

let progressInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;

async function loadOptions() {
  try {
    const [fpResult, proxyResult] = await Promise.all([
      window.matrixflow.fingerprint.list(),
      window.matrixflow.proxy.list(),
    ]);

    if (fpResult.success && fpResult.data) {
      fingerprintOptions.value = fpResult.data.map((f: any) => ({
        id: f.id,
        name: f.name,
      }));
    }

    if (proxyResult.success && proxyResult.data) {
      proxyOptions.value = proxyResult.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        host: p.host,
        port: p.port,
      }));
    }
  } catch (error) {
    console.error('Failed to load options:', error);
  }
}

async function detectRisk() {
  if (!selectedPlatform.value) return;

  try {
    const [accountsResult, limitResult] = await Promise.all([
      window.matrixflow.accounts.list(),
      window.matrixflow.ipLimit.check(selectedPlatform.value),
    ]);

    const accounts = accountsResult || [];
    const platformAccounts = accounts.filter((a: any) => a.platform === selectedPlatform.value);

    const platformCount = limitResult?.data?.platformCount ?? platformAccounts.length;
    const platformLimit = limitResult?.data?.platformLimit ?? 5;
    const exceeded = limitResult?.data?.exceeded ?? false;

    riskInfo.value = {
      localIP: '本地IP',
      sameIPCount: platformCount,
      limit: platformLimit,
      riskLevel: exceeded ? 'high' : platformCount >= platformLimit * 0.6 ? 'medium' : 'low',
    };
  } catch (error) {
    console.error('Failed to detect risk:', error);
  }
}

watch(() => props.modelValue, async (val) => {
  if (val) {
    reset();
    await loadOptions();
    unsubscribe = accountStore.setupLoginListeners();
  } else {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
});

watch(selectedPlatform, () => {
  detectRisk();
});

watch(configMode, (mode) => {
  if (mode === 'quick') {
    browserType.value = 'embedded';
    fingerprintId.value = null;
    proxyId.value = null;
  }
});

watch(() => accountStore.loginState.status, (status) => {
  loginStatus.value = status;
  
  if (status === 'success') {
    currentStep.value = 2;
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  } else if (status === 'failed' || status === 'timeout') {
    loginError.value = accountStore.loginState.error || '未知错误';
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
  if (progressInterval) {
    clearInterval(progressInterval);
  }
});

function reset() {
  currentStep.value = 0;
  selectedPlatform.value = '';
  configMode.value = 'quick';
  browserType.value = 'embedded';
  chromePath.value = '';
  fingerprintId.value = null;
  proxyId.value = null;
  loginStatus.value = 'idle';
  loginError.value = '';
  loginProgress.value = 0;
  riskInfo.value = null;
  accountStore.resetLoginState();
}

function handleClose() {
  visible.value = false;
}

async function handleNext() {
  if (!selectedPlatform.value) return;
  
  currentStep.value = 1;
  loginStatus.value = 'logging_in';
  loginProgress.value = 0;

  progressInterval = setInterval(() => {
    if (loginProgress.value < 95) {
      loginProgress.value += Math.random() * 3;
    }
  }, 500);

  const browserConfig: BrowserConfig = {
    type: browserType.value,
    executablePath: browserType.value === 'chrome' ? chromePath.value : undefined,
    fingerprintId: browserType.value === 'fingerprint' ? (fingerprintId.value || undefined) : (configMode.value === 'custom' ? (fingerprintId.value || undefined) : undefined),
    proxyId: configMode.value === 'custom' ? (proxyId.value || undefined) : undefined,
  };

  try {
    await accountStore.startLogin(selectedPlatform.value, browserConfig);
  } catch (error) {
    loginStatus.value = 'failed';
    loginError.value = String(error);
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
}

function handleCancel() {
  accountStore.cancelLogin();
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  visible.value = false;
}

function handleRetry() {
  handleNext();
}

function handleFinish() {
  emit('update:modelValue', false);
  emit('success');
}

async function selectChromePath() {
  ElMessage.info('请在设置中配置 Chrome 路径');
}

async function openInChrome(url: string) {
  const result = await window.matrixflow.browser.openUrl(url);
  if (!result.success) {
    ElMessage.warning(result.message || 'Chrome 浏览器路径未配置，请在系统设置中配置');
  }
}
</script>

<style scoped>
/* ===== 弹窗基础覆盖 ===== */
.add-account-dialog :deep(.el-dialog) {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.add-account-dialog :deep(.el-dialog__header) {
  padding: 0;
  margin: 0;
}

.add-account-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.add-account-dialog :deep(.el-dialog__footer) {
  padding: 0;
}

/* ===== 头部 ===== */
.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.dialog-header__left {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.dialog-header__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.3;
  letter-spacing: 0.02em;
}

.dialog-header__subtitle {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.dialog-header__close {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.dialog-header__close:hover {
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  border-color: var(--color-text-placeholder);
}

/* ===== 步骤指示器 ===== */
.steps-section {
  position: relative;
  padding: var(--space-3) var(--space-10) var(--space-2);
}

.steps-track {
  position: absolute;
  left: calc(16% + 22px);
  right: calc(16% + 22px);
  top: calc(var(--space-3) + 22px);
  height: 2px;
}

.steps-track__line {
  position: absolute;
  inset: 0;
  background: var(--color-border);
  border-radius: 1px;
}

.steps-track__progress {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--color-primary);
  border-radius: 1px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.3);
}

.steps-container {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  max-width: 520px;
  margin: 0 auto;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  flex: 1;
}

.step-item__circle {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
  background: var(--color-bg-card);
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-sm);
}

.step-item__number {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-placeholder);
  letter-spacing: 0.1em;
  transition: color 0.35s;
}

.step-item__check {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.step-item__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  transition: color 0.35s;
}

.step-item__indicator {
  width: 24px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-border);
  transition: all 0.35s;
}

.step-item__indicator--active {
  width: 40px;
  background: var(--color-primary);
  box-shadow: 0 0 12px rgba(37, 99, 235, 0.45);
}

.step-item--active .step-item__circle {
  border-color: var(--color-primary);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12), 0 8px 24px rgba(37, 99, 235, 0.2);
}

.step-item--active .step-item__number {
  color: #fff;
}

.step-item--active .step-item__label {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

.step-item--done .step-item__circle {
  border-color: var(--color-success);
  background: var(--color-success);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.10);
}

.step-item--done .step-item__label {
  color: var(--color-success);
}

.step-item--done .step-item__indicator {
  background: var(--color-success);
}

/* ===== 内容区域 ===== */
.dialog-body {
  padding: 0 var(--space-5) var(--space-4);
}

.dialog-body--centered {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

/* ===== 两面板布局 ===== */
.two-panel {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: var(--space-4);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.panel--left {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
}

.panel--right {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}

.panel--right::before {
  content: '';
  position: absolute;
  top: -80px;
  right: -80px;
  width: 200px;
  height: 200px;
  background: var(--color-primary-lighter);
  opacity: 0.3;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}

.panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.panel__title-area {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.panel__subtitle {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.panel__badge {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border: 1px solid rgba(37, 99, 235, 0.15);
}

.panel__badge--secure {
  width: auto;
  height: auto;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border: 1px solid rgba(37, 99, 235, 0.15);
  white-space: nowrap;
}

/* ===== 平台网格 ===== */
.platform-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.platform-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 6px 12px;
  flex: 0 0 calc((100% - 16px) / 3);
  min-width: 80px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.platform-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(37,99,235,0.02) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.25s;
}

.platform-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-light);
  box-shadow: 0 8px 25px rgba(15,23,42,0.08);
}

.platform-card:hover::before {
  opacity: 1;
}

.platform-card--active {
  background: linear-gradient(135deg, var(--color-primary-lighter) 0%, #eff6ff 100%);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1), 0 8px 25px rgba(37,99,235,0.08);
}

.platform-card--active .platform-card__icon {
  background: var(--platform-color);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.platform-card--active .platform-card__icon :deep(svg) {
  filter: brightness(0) saturate(100%) invert(1);
}

.platform-card__icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border-radius: 14px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  overflow: hidden;
}

.platform-card__icon :deep(svg) {
  width: 30px;
  height: 30px;
}

.platform-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  text-align: center;
  letter-spacing: 0.3px;
}

/* ===== 配置卡片 ===== */
.config-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  position: relative;
  z-index: 1;
}

.config-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-bg-page);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.config-card__bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.06) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.25s;
}

.config-card:hover {
  border-color: var(--color-primary-light);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-md);
}

.config-card:hover .config-card__bg {
  opacity: 1;
}

.config-card--active {
  border-color: var(--color-primary);
  background: linear-gradient(90deg, var(--color-primary-lighter) 0%, #fff 100%);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.06), 0 4px 16px rgba(37, 99, 235, 0.08);
}

.config-card__body {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  z-index: 1;
}

.config-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-card__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.config-card__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
  max-width: 240px;
}

.config-card__badge {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  border: 1px solid transparent;
  white-space: nowrap;
}

.config-card__badge--recommend {
  background: var(--color-primary);
  color: #fff;
}

.config-card__badge--ai {
  background: #f3e8ff;
  color: #7c3aed;
  border-color: rgba(124, 58, 237, 0.2);
}

.config-card__badge--advanced {
  background: var(--color-bg-page);
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}

.config-card__radio {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.config-card--active .config-card__radio {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.config-card__radio-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
}

/* ===== 自定义配置区域 ===== */
.custom-config-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-page);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  position: relative;
  z-index: 1;
  animation: slideDown 0.25s ease;
}

.config-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.config-item__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.config-hint {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.config-hint--embedded {
  background: var(--color-primary-lighter);
  color: var(--color-primary-dark);
  border: 1px solid rgba(37, 99, 235, 0.15);
}

.config-hint--chrome {
  background: var(--color-warning-light);
  color: #92400e;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.config-hint__text {
  margin: 0;
  flex: 1;
}

.config-hint__link {
  color: #d97706;
  cursor: pointer;
  font-weight: var(--font-weight-medium);
  text-decoration: underline;
}

.config-preview-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.config-preview-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-page);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-light);
}

.config-preview-card__items {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: var(--color-border-light);
}

.config-preview-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-card);
  font-size: var(--font-size-xs);
}

.config-preview-item__label {
  color: var(--color-text-secondary);
}

.config-preview-item__value {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.risk--low { color: var(--color-success); }
.risk--medium { color: var(--color-warning); }
.risk--high { color: var(--color-danger); }

/* ===== 智能配置区域 ===== */
.smart-config-section {
  position: relative;
  z-index: 1;
  animation: slideDown 0.25s ease;
}

.ai-analysis-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-page);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  border-left: 3px solid #8b5cf6;
}

.ai-analysis-panel__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: #7c3aed;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.ai-analysis-panel__empty {
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
}

.ai-analysis-panel__risk-level {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-analysis-panel__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.ai-analysis-panel__risk-badge {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.ai-analysis-panel__risk-badge--low {
  color: var(--color-success);
  background: var(--color-success-light);
}

.ai-analysis-panel__risk-badge--medium {
  color: var(--color-warning);
  background: var(--color-warning-light);
}

.ai-analysis-panel__risk-badge--high {
  color: var(--color-danger);
  background: var(--color-danger-light);
}

.ai-analysis-panel__factors {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ai-analysis-panel__recommend {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ai-factor-list,
.ai-recommend-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ai-factor-item,
.ai-recommend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs);
}

.ai-factor-item__key,
.ai-recommend-item__key {
  color: var(--color-text-secondary);
}

.ai-factor-item__val {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.ai-recommend-item__val {
  color: #7c3aed;
  font-weight: var(--font-weight-medium);
}

.ai-analysis-panel__prerequisite {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

.ai-analysis-panel__actions {
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-light);
}

/* ===== 风险提示横幅 ===== */
.risk-warning-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-warning-light);
  border-radius: var(--radius-md);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #92400e;
  font-size: var(--font-size-xs);
  position: relative;
  z-index: 1;
}

.risk-warning-banner__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.risk-warning-banner__title {
  font-weight: var(--font-weight-semibold);
}

.risk-warning-banner__text {
  color: #78350f;
}

/* ===== 安全提示 ===== */
.security-footer {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-light);
  position: relative;
  z-index: 1;
}

/* ===== 登录状态 ===== */
.login-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) 0;
}

.login-status__spinner-wrapper {
  animation: pulse 2s ease-in-out infinite;
}

.login-status__spinner {
  animation: spin 1s linear infinite;
  color: var(--color-primary);
}

.login-status__text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-status__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.login-status__error {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}

.login-status__progress {
  width: 280px;
}

.login-status__icon-wrapper {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-status__icon-wrapper--danger {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

.login-status__icon-wrapper--warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
}

/* ===== 成功状态 ===== */
.login-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) 0;
}

.login-success__icon-wrapper {
  color: var(--color-success);
  animation: scaleIn 0.3s ease;
}

.login-success__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-success__desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* ===== 底部 ===== */
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
}

.dialog-footer__left {
  flex: 1;
}

.dialog-footer__hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.dialog-footer__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* ===== 动画 ===== */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes scaleIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
