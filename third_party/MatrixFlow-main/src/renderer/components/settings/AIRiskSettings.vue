<template>
  <div class="ai-risk-settings">
    <div v-if="loading" class="ai-risk-settings__loading">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <span>加载设置...</span>
    </div>

    <div v-else class="ai-risk-settings__content">
      <div class="settings-section">
        <h4 class="settings-section__title">
          <el-icon><Setting /></el-icon>
          <span>基础设置</span>
        </h4>

        <el-form label-width="140px" size="default">
          <el-form-item label="风险检测灵敏度">
            <el-radio-group v-model="settings.sensitivity" @change="markDirty">
              <el-radio-button value="low">低（较少提示）</el-radio-button>
              <el-radio-button value="medium">中（平衡）</el-radio-button>
              <el-radio-button value="high">高（敏感提示）</el-radio-button>
            </el-radio-group>
            <div class="form-hint">灵敏度越高，风险提示越频繁</div>
          </el-form-item>

          <el-form-item label="风险提示阈值">
            <el-radio-group v-model="settings.alertThreshold" @change="markDirty">
              <el-radio-button value="low">低风险时提示</el-radio-button>
              <el-radio-button value="medium">中风险时提示</el-radio-button>
              <el-radio-button value="high">高风险时提示</el-radio-button>
            </el-radio-group>
            <div class="form-hint">达到该等级时在添加账号时显示风险提示</div>
          </el-form-item>
        </el-form>
      </div>

      <div class="settings-section">
        <h4 class="settings-section__title">
          <el-icon><DataAnalysis /></el-icon>
          <span>高级设置</span>
        </h4>

        <el-form label-width="140px" size="default">
          <el-form-item label="风险因素权重">
            <div class="weight-sliders">
              <div class="weight-slider">
                <span class="weight-slider__label">同IP账号数量</span>
                <el-slider
                  v-model="weights.sameIPAccounts"
                  :min="0"
                  :max="100"
                  :step="5"
                  :format-tooltip="(v: number) => (v / 100).toFixed(2)"
                  @change="onWeightChange"
                />
                <span class="weight-slider__value">{{ (weights.sameIPAccounts / 100).toFixed(2) }}</span>
              </div>
              <div class="weight-slider">
                <span class="weight-slider__label">平台风控程度</span>
                <el-slider
                  v-model="weights.platformRisk"
                  :min="0"
                  :max="100"
                  :step="5"
                  :format-tooltip="(v: number) => (v / 100).toFixed(2)"
                  @change="onWeightChange"
                />
                <span class="weight-slider__value">{{ (weights.platformRisk / 100).toFixed(2) }}</span>
              </div>
              <div class="weight-slider">
                <span class="weight-slider__label">账号历史行为</span>
                <el-slider
                  v-model="weights.accountHistory"
                  :min="0"
                  :max="100"
                  :step="5"
                  :format-tooltip="(v: number) => (v / 100).toFixed(2)"
                  @change="onWeightChange"
                />
                <span class="weight-slider__value">{{ (weights.accountHistory / 100).toFixed(2) }}</span>
              </div>
            </div>
            <div v-if="weightSumError" class="weight-error">{{ weightSumError }}</div>
            <div v-else class="form-hint">权重总和：{{ weightSum }}（需等于 1.00）</div>
          </el-form-item>
        </el-form>
      </div>

      <div class="settings-section">
        <h4 class="settings-section__title">
          <el-icon><InfoFilled /></el-icon>
          <span>平台风控权重（预设值）</span>
        </h4>
        <div class="platform-weights">
          <div v-for="pw in platformWeightList" :key="pw.name" class="platform-weight-item">
            <span class="platform-weight-item__name">{{ pw.name }}</span>
            <el-progress
              :percentage="pw.value * 100"
              :stroke-width="8"
              :color="pw.color"
              :show-text="false"
              class="platform-weight-item__bar"
            />
            <span class="platform-weight-item__value">{{ pw.value.toFixed(1) }}</span>
          </div>
        </div>
      </div>

      <div class="ai-risk-settings__actions">
        <el-button type="primary" :disabled="!dirty" @click="saveSettings">保存设置</el-button>
        <el-button @click="resetSettings">恢复默认</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Setting, DataAnalysis, InfoFilled } from '@element-plus/icons-vue';

const loading = ref(true);
const dirty = ref(false);

