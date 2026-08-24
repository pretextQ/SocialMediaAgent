<template>
  <div class="fingerprint-settings">
    <div class="section-header">
      <div class="section-header__left">
        <h3>指纹模板管理</h3>
        <span class="section-header__desc">为指纹浏览器创建和管理浏览器指纹配置</span>
      </div>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新建模板
      </el-button>
    </div>

    <div class="fingerprint-mode-hint">
      <div class="fingerprint-mode-hint__icon">
        <el-icon :size="16"><InfoFilled /></el-icon>
      </div>
      <div class="fingerprint-mode-hint__content">
        <p class="fingerprint-mode-hint__text">指纹配置仅在「外置指纹浏览器」模式下生效。指纹模板依赖 fingerprint-chromium 的 --fingerprint 系列参数，普通浏览器（Patchright / Chrome）不支持这些参数。</p>
        <p class="fingerprint-mode-hint__action">
          <el-link type="primary" @click.prevent="openInChrome('https://github.com/AdrYfish/fingerprint-chromium')" target="_blank" underline="never">
            下载指纹浏览器 →
          </el-link>
        </p>
      </div>
    </div>

    <div class="search-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索模板名称..."
        clearable
        style="width: 280px"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <div v-loading="loading" class="template-list">
      <div
        v-for="tpl in filteredTemplates"
        :key="tpl.id"
        class="template-card"
      >
        <div class="template-card__main">
          <div class="template-card__header">
            <span class="template-card__name">{{ tpl.name }}</span>
            <div class="template-card__tags">
              <el-tag size="small" effect="plain">{{ getPlatformLabel(tpl.platform) }}</el-tag>
              <el-tag size="small" effect="plain" type="info">{{ tpl.brand }}</el-tag>
              <el-tag v-if="tpl.disable_non_proxied_udp === 1" size="small" effect="plain" type="success">WebRTC 保护</el-tag>
              <el-tag v-else size="small" effect="plain" type="warning">WebRTC 未保护</el-tag>
            </div>
          </div>
          <div class="template-card__meta">
            <span>{{ tpl.screen_width }}×{{ tpl.screen_height }}</span>
            <span class="meta-sep">·</span>
            <span>{{ tpl.lang }}</span>
            <span class="meta-sep">·</span>
            <span>创建于 {{ formatDate(tpl.created_at) }}</span>
          </div>
        </div>
        <div class="template-card__actions">
          <el-button size="small" @click="showEditDialog(tpl)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="deleteTemplate(tpl)">删除</el-button>
        </div>
      </div>

      <el-empty v-if="!loading && filteredTemplates.length === 0" description="暂无指纹模板，点击上方按钮创建" />
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑指纹模板' : '新建指纹模板'"
      width="780px"
      :close-on-click-modal="false"
      top="5vh"
    >
      <div class="dialog-body">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">

          <div class="form-section">
            <div class="form-section__label">基本信息</div>
            <el-form-item label="模板名称" prop="name">
              <el-input
                v-model="form.name"
                placeholder="请输入模板名称"
                maxlength="20"
                show-word-limit
              />
            </el-form-item>
          </div>

          <div class="form-section">
            <div class="form-section__label">常用配置</div>
            <el-form-item label="指纹种子" prop="seed">
              <FingerprintSeedInput v-model="form.seed" @seed-generated="onSeedGenerated" />
            </el-form-item>
            <div class="form-row">
              <el-form-item label="操作系统" prop="platform">
                <el-select v-model="form.platform" placeholder="选择操作系统" style="width: 100%">
                  <el-option label="Windows" value="windows" />
                  <el-option label="Linux" value="linux" />
                  <el-option label="macOS" value="macos" />
                </el-select>
              </el-form-item>
              <el-form-item label="浏览器品牌" prop="brand">
                <el-select v-model="form.brand" placeholder="选择浏览器品牌" style="width: 100%">
                  <el-option label="Chrome" value="Chrome" />
                  <el-option label="Edge" value="Edge" />
                  <el-option label="Opera" value="Opera" />
                  <el-option label="Vivaldi" value="Vivaldi" />
                </el-select>
              </el-form-item>
            </div>
            <div class="webrtc-row">
              <div class="webrtc-switch">
                <el-switch v-model="disableUdp" />
                <span class="webrtc-label">禁用非代理 UDP（WebRTC 策略）</span>
              </div>
              <span class="webrtc-hint">建议开启以保护真实 IP</span>
            </div>
          </div>

          <el-collapse v-model="activeCollapse" class="advanced-collapse">
            <FingerprintAdvancedConfig v-model="advancedData" />
          </el-collapse>

          <div class="form-section">
            <div class="form-section__label">自定义参数</div>
            <FingerprintCustomParams v-model="form.custom_params" />
          </div>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { Search, Plus, InfoFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';

import FingerprintSeedInput from './FingerprintSeedInput.vue';
import FingerprintAdvancedConfig from './FingerprintAdvancedConfig.vue';
import type { AdvancedData } from './FingerprintAdvancedConfig.vue';
import FingerprintCustomParams from './FingerprintCustomParams.vue';

interface FingerprintTemplate {
  id: string;
  name: string;
  seed: number | null;
  platform: 'windows' | 'linux' | 'macos';
  platform_version: string | null;
  brand: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi';
  brand_version: string | null;
  hardware_concurrency: number | null;
  gpu_vendor: string | null;
  gpu_renderer: string | null;
  disable_non_proxied_udp: number;
  lang: string;
  accept_lang: string;
  timezone: string;
  custom_params: string;
  user_agent: string | null;
  screen_width: number;
  screen_height: number;
  created_at: string;
  updated_at: string;
}

const templates = ref<FingerprintTemplate[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const searchKeyword = ref('');

const disableUdp = ref(false);
const activeCollapse = ref<string[]>(['advanced']);
const advancedData = ref<AdvancedData>({
  lang: '',
  accept_lang: '',
  timezone: '',
  platform_version: null,
  brand_version: null,
  hardware_concurrency: null,
  gpu_vendor: null,
  gpu_renderer: null,
});

const defaultForm = {
  name: '',
  seed: null as number | null,
  platform: 'windows' as const,
  brand: 'Chrome' as const,
  custom_params: '',
  screen_width: 1920,
  screen_height: 1080,
  disable_non_proxied_udp: 0,
};

const form = reactive({ ...defaultForm });

const rules: FormRules = {
  name: [
    { required: true, message: '请输入模板名称', trigger: 'blur' },
    { max: 20, message: '名称最多20个字', trigger: 'blur' },
  ],
  platform: [
    { required: true, message: '请选择操作系统', trigger: 'change' },
  ],
  brand: [
    { required: true, message: '请选择浏览器品牌', trigger: 'change' },
  ],
  seed: [
    {
      validator: (_rule: unknown, value: number | null, callback: (error?: Error) => void) => {
        if (value === null) {
          callback();
          return;
        }
        if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
          callback(new Error('请输入1-2147483647的整数'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

watch(
  [() => form.platform, () => form.brand],
  async ([platform, brand]: ['windows' | 'linux' | 'macos', 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi']) => {
    if (form.seed && dialogVisible.value) {
      try {
        const result = await window.matrixflow.fingerprint.generateHardware(form.seed, platform, brand);
        if (result.success && result.data) {
          advancedData.value = {
            ...advancedData.value,
            hardware_concurrency: result.data.hardware_concurrency,
            gpu_vendor: result.data.gpu_vendor,
            gpu_renderer: result.data.gpu_renderer,
            platform_version: result.data.platform_version || null,
            brand_version: result.data.brand_version || null,
          };
        }
      } catch {
        // ignore
      }
    }
  }
);

const filteredTemplates = computed(() => {
  if (!searchKeyword.value.trim()) return templates.value;
  const kw = searchKeyword.value.toLowerCase();
  return templates.value.filter((t) => t.name.toLowerCase().includes(kw));
});

function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    windows: 'Windows',
    linux: 'Linux',
    macos: 'macOS',
  };
  return labels[platform] ?? platform;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

onMounted(() => {
  loadTemplates();
});

async function loadTemplates() {
  loading.value = true;
  try {
    const result = await window.matrixflow.fingerprint.list();
    if (result.success && result.data) {
      templates.value = result.data;
    }
  } catch {
    ElMessage.error('加载指纹模板失败');
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, defaultForm);
  disableUdp.value = false;
  advancedData.value = {
    lang: '',
    accept_lang: '',
    timezone: '',
    platform_version: null,
    brand_version: null,
    hardware_concurrency: null,
    gpu_vendor: null,
    gpu_renderer: null,
  };
}

function showCreateDialog() {
  isEdit.value = false;
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

async function onSeedGenerated(seed: number) {
  console.log('[FingerprintSettings] onSeedGenerated called with seed:', seed);
  try {
    if (window.matrixflow.fingerprint.generateFromSeed) {
      const result = await window.matrixflow.fingerprint.generateFromSeed(seed);
      console.log('[FingerprintSettings] generateFromSeed result:', result);
      if (result.success && result.data) {
        const d = result.data;
        form.platform = d.platform ?? form.platform;
        form.brand = d.brand ?? form.brand;
        advancedData.value = {
          lang: d.lang ?? 'zh-CN',
          accept_lang: d.accept_lang ?? 'zh-CN,en-US',
          timezone: d.timezone ?? 'Asia/Shanghai',
          platform_version: d.platform_version ?? null,
          brand_version: d.brand_version ?? null,
          hardware_concurrency: d.hardware_concurrency ?? null,
          gpu_vendor: d.gpu_vendor ?? null,
          gpu_renderer: d.gpu_renderer ?? null,
        };
        disableUdp.value = d.disable_non_proxied_udp === 1;
      }
    } else {
      console.warn('[FingerprintSettings] generateFromSeed not available, using getDefaults fallback');
      const result = await window.matrixflow.fingerprint.getDefaults();
      if (result.success && result.data) {
        const d = result.data;
        form.platform = d.platform ?? form.platform;
        form.brand = d.brand ?? form.brand;
        advancedData.value = {
          lang: d.lang ?? 'zh-CN',
          accept_lang: d.accept_lang ?? 'zh-CN,en-US',
          timezone: d.timezone ?? 'Asia/Shanghai',
          platform_version: d.platform_version ?? null,
          brand_version: d.brand_version ?? null,
          hardware_concurrency: d.hardware_concurrency ?? null,
          gpu_vendor: d.gpu_vendor ?? null,
          gpu_renderer: d.gpu_renderer ?? null,
        };
        disableUdp.value = true;
      }
    }
  } catch (err) {
    console.error('[FingerprintSettings] onSeedGenerated error:', err);
  }
}

function showEditDialog(tpl: FingerprintTemplate) {
  isEdit.value = true;
  editingId.value = tpl.id;
  Object.assign(form, {
    name: tpl.name,
    seed: tpl.seed,
    platform: tpl.platform,
    brand: tpl.brand,
    custom_params: tpl.custom_params ?? '',
    screen_width: tpl.screen_width,
    screen_height: tpl.screen_height,
    disable_non_proxied_udp: tpl.disable_non_proxied_udp,
  });
  disableUdp.value = tpl.disable_non_proxied_udp === 1;
  advancedData.value = {
    lang: tpl.lang ?? '',
    accept_lang: tpl.accept_lang ?? '',
    timezone: tpl.timezone ?? '',
    platform_version: tpl.platform_version ?? null,
    brand_version: tpl.brand_version ?? null,
    hardware_concurrency: tpl.hardware_concurrency ?? null,
    gpu_vendor: tpl.gpu_vendor ?? null,
    gpu_renderer: tpl.gpu_renderer ?? null,
  };
  dialogVisible.value = true;
}

async function submitForm() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const data = {
      name: form.name,
      seed: form.seed,
      platform: form.platform,
      platform_version: advancedData.value.platform_version,
      brand: form.brand,
      brand_version: advancedData.value.brand_version,
      hardware_concurrency: advancedData.value.hardware_concurrency,
      gpu_vendor: advancedData.value.gpu_vendor,
      gpu_renderer: advancedData.value.gpu_renderer,
      disable_non_proxied_udp: disableUdp.value ? 1 : 0,
      lang: advancedData.value.lang,
      accept_lang: advancedData.value.accept_lang,
      timezone: advancedData.value.timezone,
      custom_params: form.custom_params,
      user_agent: null,
      screen_width: form.screen_width,
      screen_height: form.screen_height,
    };

    if (isEdit.value && editingId.value) {
      await window.matrixflow.fingerprint.update(editingId.value, data);
      ElMessage.success('模板已更新');
    } else {
      await window.matrixflow.fingerprint.create(data);
      ElMessage.success('模板已创建');
    }

    dialogVisible.value = false;
    await loadTemplates();
  } catch {
    ElMessage.error(isEdit.value ? '更新失败' : '创建失败');
  } finally {
    submitting.value = false;
  }
}

async function deleteTemplate(tpl: FingerprintTemplate) {
  try {
    await ElMessageBox.confirm(
      `确定删除指纹模板 "${tpl.name}" 吗？`,
      '确认删除',
      { type: 'warning' }
    );
    await window.matrixflow.fingerprint.delete(tpl.id);
    ElMessage.success('模板已删除');
    await loadTemplates();
  } catch {
    // 用户取消
  }
}

async function openInChrome(url: string) {
  const result = await window.matrixflow.browser.openUrl(url);
  if (!result.success) {
    ElMessage.warning(result.message || 'Chrome 浏览器路径未配置，请在系统设置中配置');
  }
}
</script>

<style scoped>
.fingerprint-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.section-header__left {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.section-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.section-header__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.search-bar {
  display: flex;
  gap: var(--space-3);
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 200px;
}

.template-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-5);
  background: var(--color-bg-page);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  transition: all var(--transition-fast);
}

.template-card:hover {
  border-color: var(--color-primary-light);
  box-shadow: var(--shadow-xs);
}

.template-card__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.template-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.template-card__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.template-card__tags {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.template-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.meta-sep {
  color: var(--color-border);
}

.template-card__actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.form-section {
  padding: var(--space-4);
  background: var(--color-bg-page, #f8fafc);
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-4);
}

.form-section__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-light);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--space-4);
}

.webrtc-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  margin-top: var(--space-3);
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
}

.webrtc-switch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.webrtc-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-regular);
}

.webrtc-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  padding-left: 46px;
}

.advanced-collapse {
  margin-bottom: var(--space-4);
  border: none;
}

.advanced-collapse :deep(.el-collapse-item__header) {
  background: transparent;
  border: none;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.advanced-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.dialog-body :deep(.el-collapse) {
  border: none;
}

.fingerprint-mode-hint {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #93c5fd;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.fingerprint-mode-hint__icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: #1e40af;
}

.fingerprint-mode-hint__content {
  flex: 1;
}

.fingerprint-mode-hint__text {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.6;
  color: #1e40af;
}

.fingerprint-mode-hint__action {
  margin: var(--space-1) 0 0 0;
}

.fingerprint-mode-hint__action .el-link {
  font-size: var(--font-size-xs);
}
</style>