<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="520px"
    :with-header="false"
    :destroy-on-close="true"
    @close="handleClose"
  >
    <div v-if="account" class="settings-drawer">
      <header class="settings-drawer__head">
        <div class="settings-drawer__head-left">
          <div class="settings-drawer__avatar" :style="{ borderColor: platformColor }">
            <span v-if="!account.avatar" class="settings-drawer__avatar-fallback">
              {{ account.nickname?.charAt(0) || '?' }}
            </span>
            <img v-else :src="account.avatar" class="settings-drawer__avatar-img" />
          </div>
          <div class="settings-drawer__head-info">
            <div class="settings-drawer__name-row">
              <span class="settings-drawer__name">{{ account.nickname }}</span>
              <el-tag size="small" effect="plain" :type="platformTagType">{{ platformLabel }}</el-tag>
            </div>
            <div class="settings-drawer__id">ID: {{ account.id }}</div>
          </div>
        </div>
        <el-button text :icon="Close" circle size="small" @click="visible = false" />
      </header>

      <el-tabs v-model="activeTab" class="settings-drawer__tabs">
        <el-tab-pane label="基础信息" name="basic">
          <template #label>
            <span class="settings-drawer__tab-label">
              <el-icon><User /></el-icon>
              基础信息
            </span>
          </template>
        </el-tab-pane>
        <el-tab-pane label="发布预设" name="preset">
          <template #label>
            <span class="settings-drawer__tab-label">
              <el-icon><MagicStick /></el-icon>
              发布预设
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="settings-drawer__body">
        <template v-if="activeTab === 'basic'">
          <el-form label-position="top" class="settings-drawer__form">
            <el-form-item label="账号备注">
              <el-input
                v-model="form.remark"
                placeholder="为账号添加备注,便于辨识"
                maxlength="100"
                show-word-limit
                clearable
              />
            </el-form-item>

            <el-form-item label="所属分组">
              <div class="settings-drawer__groups">
                <el-tag
                  v-for="g in groupStore.groups"
                  :key="g.id"
                  :type="isMember(g.id) ? 'primary' : 'info'"
                  :effect="isMember(g.id) ? 'dark' : 'plain'"
                  class="settings-drawer__group-chip"
                  @click="toggleGroup(g.id)"
                >
                  <span class="settings-drawer__group-dot" :style="{ background: g.color }"></span>
                  {{ g.name }}
                </el-tag>
                <div v-if="!groupStore.groups.length" class="settings-drawer__empty">
                  暂无分组,可在"分组管理"中创建
                </div>
              </div>
              <div class="settings-drawer__hint">点击分组卡片可加入或移出;账号可同时属于多个分组</div>
            </el-form-item>
          </el-form>
        </template>

        <template v-else-if="activeTab === 'preset'">
          <div class="settings-drawer__preset">
            <div class="settings-drawer__preset-status">
              <el-switch
                v-model="presetForm.enabled"
                inline-prompt
                active-text="启用预设"
                inactive-text="未启用"
              />
              <span class="settings-drawer__preset-hint">
                启用后,使用此账号发布视频时会自动套用下方配置
              </span>
            </div>

            <el-divider content-position="left">
              <span class="settings-drawer__divider-text">通用选项</span>
            </el-divider>

            <el-form label-position="top" class="settings-drawer__form">
              <el-form-item label="默认话题 / 标签">
                <el-select
                  v-model="presetForm.topics"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="输入并回车添加话题,如 #旅行#"
                  class="settings-drawer__topics"
                >
                  <el-option
                    v-for="t in presetForm.topics"
                    :key="t"
                    :label="t"
                    :value="t"
                  />
                </el-select>
                <div class="settings-drawer__hint">
                  话题会在发布时自动追加到描述中;支持自定义输入
                </div>
              </el-form-item>
            </el-form>

            <el-divider content-position="left">
              <span class="settings-drawer__divider-text">平台特定选项 · {{ platformLabel }}</span>
            </el-divider>

            <el-form label-position="top" class="settings-drawer__form">
              <template v-if="account.platform === 'channels'">
                <el-form-item label="原创声明">
                  <el-select
                    v-model="presetForm.platformOptions.declaration"
                    placeholder="默认不声明"
                    clearable
                  >
                    <el-option label="声明原创" value="original" />
                    <el-option label="自主拍摄" value="self_shot" />
                  </el-select>
                  <div class="settings-drawer__hint">
                    视频号将自动勾选「声明原创」并阅读使用条款
                  </div>
                </el-form-item>
              </template>

              <template v-else-if="account.platform === 'douyin'">
                <el-form-item label="作者声明">
                  <el-select
                    v-model="presetForm.platformOptions.declaration"
                    placeholder="不声明"
                    clearable
                  >
                    <el-option label="不声明" value="none" />
                    <el-option label="内容为 AI 生成" value="ai_generated" />
                    <el-option label="虚构演绎" value="fictional" />
                    <el-option label="个人观点" value="personal_opinion" />
                    <el-option label="自主拍摄" value="original" />
                    <el-option label="素材转载" value="repost" />
                  </el-select>
                </el-form-item>

                <el-form-item label="可见范围">
                  <el-radio-group v-model="presetForm.platformOptions.visibility">
                    <el-radio value="public">公开</el-radio>
                    <el-radio value="friends">好友可见</el-radio>
                    <el-radio value="private">仅自己可见</el-radio>
                  </el-radio-group>
                </el-form-item>

                <el-form-item label="保存权限">
                  <el-switch
                    v-model="presetForm.platformOptions.allowDownload"
                    active-text="允许下载"
                    inactive-text="禁止下载"
                  />
                  <div class="settings-drawer__hint">
                    抖音平台仅暴露"禁止下载"开关,默认允许下载
                  </div>
                </el-form-item>
              </template>

              <template v-else-if="account.platform === 'xiaohongshu'">
                <el-form-item label="内容类型声明">
                  <el-radio-group v-model="presetForm.platformOptions.declaration">
                    <el-radio :value="0">无需声明</el-radio>
                    <el-radio :value="1">虚构演绎,仅供娱乐</el-radio>
                    <el-radio :value="2">笔记含 AI 合成内容</el-radio>
                    <el-radio :value="3">内容包含营销广告</el-radio>
                  </el-radio-group>
                </el-form-item>

                <el-form-item label="可见范围">
                  <el-radio-group v-model="presetForm.platformOptions.visibility">
                    <el-radio value="public">公开可见</el-radio>
                    <el-radio value="friends">仅互关好友可见</el-radio>
                    <el-radio value="private">仅自己可见</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>

              <template v-else-if="account.platform === 'kuaishou'">
                <el-form-item label="作者声明">
                  <el-select
                    v-model="presetForm.platformOptions.declaration"
                    placeholder="不声明"
                    clearable
                  >
                    <el-option label="不声明" value="none" />
                    <el-option label="内容为 AI 生成" value="ai_generated" />
                    <el-option label="虚构演绎" value="fictional" />
                    <el-option label="个人观点" value="personal_opinion" />
                    <el-option label="自主拍摄" value="original" />
                    <el-option label="素材转载" value="repost" />
                  </el-select>
                </el-form-item>

                <el-form-item label="可见范围">
                  <el-radio-group v-model="presetForm.platformOptions.visibility">
                    <el-radio value="public">所有人可见</el-radio>
                    <el-radio value="friends">好友可见</el-radio>
                    <el-radio value="private">仅自己可见</el-radio>
                  </el-radio-group>
                </el-form-item>

                <el-form-item label="互动设置">
                  <div class="settings-drawer__switch-row">
                    <div class="settings-drawer__switch-item">
                      <span>允许别人跟我同拍</span>
                      <el-switch v-model="presetForm.platformOptions.allowSameFrame" />
                    </div>
                    <div class="settings-drawer__switch-item">
                      <span>允许下载此作品</span>
                      <el-switch v-model="presetForm.platformOptions.allowDownload" />
                    </div>
                    <div class="settings-drawer__switch-item">
                      <span>作品展示在同城页</span>
                      <el-switch v-model="presetForm.platformOptions.showInCity" />
                    </div>
                  </div>
                </el-form-item>
              </template>

              <template v-else>
                <el-alert
                  type="info"
                  :closable="false"
                  title="该平台暂无可配置选项"
                  description="如有需求,请在「设置 → 反馈」中告知我们"
                />
              </template>
            </el-form>
          </div>
        </template>
      </div>

      <footer class="settings-drawer__footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存
        </el-button>
      </footer>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, User, MagicStick } from '@element-plus/icons-vue';
