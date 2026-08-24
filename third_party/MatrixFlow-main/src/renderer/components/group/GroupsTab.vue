<template>
  <div class="groups-tab">
    <div class="groups-tab__header">
      <div class="groups-tab__stats">
        <div class="stat-card">
          <span class="stat-card__value">{{ groupStore.groupCount }}</span>
          <span class="stat-card__label">分组总数</span>
        </div>
        <div class="stat-card stat-card--success">
          <span class="stat-card__value">{{ totalAccountsBound }}</span>
          <span class="stat-card__label">已绑定账号</span>
        </div>
        <div class="stat-card stat-card--warning">
          <span class="stat-card__value">{{ activeRuleCount }}</span>
          <span class="stat-card__label">已配置规则</span>
        </div>
      </div>
      <el-button type="primary" size="small" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        创建分组
      </el-button>
    </div>

    <Loading v-if="groupStore.loading" />
    <Empty
      v-else-if="groupStore.groups.length === 0"
      text="暂无分组，创建分组来批量管理账号"
      action-label="创建分组"
      @action="openCreateDialog"
    />
    <div v-else class="groups-tab__grid">
      <div
        v-for="group in sortedGroups"
        :key="group.id"
        class="group-item"
        :style="{ '--group-color': group.color }"
      >
        <div class="group-item__main">
          <span class="group-item__dot" />
          <span class="group-item__name">{{ group.name }}</span>
          <el-tag size="small" effect="plain" class="group-item__count">
            {{ getAccountCount(group.id) }} 个账号
          </el-tag>
          <span class="group-item__time">{{ formatTime(group.createdAt) }}</span>
        </div>
        <div class="group-item__actions">
          <el-button text size="small" type="primary" @click="openEditDialog(group)">编辑</el-button>
          <el-button text size="small" @click="openBindDialog(group)">绑定账号</el-button>
          <el-popconfirm title="确定删除该分组？" @confirm="handleDelete(group.id)">
            <template #reference>
              <el-button text size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </div>

    <GroupEditDialog
      v-model="editDialogVisible"
      :group="editGroupWithAccounts"
      @saved="onSaved"
    />
    <AccountBindDialog
      v-model="bindDialogVisible"
      :group="selectedGroup"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useGroupStore, type Group } from '@/renderer/stores/group';
import { useAccountStore } from '@/renderer/stores/account';
import Loading from '@/renderer/components/common/Loading.vue';
import Empty from '@/renderer/components/common/Empty.vue';
import GroupEditDialog from '@/renderer/components/group/GroupEditDialog.vue';
import AccountBindDialog from '@/renderer/components/group/AccountBindDialog.vue';

const groupStore = useGroupStore();
const accountStore = useAccountStore();

const editDialogVisible = ref(false);
const bindDialogVisible = ref(false);
const editingGroup = ref<Group | null>(null);
const selectedGroup = ref<Group | null>(null);

const sortedGroups = computed(() =>
  [...groupStore.groups].sort((a, b) => a.sortOrder - b.sortOrder),
);

const totalAccountsBound = computed(() =>
  accountStore.accounts.filter((a: any) => a.groupId).length,
);

const activeRuleCount = computed(() =>
  groupStore.groups.filter((g) => g.publishRule.platforms.length > 0).length,
);

const editGroupWithAccounts = computed(() => {
  if (!editingGroup.value) return null;
  const accountIds = accountStore.accounts
    .filter((a: any) => a.groupId === editingGroup.value!.id)
    .map((a: any) => a.id);
  return { ...editingGroup.value, accountIds };
});

onMounted(() => {
  groupStore.fetchGroups();
  accountStore.fetchAccounts();
});

function getAccountCount(groupId: string): number {
  return accountStore.accounts.filter((a: any) => a.groupId === groupId).length;
}

function openCreateDialog() {
  editingGroup.value = null;
  editDialogVisible.value = true;
}

function openEditDialog(group: Group) {
  editingGroup.value = group;
  editDialogVisible.value = true;
}

function openBindDialog(group: Group) {
  selectedGroup.value = group;
  bindDialogVisible.value = true;
}

async function handleDelete(id: string) {
  await groupStore.deleteGroup(id);
  ElMessage.success('分组已删除');
}

function onSaved() {
  groupStore.fetchGroups();
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<style scoped>
.groups-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.groups-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: nowrap;
  margin-top: 50px;
}

.groups-tab__stats {
  display: flex;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-card);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-sm);
  min-width: 0;
}

.stat-card__value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.2;
}

.stat-card--success .stat-card__value { color: var(--color-success); }
.stat-card--warning .stat-card__value { color: var(--color-warning); }

.stat-card__label {
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
  margin-top: 2px;
  white-space: nowrap;
}

.groups-tab__grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-card);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border-light);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.group-item:hover {
  box-shadow: var(--shadow-sm);
  border-color: var(--group-color, var(--color-primary-light));
}

.group-item__main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.group-item__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--group-color);
  flex-shrink: 0;
}

.group-item__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-item__count {
  flex-shrink: 0;
}

.group-item__time {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  flex-shrink: 0;
}

.group-item__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  white-space: nowrap;
}
</style>