<template>
  <el-dialog
    :model-value="modelValue"
    title="选择发布账号"
    width="720px"
    @update:model-value="emit('update:modelValue', $event)"
    class="selector-dialog"
  >
    <div class="selector">
      <!-- Left Panel -->
      <div class="selector__left">
        <div class="selector__tabs">
          <button
            :class="['selector__tab', { 'selector__tab--active': viewMode === 'platform' }]"
            @click="viewMode = 'platform'"
          >
            按平台
          </button>
          <button
            :class="['selector__tab', { 'selector__tab--active': viewMode === 'group' }]"
            @click="viewMode = 'group'"
          >
            按分组
          </button>
        </div>
        <div class="selector__search">
          <el-input
            v-model="searchQuery"
            placeholder="搜索账号..."
            size="small"
            clearable
            :prefix-icon="Search"
          />
        </div>
        <div class="selector__tree">
          <!-- Platform view -->
          <template v-if="viewMode === 'platform'">
            <div
              v-for="group in filteredPlatformGroups"
              :key="group.platform"
              class="selector__group"
            >
              <div class="selector__group-header" @click="togglePlatform(group.platform)">
                <el-checkbox
                  :model-value="isPlatformAllSelected(group.platform)"
                  @update:model-value="(v: boolean) => togglePlatformAll(group.platform, v)"
                  @click.stop
                />
                <span class="selector__group-icon" :style="{ background: group.color }">{{
                  group.short
                }}</span>
                <span class="selector__group-label">{{ group.label }}</span>
                <span class="selector__group-count">{{ group.accounts.length }}</span>
                <el-icon class="selector__group-chevron">
                  <ArrowDown v-if="expandedPlatforms.has(group.platform)" />
                  <ArrowRight v-else />
                </el-icon>
              </div>
              <div v-show="expandedPlatforms.has(group.platform)" class="selector__group-list">
                <div v-for="account in group.accounts"
                  :key="account.id"
                  class="selector__account"
                  @click="toggleAccount(account.id, !selectedIds.includes(account.id))"
                >
                  <el-checkbox
                    :model-value="selectedIds.includes(account.id)"
                    @update:model-value="(v: boolean) => toggleAccount(account.id, v)"
                    @click.stop
                  />
                  <img
                    v-if="account.avatar"
                    :src="account.avatar"
                    class="selector__account-avatar"
                    :alt="account.nickname"
                  />
                  <span
                    v-else
                    class="selector__account-avatar selector__account-avatar--fallback"
                    :style="{ background: group.color }"
                    >{{ account.nickname.charAt(0) }}</span
                  >
                  <span class="selector__account-name">{{ account.nickname }}</span>
                  <span
                    class="selector__account-status"
                    :class="
                      account.status === 'online'
                        ? 'selector__account-status--on'
                        : 'selector__account-status--off'
                    "
                  />
                </div>
              </div>
            </div>
            <el-empty
              v-if="filteredPlatformGroups.length === 0"
              description="未找到匹配的账号"
              :image-size="48"
            />
          </template>
          <!-- Group view -->
          <template v-else>
            <div
              v-for="group in filteredGroupGroups"
              :key="group.groupId"
              class="selector__group"
            >
              <div class="selector__group-header" @click="togglePlatform(group.groupId)">
                <el-checkbox
                  :model-value="isGroupAllSelected(group.groupId)"
                  @update:model-value="(v: boolean) => toggleGroupAll(group.groupId, v)"
                  @click.stop
                />
                <span class="selector__group-icon" :style="{ background: group.groupColor }">{{
                  group.groupName.charAt(0)
                }}</span>
                <span class="selector__group-label">{{ group.groupName }}</span>
                <span class="selector__group-count">{{ group.accounts.length }}</span>
                <el-icon class="selector__group-chevron">
                  <ArrowDown v-if="expandedPlatforms.has(group.groupId)" />
                  <ArrowRight v-else />
                </el-icon>
              </div>
              <div v-show="expandedPlatforms.has(group.groupId)" class="selector__group-list">
                <div
                  v-for="account in group.accounts"
                  :key="account.id"
                  class="selector__account"
                  @click="toggleAccount(account.id, !selectedIds.includes(account.id))"
                >
                  <el-checkbox
                    :model-value="selectedIds.includes(account.id)"
                    @update:model-value="(v: boolean) => toggleAccount(account.id, v)"
                    @click.stop
                  />
                  <img
                    v-if="account.avatar"
                    :src="account.avatar"
                    class="selector__account-avatar"
                    :alt="account.nickname"
                  />
                  <span
                    v-else
                    class="selector__account-avatar selector__account-avatar--fallback"
                    :style="{ background: getPlatformInfo(account.platform).color }"
                    >{{ account.nickname.charAt(0) }}</span
                  >
                   <span class="selector__account-name">{{ account.nickname }}</span>
                  <span class="selector__account-platform" :style="{ color: getPlatformInfo(account.platform).color }">{{ getPlatformInfo(account.platform).label }}</span>
                   <span
                     class="selector__account-status"
                     :class="
                       account.status === 'online'
                         ? 'selector__account-status--on'
                         : 'selector__account-status--off'
                     "
                   />
                 </div>
               </div>
             </div>
             <el-empty
              v-if="filteredGroupGroups.length === 0"
              description="未找到匹配的账号"
              :image-size="48"
            />
          </template>
        </div>
      </div>
      <!-- Right Panel -->
      <div class="selector__right">
        <div class="selector__right-header">
          <span>已选</span>
          <span class="selector__right-count">{{ selectedIds.length }}</span>
        </div>
        <div class="selector__right-list">
          <TransitionGroup name="selector-card">
            <div
              v-for="id in selectedIds"
              :key="id"
              class="selector__selected-card"
            >
              <img
                v-if="getAccountById(id)?.avatar"
                :src="getAccountById(id)!.avatar"
                class="selector__selected-avatar"
                :alt="getAccountById(id)?.nickname"
              />
              <span
                v-else
                class="selector__selected-avatar selector__selected-avatar--fallback"
                :style="{
                  background: getPlatformInfo(getAccountById(id)?.platform || '').color,
                }"
                >{{ getPlatformInfo(getAccountById(id)?.platform || '').short }}</span
              >
              <div class="selector__selected-info">
                <span class="selector__selected-name">{{
                  getAccountById(id)?.nickname
                }}</span>
                <span
                  class="selector__selected-platform"
                  :style="{
                    color: getPlatformInfo(getAccountById(id)?.platform || '').color,
                  }"
                  >{{ getPlatformInfo(getAccountById(id)?.platform || '').label }}</span
                >
              </div>
              <button class="selector__selected-remove" @click="removeAccount(id)">×</button>
            </div>
          </TransitionGroup>
          <div v-if="selectedIds.length === 0" class="selector__right-empty">
            <el-icon :size="32" color="var(--color-text-placeholder)"><User /></el-icon>
            <p>从左侧选择要发布的账号</p>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button
        type="primary"
        :disabled="selectedIds.length === 0"
        @click="handleConfirm"
      >
        确认选择 ({{ selectedIds.length }})
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAccountStore } from '@/renderer/stores/account';
import type { Account } from '@/renderer/stores/account';
import { Search, ArrowDown, ArrowRight, User } from '@element-plus/icons-vue';