const settings = reactive({
  sensitivity: 'medium' as 'low' | 'medium' | 'high',
  alertThreshold: 'medium' as 'low' | 'medium' | 'high',
});

const weights = reactive({
  sameIPAccounts: 40,
  platformRisk: 30,
  accountHistory: 30,
});

const platformWeights = reactive<Record<string, number>>({
  xiaohongshu: 1.0,
  douyin: 0.9,
  channels: 0.7,
  kuaishou: 0.6,
  bilibili: 0.3,
});

const platformWeightList = computed(() => [
  { name: '小红书', value: platformWeights.xiaohongshu, color: 'var(--color-plat-xiaohongshu)' },
  { name: '抖音', value: platformWeights.douyin, color: 'var(--color-plat-douyin)' },
  { name: '视频号', value: platformWeights.channels, color: 'var(--color-plat-wechat)' },
  { name: '快手', value: platformWeights.kuaishou, color: 'var(--color-plat-kuaishou)' },
  { name: 'B站', value: platformWeights.bilibili, color: 'var(--color-plat-bilibili)' },
]);

const weightSum = computed(() => ((weights.sameIPAccounts + weights.platformRisk + weights.accountHistory) / 100).toFixed(2));

const weightSumError = computed(() => {
  const sum = weights.sameIPAccounts + weights.platformRisk + weights.accountHistory;
  if (sum !== 100) return `权重总和必须为 1.00，当前为 ${(sum / 100).toFixed(2)}`;
  return '';
});

function markDirty() {
  dirty.value = true;
}

function onWeightChange() {
  dirty.value = true;
}

async function loadSettings() {
  loading.value = true;
  try {
    if (!window.matrixflow?.aiRisk?.getSettings) return;
    const s = await window.matrixflow.aiRisk.getSettings();
    if (s) {
      settings.sensitivity = s.sensitivity || 'medium';
      settings.alertThreshold = s.alertThreshold || 'medium';
      if (s.weights) {
        weights.sameIPAccounts = Math.round((s.weights.sameIPAccounts ?? 0.4) * 100);
        weights.platformRisk = Math.round((s.weights.platformRisk ?? 0.3) * 100);
        weights.accountHistory = Math.round((s.weights.accountHistory ?? 0.3) * 100);
      }
      if (s.platformRiskWeights) {
        Object.assign(platformWeights, s.platformRiskWeights);
      }
    }
  } finally {
    loading.value = false;
    dirty.value = false;
  }
}

async function saveSettings() {
  if (weightSumError.value) {
    ElMessage.error(weightSumError.value);
    return;
  }
  if (!window.matrixflow?.aiRisk?.updateSettings) return;
  await window.matrixflow.aiRisk.updateSettings({
    sensitivity: settings.sensitivity,
    alertThreshold: settings.alertThreshold,
    weights: {
      sameIPAccounts: weights.sameIPAccounts / 100,
      platformRisk: weights.platformRisk / 100,
      accountHistory: weights.accountHistory / 100,
    },
    platformRiskWeights: { ...platformWeights },
  });
  dirty.value = false;
  ElMessage.success('设置已保存');
}

function resetSettings() {
  settings.sensitivity = 'medium';
  settings.alertThreshold = 'medium';
  weights.sameIPAccounts = 40;
  weights.platformRisk = 30;
  weights.accountHistory = 30;
  platformWeights.xiaohongshu = 1.0;
  platformWeights.douyin = 0.9;
  platformWeights.channels = 0.7;
  platformWeights.kuaishou = 0.6;
  platformWeights.bilibili = 0.3;
  dirty.value = true;
}

onMounted(loadSettings);
</script>

<style scoped>
.ai-risk-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ai-risk-settings__loading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  padding: var(--space-4);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.settings-section__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.form-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  margin-top: var(--space-1);
}

.weight-sliders {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.weight-slider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.weight-slider__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  width: 100px;
  flex-shrink: 0;
}

.weight-slider :deep(.el-slider) {
  flex: 1;
}

.weight-slider__value {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  color: var(--color-text-primary);
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

.weight-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
  margin-top: var(--space-1);
}

.platform-weights {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.platform-weight-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.platform-weight-item__name {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  width: 56px;
  flex-shrink: 0;
}

.platform-weight-item__bar {
  flex: 1;
}

.platform-weight-item__value {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  color: var(--color-text-primary);
  width: 28px;
  text-align: right;
  flex-shrink: 0;
}

.ai-risk-settings__actions {
  display: flex;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-light);
}
</style>
