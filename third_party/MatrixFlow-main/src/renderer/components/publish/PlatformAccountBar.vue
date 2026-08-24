<template>
  <aside class="platform-sidebar">
    <button class="platform-sidebar__add" @click="emit('add-account')">
      <el-icon :size="14"><Plus /></el-icon>
      添加账号
    </button>

    <template v-for="group in accounts" :key="group.platform">
      <div
        v-for="account in group.accounts"
        :key="account.id"
        class="platform-sidebar__item"
        :class="{ 'platform-sidebar__item--active': selectedAccountId === account.id }"
        @click="emit('select', account.id)"
      >
        <img
          v-if="account.avatar"
          :src="account.avatar"
          class="platform-sidebar__avatar"
          :alt="account.nickname"
        />
        <span
          v-else
          class="platform-sidebar__icon"
          :style="{ background: group.color }"
        >{{ account.nickname?.charAt(0) || '?' }}</span>
        <div class="platform-sidebar__text">
          <span class="platform-sidebar__platform-name">{{ group.label }}</span>
          <span class="platform-sidebar__account-name">{{ account.nickname }}</span>
        </div>
      </div>
    </template>

    <div v-if="accounts.length === 0" class="platform-sidebar__empty">
      <el-icon :size="28" color="var(--color-text-placeholder)"><User /></el-icon>
      <p>暂无发布账号</p>
      <p>点击上方添加账号</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Plus, User } from '@element-plus/icons-vue';
import type { Account } from '@/renderer/stores/account';

interface PlatformGroup {
  platform: string;
  label: string;
  color: string;
  short: string;
  accounts: Account[];
}

defineProps<{
  accounts: PlatformGroup[];
  selectedAccountId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', accountId: string): void;
  (e: 'add-account'): void;
}>();
</script>

<style scoped>
.platform-sidebar {
  width: 180px;
  min-width: 180px;
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-2);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.platform-sidebar__add {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-1);
  transition: background var(--transition-fast);
}

.platform-sidebar__add:hover {
  background: var(--color-primary-lighter);
}

.platform-sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
  margin-bottom: 2px;
  transition: background var(--transition-fast);
}

.platform-sidebar__item:hover {
  background: var(--color-bg-page);
}

.platform-sidebar__item--active {
  background: var(--color-primary-lighter);
  border-left-color: var(--color-primary);
}

.platform-sidebar__item--active .platform-sidebar__account-name {
  font-weight: var(--font-weight-semibold);
}

.platform-sidebar__icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xs);
  flex-shrink: 0;
  color: #fff;
}

.platform-sidebar__avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  object-fit: cover;
}

.platform-sidebar__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.platform-sidebar__platform-name {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-sidebar__account-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-sidebar__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-3);
  color: var(--color-text-placeholder);
  font-size: var(--font-size-sm);
  gap: var(--space-1);
}

.platform-sidebar__empty p {
  margin: var(--space-1) 0;
}
</style>