interface PlatformConfig {
  title?: string;
  description?: string;
  tags?: string[];
  coverRatio?: string;
  location?: string;
  visibility?: string;
}

const props = defineProps<{
  modelValue: boolean;
  platformConfigs: Record<string, PlatformConfig>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [accountIds: string[]];
}>();

const accountStore = useAccountStore();
const selectedIds = ref<string[]>([]);
const viewMode = ref<'platform' | 'group'>('platform');
const searchQuery = ref('');
const expandedPlatforms = ref<Set<string>>(new Set());

const platformInfo: Record<string, { label: string; color: string; short: string }> = {
  xiaohongshu: { label: '小红书', color: '#FF2442', short: '红' },
  douyin: { label: '抖音', color: '#000000', short: '音' },
  bilibili: { label: 'B站', color: '#FB7299', short: 'B' },
  channels: { label: '视频号', color: '#07C160', short: '视' },
  kuaishou: { label: '快手', color: '#FF4906', short: '快' },
  weibo: { label: '微博', color: '#E6162D', short: '博' },
  zhihu: { label: '知乎', color: '#0066FF', short: '知' },
};

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      selectedIds.value = Object.keys(props.platformConfigs);
      const platforms = new Set(accountStore.accounts.map((a) => a.platform));
      expandedPlatforms.value = new Set(platforms);
    }
  }
);

