<template>
  <div class="ip-limit-settings">
    <div v-if="loading" class="ip-limit-settings__loading">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <span>加载设置...</span>
    </div>

    <div v-else class="ip-limit-settings__content">
      <!-- 全局限制 -->
      <div class="settings-section">
        <h4 class="settings-section__title">
          <el-icon><Setting /></el-icon>
          <span>全局限制</span>
        </h4>
        
        <el-form label-width="140px" size="default">
          <el-form-item label="同IP同平台最大账号数">
            <el-input-number
              v-model="settings.global.maxAccountsPerIPPerPlatform"
              :min="1"
              :max="100"
              @change="markDirty"
            />
            <span class="form-hint">同一IP地址下，同一平台的账号数量上限</span>
          </el-form-item>

          <el-form-item label="同IP总账号数">
            <el-input-number
              v-model="settings.global.maxAccountsPerIPTotal"
              :min="1"
              :max="500"
              @change="markDirty"
            />
            <span class="form-hint">同一IP地址下，所有平台的账号数量上限</span>
          </el-form-item>

          <el-form-item label="达到限制后">
            <el-radio-group v-model="settings.global.behaviorOnLimit" @change="markDirty">
              <el-radio value="warn">
                <span class="radio-option">
                  <span class="radio-option__label">显示警告</span>
                  <span class="radio-option__desc">提示风险，但允许继续添加</span>
                </span>
              </el-radio>
              <el-radio value="block">
                <span class="radio-option">
                  <span class="radio-option__label">禁止添加</span>
                  <span class="radio-option__desc">达到限制后无法添加新账号</span>
                </span>
              </el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </div>

      <!-- 平台差异化限制 -->
      <div class="settings-section">
        <h4 class="settings-section__title">
          <el-icon><Grid /></el-icon>
          <span>平台差异化限制</span>
        </h4>

        <div class="platform-limit-toggle">
          <el-switch
            v-model="settings.platformSpecific.enabled"
            @change="markDirty"
          />
          <span>启用平台差异化限制</span>
        </div>

        <div v-if="settings.platformSpecific.enabled" class="platform-limits">
          <div
            v-for="platform in platformLimits"
            :key="platform.id"
            class="platform-limit-item"
          >
            <div class="platform-limit-item__info">
              <span class="platform-limit-item__icon">{{ platform.icon }}</span>
              <span class="platform-limit-item__name">{{ platform.name }}</span>
              <span class="platform-limit-item__risk" :class="`risk--${platform.riskLevel}`">
                {{ platform.riskLabel }}
              </span>
            </div>
            <el-input-number
              v-model="platform.maxAccounts"
              :min="1"
              :max="settings.global.maxAccountsPerIPPerPlatform"
              size="small"
              @change="markDirty"
            />
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="settings-actions">
        <el-button @click="resetToDefault">恢复默认</el-button>
        <el-button type="primary" :disabled="!dirty" @click="saveSettings">
          保存设置
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Loading, Setting, Grid } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

interface IPLimitSettings {
  global: {
    maxAccountsPerIPPerPlatform: number;
    maxAccountsPerIPTotal: number;
    behaviorOnLimit: 'block' | 'warn';
  };
  platformSpecific: {
    enabled: boolean;
    limits: Array<{
      platform: string;
      maxAccounts: number;
    }>;
  };
}

const loading = ref(false);
const dirty = ref(false);

const settings = reactive<IPLimitSettings>({
  global: {
    maxAccountsPerIPPerPlatform: 5,
    maxAccountsPerIPTotal: 20,
    behaviorOnLimit: 'warn',
  },
  platformSpecific: {
    enabled: false,
    limits: [],
  },
});

const platformLimits = reactive([
  { id: 'xiaohongshu', name: '小红书', icon: '📕', riskLevel: 'high', riskLabel: '高风控', maxAccounts: 3 },
  { id: 'douyin', name: '抖音', icon: '🎵', riskLevel: 'high', riskLabel: '高风控', maxAccounts: 5 },
  { id: 'channels', name: '视频号', icon: '📺', riskLevel: 'medium', riskLabel: '中风控', maxAccounts: 5 },
  { id: 'kuaishou', name: '快手', icon: '⚡', riskLevel: 'medium', riskLabel: '中风控', maxAccounts: 8 },
  { id: 'bilibili', name: 'B站', icon: '📺', riskLevel: 'low', riskLabel: '低风控', maxAccounts: 10 },
]);

function markDirty() {
  dirty.value = true;
}

async function loadSettings() {
  loading.value = true;
  try {
    const result = await window.matrixflow.ipLimit.get();
    if (result.success && result.data) {
      Object.assign(settings.global, result.data.global);
      Object.assign(settings.platformSpecific, result.data.platformSpecific);
      
      // 同步平台限制值
      if (result.data.platformSpecific.limits) {
        for (const limit of result.data.platformSpecific.limits) {
          const platform = platformLimits.find(p => p.id === limit.platform);
          if (platform) {
            platform.maxAccounts = limit.maxAccounts;
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load IP limit settings:', error);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  // 构建平台限制数组
  settings.platformSpecific.limits = platformLimits.map(p => ({
    platform: p.id,
    maxAccounts: p.maxAccounts,
  }));

  try {
    const result = await window.matrixflow.ipLimit.save(settings);
    if (result.success) {
      ElMessage.success('设置已保存');
      dirty.value = false;
    } else {
      ElMessage.error(result.message || '保存失败');
    }
  } catch (error) {
    ElMessage.error('保存设置失败');
    console.error('Failed to save IP limit settings:', error);
  }
}

function resetToDefault() {
  settings.global.maxAccountsPerIPPerPlatform = 5;
  settings.global.maxAccountsPerIPTotal = 20;
  settings.global.behaviorOnLimit = 'warn';
  settings.platformSpecific.enabled = false;
  
  platformLimits[0].maxAccounts = 3; // 小红书
  platformLimits[1].maxAccounts = 5; // 抖音
  platformLimits[2].maxAccounts = 5; // 视频号
  platformLimits[3].maxAccounts = 8; // 快手
  platformLimits[4].maxAccounts = 10; // B站
  
  dirty.value = true;
}

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.ip-limit-settings {
  padding: var(--space-4);
}

.ip-limit-settings__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8);
  color: var(--color-text-secondary);
}

.ip-limit-settings__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.settings-section {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.settings-section__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-4) 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.form-hint {
  margin-left: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.radio-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-option__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.radio-option__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.platform-limit-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.platform-limits {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.platform-limit-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
}

.platform-limit-item__info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.platform-limit-item__icon {
  font-size: var(--font-size-lg);
}

.platform-limit-item__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.platform-limit-item__risk {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.platform-limit-item__risk.risk--high {
  background: var(--color-danger-lighter, #FFF1F0);
  color: var(--color-danger, #F5222D);
}

.platform-limit-item__risk.risk--medium {
  background: var(--color-warning-lighter, #FFF7E6);
  color: var(--color-warning, #FA8C16);
}

.platform-limit-item__risk.risk--low {
  background: var(--color-success-lighter, #F6FFED);
  color: var(--color-success, #52C41A);
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-light);
}
</style>
