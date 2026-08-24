<template>
  <aside class="filter-panel">
    <!-- 平台筛选 -->
    <div class="filter-panel__section">
      <h4 class="filter-panel__title">平台</h4>
      <ul class="filter-panel__tree filter-panel__tree--scrollable">
        <li
          v-for="item in platformOptions"
          :key="item.value"
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedPlatform === item.value }"
          @click="handlePlatformSelect(item.value)"
        >
          <span class="filter-panel__dot" :style="{ background: item.color }" />
          <span class="filter-panel__label">{{ item.label }}</span>
          <span v-if="item.count !== undefined && item.count > 0" class="filter-panel__count">{{ item.count }}</span>
        </li>
      </ul>
    </div>

    <!-- 分组筛选 -->
    <div class="filter-panel__section filter-panel__section--flex">
      <h4 class="filter-panel__title">分组</h4>
      <ul class="filter-panel__tree filter-panel__tree--scrollable filter-panel__tree--groups">
        <li
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedGroup === '' }"
          @click="handleGroupSelect('')"
        >
          <span class="filter-panel__dot filter-panel__dot--all" />
          <span class="filter-panel__label">全部</span>
        </li>
        <li
          v-for="group in groups"
          :key="group.id"
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedGroup === group.id }"
          @click="handleGroupSelect(group.id)"
        >
          <span class="filter-panel__dot" :style="{ background: group.color }" />
          <span class="filter-panel__label">{{ group.name }}</span>
          <span class="filter-panel__count">{{ getGroupAccountCount(group.id) }}</span>
        </li>
        <li
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedGroup === '__ungrouped__' }"
          @click="handleGroupSelect('__ungrouped__')"
        >
          <span class="filter-panel__dot filter-panel__dot--ungrouped" />
          <span class="filter-panel__label">未分组</span>
          <span class="filter-panel__count">{{ getGroupAccountCount('__ungrouped__') }}</span>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Group } from '@/renderer/stores/group';
import type { Account } from '@/renderer/stores/account';

const props = defineProps<{
  groups: Group[];
  accounts: Account[];
  platformCounts?: Record<string, number>;
}>();

const emit = defineEmits<{
  'filter-platform': [value: string];
  'filter-group': [value: string];
}>();

const selectedPlatform = ref('');
const selectedGroup = ref('');

interface PlatformOption {
  value: string;
  label: string;
  color: string;
  count?: number;
}

const platformOptions = computed<PlatformOption[]>(() => [
  { value: '', label: '全部', color: 'var(--color-text-secondary)', count: props.platformCounts ? Object.values(props.platformCounts).reduce((a, b) => a + b, 0) : undefined },
  { value: 'douyin', label: '抖音', color: 'var(--color-plat-douyin)', count: props.platformCounts?.douyin },
  { value: 'xiaohongshu', label: '小红书', color: 'var(--color-plat-xiaohongshu)', count: props.platformCounts?.xiaohongshu },
  { value: 'channels', label: '视频号', color: 'var(--color-plat-wechat)', count: props.platformCounts?.channels },
  { value: 'kuaishou', label: '快手', color: 'var(--color-plat-kuaishou)', count: props.platformCounts?.kuaishou },
]);

function handlePlatformSelect(value: string) {
  selectedPlatform.value = value;
  emit('filter-platform', value);
}

function handleGroupSelect(value: string) {
  selectedGroup.value = value;
  emit('filter-group', value);
}

function getGroupAccountCount(groupId: string): number {
  if (groupId === '__ungrouped__') {
    return props.accounts.filter(a => !a.groupId).length;
  }
  return props.accounts.filter(a => a.groupId === groupId).length;
}
</script>

<style scoped>
.filter-panel {
  width: 240px;
  min-width: 240px;
  height: 100%;
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-panel__section {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.filter-panel__section--flex {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: none;
}

.filter-panel__title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--space-2) 0;
  flex-shrink: 0;
}

.filter-panel__tree {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.filter-panel__tree--scrollable {
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

.filter-panel__tree--groups {
  max-height: none;
  flex: 1;
}

.filter-panel__tree--scrollable::-webkit-scrollbar {
  width: 6px;
}

.filter-panel__tree--scrollable::-webkit-scrollbar-track {
  background: transparent;
}

.filter-panel__tree--scrollable::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.filter-panel__tree--scrollable::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-placeholder);
}

.filter-panel__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.filter-panel__item:hover {
  background: var(--color-bg-page);
}

.filter-panel__item--active {
  background: var(--color-primary-lighter);
  color: var(--color-primary);
}

.filter-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-panel__dot--all {
  background: var(--color-text-placeholder);
}

.filter-panel__dot--ungrouped {
  background: transparent;
  border: 2px dashed var(--color-text-placeholder);
  width: 8px;
  height: 8px;
}

.filter-panel__label {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
}

.filter-panel__item--active .filter-panel__label {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.filter-panel__count {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  background: var(--color-bg-page);
  padding: 2px 6px;
  border-radius: var(--radius-full);
}

.filter-panel__item--active .filter-panel__count {
  background: var(--color-primary);
  color: white;
}
</style>