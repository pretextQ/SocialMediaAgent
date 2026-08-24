<template>
  <el-drawer
    v-model="visible"
    title="已绑定账号"
    direction="rtl"
    size="400px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="proxy-account-drawer">
      <div v-if="loading" class="proxy-account-drawer__loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>

      <div v-else-if="accounts.length === 0" class="proxy-account-drawer__empty">
        <el-empty description="暂无绑定账号">
          <el-button type="primary" @click="handleAddAccount">添加账号</el-button>
        </el-empty>
      </div>

      <div v-else class="account-list">
        <div
          v-for="account in accounts"
          :key="account.id"
          class="account-item"
        >
          <el-avatar :size="36" :src="account.avatar">
            {{ account.nickname?.charAt(0) || '?' }}
          </el-avatar>
          <div class="account-item__info">
            <span class="account-item__name">{{ account.nickname }}</span>
            <el-tag size="small" effect="plain">{{ getPlatformLabel(account.platform) }}</el-tag>
          </div>
          <el-popconfirm title="确定解绑该账号？" @confirm="handleUnbind(account.id)">
            <template #reference>
              <el-button text type="danger" size="small">解绑</el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>

      <div class="proxy-account-drawer__footer">
        <el-button type="primary" @click="handleAddAccount">
          <el-icon><Plus /></el-icon>
          添加账号
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Loading } from '@element-plus/icons-vue';

interface Account {
  id: string;
  platform: string;
  nickname: string;
  avatar: string | null;
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

const loading = ref(false);
const accounts = ref<Account[]>([]);

const platformMap: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  channels: '视频号',
  kuaishou: '快手',
  bilibili: 'B站',
};

function getPlatformLabel(platform: string): string {
  return platformMap[platform] || platform;
}

watch(() => props.modelValue, async (val) => {
  if (val && props.proxyId) {
    await loadAccounts();
  }
});

watch(() => props.proxyId, async (val) => {
  if (val && visible.value) {
    await loadAccounts();
  }
});

async function loadAccounts() {
  if (!props.proxyId) return;
  loading.value = true;
  try {
    const result = await (window.matrixflow.proxy as any).getBoundAccounts(props.proxyId);
    if (result.success && result.data) {
      accounts.value = result.data;
    }
  } catch {
    ElMessage.error('加载账号列表失败');
  } finally {
    loading.value = false;
  }
}

async function handleUnbind(accountId: string) {
  if (!props.proxyId) return;
  try {
    await (window.matrixflow.proxy as any).unbindAccount(props.proxyId, accountId);
    ElMessage.success('已解绑');
    await loadAccounts();
    emit('success');
  } catch {
    ElMessage.error('解绑失败');
  }
}

function handleAddAccount() {
  emit('update:modelValue', false);
  // Emit event to parent to open AccountSelector
  emit('success');
}

function handleClose() {
  accounts.value = [];
}
</script>

<style scoped>
.proxy-account-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.proxy-account-drawer__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8);
  color: var(--color-text-secondary);
}

.proxy-account-drawer__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-y: auto;
  padding: var(--space-2);
}

.account-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
}

.account-item:hover {
  background: var(--color-bg-hover);
}

.account-item__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.account-item__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proxy-account-drawer__footer {
  padding: var(--space-4);
  border-top: 1px solid var(--color-border-light);
}
</style>