import type { Account } from '@/renderer/stores/account';
import { useAccountStore } from '@/renderer/stores/account';
import { useGroupStore } from '@/renderer/stores/group';
import { useAccountPublishPresetStore } from '@/renderer/stores/account-publish-preset';

const props = defineProps<{
  modelValue: boolean;
  account: Account | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const accountStore = useAccountStore();
const groupStore = useGroupStore();
const presetStore = useAccountPublishPresetStore();

const visible = ref(props.modelValue);
const activeTab = ref<'basic' | 'preset'>('basic');
const saving = ref(false);

const platformMap: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  channels: '视频号',
  kuaishou: '快手',
  bilibili: 'B站',
};
const platformTagTypeMap: Record<string, string> = {
  douyin: '',
  xiaohongshu: 'danger',
  channels: 'success',
  kuaishou: 'warning',
  bilibili: 'primary',
};
const platformColorMap: Record<string, string> = {
  douyin: 'var(--color-plat-douyin)',
  xiaohongshu: 'var(--color-plat-xiaohongshu)',
  channels: 'var(--color-plat-wechat)',
  kuaishou: 'var(--color-plat-kuaishou)',
  bilibili: 'var(--color-plat-bilibili)',
};

const platformLabel = computed(() => platformMap[props.account?.platform || ''] || props.account?.platform || '');
const platformTagType = computed(() => platformTagTypeMap[props.account?.platform || ''] || 'info');
const platformColor = computed(() => platformColorMap[props.account?.platform || ''] || 'var(--color-primary)');

