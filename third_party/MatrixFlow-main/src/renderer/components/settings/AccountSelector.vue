<template>
  <el-dialog
    v-model="visible"
    title="选择账号"
    width="720px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="account-selector">
      <!-- 左侧筛选面板 -->
      <div class="selector-sidebar">
        <div class="sidebar-section">
          <div class="sidebar-section__title">平台</div>
          <div class="platform-filter">
            <el-input
              v-model="platformSearch"
              placeholder="搜索平台..."
              clearable
              size="small"
              class="platform-search"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <div class="platform-list">
              <div
                v-for="platform in filteredPlatforms"
                :key="platform.value"
                class="platform-item"
                :class="{ 'platform-item--active': selectedPlatform === platform.value }"
                @click="selectedPlatform = platform.value"
              >
                <span class="platform-item__label">{{ platform.label }}</span>
                <span class="platform-item__count">{{ getPlatformCount(platform.value) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section__title">分组</div>
          <el-select
            v-model="selectedGroup"
            placeholder="全部分组"
            clearable
            size="small"
            style="width: 100%"
          >
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </div>

        <div class="sidebar-section">
          <el-checkbox v-model="onlyShared" size="small">仅看共享账号</el-checkbox>
        </div>
      </div>

      <!-- 右侧账号列表 -->
      <div class="selector-main">
        <div class="main-header">
          <el-checkbox
            v-model="selectAll"
            :indeterminate="isIndeterminate"
            @change="handleSelectAll"
          >
            全选
          </el-checkbox>
          <el-input
            v-model="accountSearch"
            placeholder="搜索账号名称..."
            clearable
            size="small"
            style="width: 160px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="account-list">
          <el-checkbox-group v-model="selectedAccountIds">
            <div
              v-for="account in filteredAccounts"
              :key="account.id"
              class="account-item"
              :class="{ 'account-item--selected': selectedAccountIds.includes(account.id) }"
              @click="toggleAccount(account.id)"
            >
              <el-checkbox :value="account.id" @click.stop />
              <el-avatar :size="32" :src="account.avatar">
                {{ account.nickname?.charAt(0) || '?' }}
              </el-avatar>
              <div class="account-item__info">
                <span class="account-item__name">{{ account.nickname }}</span>
                <el-tag size="small" effect="plain">{{ getPlatformLabel(account.platform) }}</el-tag>
              </div>
            </div>
          </el-checkbox-group>

          <el-empty v-if="filteredAccounts.length === 0" description="暂无可选账号" />
        </div>

        <div class="main-footer">
          <span class="selected-count">已选择 {{ selectedAccountIds.length }} 个账号</span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

interface Account {
  id: string;
  platform: string;
  nickname: string;
  avatar: string | null;
  groupId?: string;
  shared?: boolean;
}

interface Group {
  id: string;
  name: string;
}

const props = defineProps<{
  modelValue: boolean;
  proxyId: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  success: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const platformSearch = ref('');
const selectedPlatform = ref('');
const selectedGroup = ref('');
const onlyShared = ref(false);
const accountSearch = ref('');

const allAccounts = ref<Account[]>([]);
const groups = ref<Group[]>([]);
const selectedAccountIds = ref<string[]>([]);
const saving = ref(false);

const platformMap: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  channels: '视频号',
  kuaishou: '快手',
  bilibili: 'B站',
};

const platforms = [
  { label: '全部', value: '' },
  { label: '抖音', value: 'douyin' },
  { label: '快手', value: 'kuaishou' },
  { label: 'B站', value: 'bilibili' },
  { label: '视频号', value: 'channels' },
  { label: '小红书', value: 'xiaohongshu' },
];

function getPlatformLabel(platform: string): string {
  return platformMap[platform] || platform;
}

const filteredPlatforms = computed(() => {
  if (!platformSearch.value) return platforms;
  return platforms.filter(p =>
    p.label.toLowerCase().includes(platformSearch.value.toLowerCase())
  );
});

const filteredAccounts = computed(() => {
  let result = allAccounts.value;

  if (selectedPlatform.value) {
    result = result.filter(a => a.platform === selectedPlatform.value);
  }

  if (selectedGroup.value) {
    result = result.filter(a => a.groupId === selectedGroup.value);
  }

  if (onlyShared.value) {
    result = result.filter(a => a.shared);
  }

  if (accountSearch.value) {
    result = result.filter(a =>
      a.nickname.toLowerCase().includes(accountSearch.value.toLowerCase())
    );
  }

  return result;
});

const selectAll = computed({
  get: () => filteredAccounts.value.length > 0 && selectedAccountIds.value.length === filteredAccounts.value.length,
  set: () => {},
});

const isIndeterminate = computed(() => {
  return selectedAccountIds.value.length > 0 && selectedAccountIds.value.length < filteredAccounts.value.length;
});

function getPlatformCount(platform: string): number {
  if (!platform) return allAccounts.value.length;
  return allAccounts.value.filter(a => a.platform === platform).length;
}

function toggleAccount(id: string) {
  const index = selectedAccountIds.value.indexOf(id);
  if (index === -1) {
    selectedAccountIds.value.push(id);
  } else {
    selectedAccountIds.value.splice(index, 1);
  }
}

function handleSelectAll(val: boolean) {
  if (val) {
    selectedAccountIds.value = filteredAccounts.value.map(a => a.id);
  } else {
    selectedAccountIds.value = [];
  }
}

watch(() => props.modelValue, async (val) => {
  if (val) {
    await loadAccounts();
  }
});

async function loadAccounts() {
  try {
    const result = await window.matrixflow.account.list();
    if (result.success && result.data) {
      allAccounts.value = result.data;
    }
  } catch {
    ElMessage.error('加载账号列表失败');
  }
}

async function handleSave() {
  if (!props.proxyId) return;
  saving.value = true;
  try {
    await (window.matrixflow.proxy as any).setAccounts(props.proxyId, selectedAccountIds.value);
    ElMessage.success('账号绑定成功');
    emit('update:modelValue', false);
    emit('success');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
}

function handleClose() {
  selectedAccountIds.value = [];
  platformSearch.value = '';
  selectedPlatform.value = '';
  selectedGroup.value = '';
  onlyShared.value = false;
  accountSearch.value = '';
}
</script>

<style scoped>
.account-selector {
  display: flex;
  gap: var(--space-4);
  height: 400px;
}

.selector-sidebar {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-right: var(--space-4);
  border-right: 1px solid var(--color-border-light);
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sidebar-section__title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  text-transform: uppercase;
}

.platform-filter {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.platform-search {
  width: 100%;
}

.platform-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}

.platform-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.platform-item:hover {
  background: var(--color-bg-hover);
}

.platform-item--active {
  background: var(--color-primary-lighter);
  color: var(--color-primary);
}

.platform-item__label {
  font-size: var(--font-size-sm);
}

.platform-item__count {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.selector-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-light);
}

.account-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.account-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.account-item:hover {
  background: var(--color-bg-page);
}

.account-item--selected {
  background: var(--color-primary-lighter);
}

.account-item__info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.account-item__name {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.main-footer {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-light);
}

.selected-count {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>