const allAccounts = computed(() => accountStore.accounts);

const platformGroups = computed(() => {
  const groups = new Map<
    string,
    { platform: string; label: string; color: string; short: string; accounts: Account[] }
  >();

  for (const account of allAccounts.value) {
    const info = platformInfo[account.platform] || {
      label: account.platform,
      color: '#909399',
      short: '?',
    };
    if (!groups.has(account.platform)) {
      groups.set(account.platform, {
        platform: account.platform,
        label: info.label,
        color: info.color,
        short: info.short,
        accounts: [],
      });
    }
    groups.get(account.platform)!.accounts.push(account);
  }

  return Array.from(groups.values());
});

const groupGroups = computed(() => {
  const groups = new Map<
    string,
    { groupId: string; groupName: string; groupColor: string; accounts: Account[] }
  >();

  for (const account of allAccounts.value) {
    if (account.groupInfos && account.groupInfos.length > 0) {
      for (const gi of account.groupInfos) {
        if (!groups.has(gi.id)) {
          groups.set(gi.id, {
            groupId: gi.id,
            groupName: gi.name,
            groupColor: gi.color,
            accounts: [],
          });
        }
        groups.get(gi.id)!.accounts.push(account);
      }
    } else {
      // 未分组的账号
      if (!groups.has('__ungrouped__')) {
        groups.set('__ungrouped__', {
          groupId: '__ungrouped__',
          groupName: '未分组',
          groupColor: '#909399',
          accounts: [],
        });
      }
      groups.get('__ungrouped__')!.accounts.push(account);
    }
  }

  return Array.from(groups.values());
});