const form = reactive({
  remark: '',
  groupIds: [] as string[],
});

const presetForm = reactive({
  enabled: true,
  topics: [] as string[],
  platformOptions: {} as Record<string, any>,
});

watch(() => props.modelValue, (v) => { visible.value = v; });
watch(visible, (v) => { emit('update:modelValue', v); });

watch(
  () => [props.modelValue, props.account?.id],
  async ([open]) => {
    if (open && props.account) {
      activeTab.value = 'basic';
      form.remark = props.account.remark || '';
      form.groupIds = [...(props.account.groupIds || [])];
      await loadPreset();
    }
  },
  { immediate: true }
);

async function loadPreset() {
  if (!props.account) return;
  const preset = await presetStore.getPreset(props.account.id, props.account.platform);
  if (preset) {
    presetForm.enabled = preset.enabled;
    presetForm.topics = [...preset.defaultTopics];
    presetForm.platformOptions = { ...preset.platformOptions };
  } else {
    presetForm.enabled = true;
    presetForm.topics = [];
    presetForm.platformOptions = {};
  }
}

function isMember(groupId: string) {
  return form.groupIds.includes(groupId);
}

async function toggleGroup(groupId: string) {
  if (!props.account) return;
  const action = isMember(groupId) ? 'remove' : 'add';
  await window.matrixflow.accounts.setGroup(props.account.id, groupId, action);
  if (action === 'add') {
    if (!form.groupIds.includes(groupId)) form.groupIds.push(groupId);
  } else {
    form.groupIds = form.groupIds.filter((id) => id !== groupId);
  }
  await accountStore.fetchAccounts();
  emit('changed');
}

async function handleSave() {
  if (!props.account) return;
  saving.value = true;
  try {
    if (form.remark !== (props.account.remark || '')) {
      await accountStore.updateRemark(props.account.id, form.remark.trim());
    }
    await presetStore.savePreset({
      accountId: props.account.id,
      platform: props.account.platform,
      defaultTopics: presetForm.topics,
      platformOptions: presetForm.platformOptions,
      enabled: presetForm.enabled,
    });
    await accountStore.fetchAccounts();
    ElMessage.success('设置已保存');
    emit('changed');
    visible.value = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function handleClose() {
  activeTab.value = 'basic';
}
</script>

<style scoped>
.settings-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-card);
}

.settings-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border-light);
}

.settings-drawer__head-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}

.settings-drawer__avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-border);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-page);
}

.settings-drawer__avatar-fallback {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
}

.settings-drawer__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.settings-drawer__head-info {
  min-width: 0;
  flex: 1;
}

.settings-drawer__name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 2px;
}

.settings-drawer__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-drawer__id {
  font-size: var(--font-size-2xs);
  color: var(--color-text-placeholder);
  font-family: var(--font-family-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-drawer__tabs {
  padding: 0 var(--space-5);
  border-bottom: 1px solid var(--color-border-light);
}

.settings-drawer__tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.settings-drawer__tabs :deep(.el-tabs__header) {
  margin: 0;
}

.settings-drawer__tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.settings-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
}

.settings-drawer__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.settings-drawer__groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.settings-drawer__group-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.settings-drawer__group-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.settings-drawer__hint {
  font-size: var(--font-size-2xs);
  color: var(--color-text-placeholder);
  line-height: 1.5;
  margin-top: 4px;
}

.settings-drawer__empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  padding: var(--space-2) 0;
}

.settings-drawer__preset {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.settings-drawer__preset-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
}

.settings-drawer__preset-hint {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.settings-drawer__topics {
  width: 100%;
}

.settings-drawer__divider-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.settings-drawer__switch-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.settings-drawer__switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 6px 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.settings-drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg-card);
}
</style>