const filteredPlatformGroups = computed(() => {
  if (!searchQuery.value.trim()) {
    return platformGroups.value;
  }
  const query = searchQuery.value.toLowerCase();
  return platformGroups.value
    .map((group) => ({
      ...group,
      accounts: group.accounts.filter((a) =>
        a.nickname.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.accounts.length > 0);
});

const filteredGroupGroups = computed(() => {
  if (!searchQuery.value.trim()) {
    return groupGroups.value;
  }
  const query = searchQuery.value.toLowerCase();
  return groupGroups.value
    .map((group) => ({
      ...group,
      accounts: group.accounts.filter((a) =>
        a.nickname.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.accounts.length > 0);
});

function toggleAccount(id: string, checked: boolean) {
  if (checked) {
    selectedIds.value.push(id);
  } else {
    selectedIds.value = selectedIds.value.filter((i) => i !== id);
  }
}

function isPlatformAllSelected(platform: string): boolean {
  const group = platformGroups.value.find((g) => g.platform === platform);
  if (!group || group.accounts.length === 0) return false;
  return group.accounts.every((a) => selectedIds.value.includes(a.id));
}

function togglePlatformAll(platform: string, checked: boolean) {
  const group = platformGroups.value.find((g) => g.platform === platform);
  if (!group) return;
  if (checked) {
    for (const account of group.accounts) {
      if (!selectedIds.value.includes(account.id)) {
        selectedIds.value.push(account.id);
      }
    }
  } else {
    selectedIds.value = selectedIds.value.filter(
      (id) => !group.accounts.some((a) => a.id === id)
    );
  }
}

function isGroupAllSelected(groupId: string): boolean {
  const group = groupGroups.value.find((g) => g.groupId === groupId);
  if (!group || group.accounts.length === 0) return false;
  return group.accounts.every((a) => selectedIds.value.includes(a.id));
}

function toggleGroupAll(groupId: string, checked: boolean) {
  const group = groupGroups.value.find((g) => g.groupId === groupId);
  if (!group) return;
  if (checked) {
    for (const account of group.accounts) {
      if (!selectedIds.value.includes(account.id)) {
        selectedIds.value.push(account.id);
      }
    }
  } else {
    selectedIds.value = selectedIds.value.filter(
      (id) => !group.accounts.some((a) => a.id === id)
    );
  }
}

function togglePlatform(platform: string) {
  if (expandedPlatforms.value.has(platform)) {
    expandedPlatforms.value.delete(platform);
  } else {
    expandedPlatforms.value.add(platform);
  }
}

function removeAccount(id: string) {
  selectedIds.value = selectedIds.value.filter((i) => i !== id);
}

function getAccountById(id: string): Account | undefined {
  return accountStore.accounts.find((a) => a.id === id);
}

function getPlatformInfo(platform: string) {
  return platformInfo[platform] || { label: platform, color: '#909399', short: '?' };
}

function handleCancel() {
  emit('update:modelValue', false);
}

function handleConfirm() {
  emit('confirm', [...selectedIds.value]);
  emit('update:modelValue', false);
}
</script>

<style scoped>
/* Dialog overrides */
:deep(.el-dialog__body) {
  padding: 0;
}
:deep(.el-dialog__header) {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  margin-right: 0;
}
:deep(.el-dialog__footer) {
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
}

/* Main selector flex */
.selector {
  display: flex;
  height: 440px;
}
.selector__left {
  width: 60%;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}
.selector__right {
  width: 40%;
  display: flex;
  flex-direction: column;
}

/* Segmented tabs */
.selector__tabs {
  display: flex;
  padding: var(--space-2) var(--space-3);
  gap: 0;
  border-bottom: 1px solid var(--color-border-light);
}
.selector__tab {
  flex: 1;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}
.selector__tab:first-child {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.selector__tab:last-child {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  border-left: 0;
}
.selector__tab--active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

/* Search */
.selector__search {
  padding: var(--space-2) var(--space-3);
}

/* Tree scroll */
.selector__tree {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-3) var(--space-3);
}

/* Group header */
.selector__group-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-1);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}
.selector__group-header:hover {
  background: var(--color-bg-page);
}
.selector__group-icon {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  flex-shrink: 0;
}
.selector__group-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  flex: 1;
}
.selector__group-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}
.selector__group-chevron {
  color: var(--color-text-placeholder);
}

/* Account item */
.selector__group-list {
  padding-left: var(--space-5);
}
.selector__account {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.selector__account:hover {
  background: var(--color-bg-page);
}
.selector__account-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  object-fit: cover;
}
.selector__account-avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
}
.selector__account-name {
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
  flex: 1;
}
.selector__account-platform {
  font-size: var(--font-size-xs);
  flex-shrink: 0;
}
.selector__account-status {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.selector__account-status--on {
  background: var(--color-success);
}
.selector__account-status--off {
  background: var(--color-text-placeholder);
}

/* Right panel */
.selector__right-header {
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.selector__right-count {
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-xs);
  padding: 0 6px;
  border-radius: var(--radius-full);
  min-width: 20px;
  text-align: center;
}
.selector__right-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
}

/* Selected card */
.selector__selected-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-1);
  transition: all var(--transition-fast);
}
.selector__selected-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  object-fit: cover;
}
.selector__selected-avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
}
.selector__selected-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.selector__selected-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selector__selected-platform {
  font-size: var(--font-size-xs);
}
.selector__selected-remove {
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: var(--color-text-placeholder);
  cursor: pointer;
  font-size: 16px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}
.selector__selected-remove:hover {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

/* Empty state */
.selector__right-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-placeholder);
  gap: var(--space-2);
}
.selector__right-empty p {
  font-size: var(--font-size-sm);
}

/* TransitionGroup animations */
.selector-card-enter-active {
  transition: all var(--transition-fast);
}
.selector-card-leave-active {
  transition: all var(--transition-fast);
  position: absolute;
}
.selector-card-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.selector-card-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
.selector-card-move {
  transition: transform var(--transition-fast);
}
</style>