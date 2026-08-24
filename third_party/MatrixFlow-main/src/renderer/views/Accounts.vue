<template>
  <div class="page-accounts">
    <!-- 顶部 Tab 切换 -->
    <el-tabs v-model="activeTab" class="page-accounts__tabs">
      <el-tab-pane label="账号管理" name="accounts">
        <template #label>
          <span class="page-accounts__tab-label">
            <el-icon><User /></el-icon>
            账号管理
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="分组管理" name="groups">
        <template #label>
          <span class="page-accounts__tab-label">
            <el-icon><Grid /></el-icon>
            分组管理
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 账号管理内容 -->
    <div v-if="activeTab === 'accounts'" class="page-accounts__content">
      <!-- 嵌套左右分栏 -->
      <div class="page-accounts__split">
        <!-- 左侧筛选面板 -->
        <AccountFilterPanel
          :groups="groupStore.groups"
          :accounts="accountStore.accounts"
          @filter-platform="handlePlatformFilter"
          @filter-group="handleGroupFilter"
        />

        <!-- 右侧内容区 -->
        <div class="page-accounts__main">
          <!-- 多维度筛选工具栏 -->
          <div class="page-accounts__toolbar">
            <div class="page-accounts__filter-bar">
              <el-radio-group v-model="statusFilter" size="small" class="status-filter">
                <el-radio-button value="">全部</el-radio-button>
                <el-radio-button value="online">在线</el-radio-button>
                <el-radio-button value="offline">离线</el-radio-button>
                <el-radio-button value="expired">已过期</el-radio-button>
              </el-radio-group>

              <el-input
                v-model="searchQuery"
                placeholder="搜索账号名称..."
                prefix-icon="Search"
                clearable
                size="small"
                class="search-input"
              />
            </div>

            <div class="page-accounts__toolbar-actions">
              <!-- 视图切换 -->
              <div class="view-toggle">
                <el-button
                  text
                  size="small"
                  :type="viewMode === 'grid' ? 'primary' : ''"
                  @click="viewMode = 'grid'"
                >
                  <el-icon><Grid /></el-icon>
                </el-button>
                <el-button
                  text
                  size="small"
                  :type="viewMode === 'list' ? 'primary' : ''"
                  @click="viewMode = 'list'"
                >
                  <el-icon><List /></el-icon>
                </el-button>
              </div>

              <!-- 添加账号按钮 -->
              <el-button type="primary" size="small" @click="bindDialogVisible = true">
                <el-icon><Plus /></el-icon>
                添加账号
              </el-button>
            </div>
          </div>

          <!-- 账号列表区域 -->
          <div class="page-accounts__list-area">
            <Loading v-if="accountStore.loading" />
            <Empty
              v-else-if="filteredAccounts.length === 0"
              text="暂无匹配的账号"
              action-label="添加账号"
              @action="bindDialogVisible = true"
            />
            <template v-else>
              <!-- 网格视图 -->
              <div v-if="viewMode === 'grid'" class="page-accounts__grid">
                <AccountCard
                  v-for="account in filteredAccounts"
                  :key="account.id"
                  :account="account"
                  :groups="groupStore.groups"
                  @detail="handleDetail"
                  @settings="handleSettings"
                  @validate="handleCheckCookie"
                  @login="handleLogin"
                  @delete="handleDelete"
                />
              </div>

              <!-- 列表视图 -->
              <el-table
                v-else
                :data="filteredAccounts"
                class="page-accounts__table"
                :row-class-name="() => 'account-table-row'"
              >
                <el-table-column label="账号" min-width="240">
                  <template #default="{ row }">
                    <div class="account-table-account">
                      <div class="account-table-avatar" :style="{ borderColor: getPlatformColor(row.platform) }">
                        <span v-if="!row.avatar" class="account-table-avatar__fallback">
                          {{ row.nickname?.charAt(0) || '?' }}
                        </span>
                        <img v-else :src="row.avatar" class="account-table-avatar__img" />
                      </div>
                      <div class="account-table-account__info">
                        <div class="account-table-account__name-row">
                          <span class="account-table-account__name">{{ row.nickname }}</span>
                          <el-tag :type="getPlatformTagType(row.platform)" size="small" effect="plain" class="account-table-account__plat">
                            {{ getPlatformLabel(row.platform) }}
                          </el-tag>
                        </div>
                        <div class="account-table-account__meta">
                          <span class="account-table-account__id">{{ shortId(row.id) }}</span>
                          <span v-if="row.remark" class="account-table-account__remark" :title="row.remark">
                            · {{ row.remark }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column label="状态" width="110">
                  <template #default="{ row }">
                    <div class="account-table-status">
                      <span class="account-table-status__dot" :class="`account-table-status__dot--${row.status}`" />
                      <span class="account-table-status__label">{{ getStatusLabel(row.status) }}</span>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column label="分组" min-width="140">
                  <template #default="{ row }">
                    <div v-if="row.groupInfos && row.groupInfos.length" class="account-table-groups">
                      <span
                        v-for="g in row.groupInfos"
                        :key="g.id"
                        class="account-table-group-chip"
                        :style="{ background: g.color + '22', color: g.color }"
                      >{{ g.name }}</span>
                    </div>
                    <span v-else class="account-table-empty">—</span>
                  </template>
                </el-table-column>

                <el-table-column label="代理" min-width="160">
                  <template #default="{ row }">
                    <div v-if="row.proxyInfo" class="account-table-proxy">
                      <el-icon :size="12" color="var(--color-success)"><Connection /></el-icon>
                      <span class="account-table-proxy__name">{{ row.proxyInfo.name }}</span>
                      <span class="account-table-proxy__addr">{{ row.proxyInfo.protocol }}://{{ row.proxyInfo.host }}:{{ row.proxyInfo.port }}</span>
                    </div>
                    <span v-else class="account-table-empty">—</span>
                  </template>
                </el-table-column>

                <el-table-column label="指纹" width="110">
                  <template #default="{ row }">
                    <span v-if="row.fingerprintId" class="account-table-pill account-table-pill--on">
                      <el-icon :size="11"><Stamp /></el-icon>
                      已绑定
                    </span>
                    <span v-else class="account-table-empty">—</span>
                  </template>
                </el-table-column>

                <el-table-column label="最后登录" width="150">
                  <template #default="{ row }">
                    <span class="account-table-time">{{ formatDate(row.lastLogin) }}</span>
                  </template>
                </el-table-column>

                <el-table-column label="操作" width="180" fixed="right">
                  <template #default="{ row }">
                    <div class="account-table-actions">
                      <el-tooltip content="打开主页" placement="top">
                        <el-button text :icon="Share" circle size="small" @click="openHomepageFromRow(row)" />
                      </el-tooltip>
                      <el-tooltip :content="row.cookieValid ? '检测 Cookie' : '重新登录'" placement="top">
                        <el-button
                          text
                          :icon="row.cookieValid ? CircleCheck : Refresh"
                          circle
                          size="small"
                          :type="row.cookieValid ? 'success' : 'warning'"
                          @click="row.cookieValid ? handleCheckCookie(row.id) : handleLogin(row.id)"
                        />
                      </el-tooltip>
                      <el-tooltip content="账号设置" placement="top">
                        <el-button text :icon="Setting" circle size="small" type="primary" @click="handleDetail(row.id)" />
                      </el-tooltip>
                      <el-popconfirm title="确定删除该账号？" @confirm="handleDelete(row.id)">
                        <template #reference>
                          <el-button text :icon="Delete" circle size="small" type="danger" />
                        </template>
                      </el-popconfirm>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 分组管理 -->
    <div v-if="activeTab === 'groups'" class="page-accounts__groups">
      <GroupsTab />
    </div>

    <!-- 绑定账号弹窗 -->
    <BrowserLoginDialog
      v-model="bindDialogVisible"
      @success="handleRefresh"
    />

    <!-- 账号设置抽屉 -->
    <AccountSettingsDrawer
      v-model="settingsDrawerVisible"
      :account="selectedAccount"
      @changed="handleRefresh"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { User, Grid, List, Plus, Share, CircleCheck, Refresh, Setting, Delete, Connection, Stamp } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAccountStore } from '@/renderer/stores/account';
import { useGroupStore } from '@/renderer/stores/group';
import type { Account } from '@/renderer/stores/account';
import Loading from '@/renderer/components/common/Loading.vue';
import Empty from '@/renderer/components/common/Empty.vue';
import AccountCard from '@/renderer/components/account/AccountCard.vue';
import AccountFilterPanel from '@/renderer/components/account/AccountFilterPanel.vue';
import BrowserLoginDialog from '@/renderer/components/account/BrowserLoginDialog.vue';
import AccountSettingsDrawer from '@/renderer/components/account/AccountSettingsDrawer.vue';
import GroupsTab from '@/renderer/components/group/GroupsTab.vue';

const accountStore = useAccountStore();
const groupStore = useGroupStore();
const route = useRoute();

// Tab 状态
const activeTab = ref('accounts');

// 筛选状态
const platformFilter = ref('');
const groupFilter = ref('');
const statusFilter = ref('');
const searchQuery = ref('');
const viewMode = ref<'grid' | 'list'>('grid');

// 弹窗状态
const bindDialogVisible = ref(false);
const settingsDrawerVisible = ref(false);
const selectedAccount = ref<Account | null>(null);

// 筛选后的账号列表
const filteredAccounts = computed(() => {
  let list = accountStore.accounts;

  if (platformFilter.value) {
    list = list.filter((a) => a.platform === platformFilter.value);
  }
  if (groupFilter.value) {
    if (groupFilter.value === '__ungrouped__') {
      list = list.filter((a) => !a.groupId);
    } else {
      list = list.filter((a) => a.groupId === groupFilter.value);
    }
  }
  if (statusFilter.value) {
    list = list.filter((a) => a.status === statusFilter.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((a) => a.nickname.toLowerCase().includes(q));
  }

  return list;
});

// 平台映射
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

function getPlatformLabel(platform: string) {
  return platformMap[platform] || platform;
}

function getPlatformTagType(platform: string) {
  return platformTagTypeMap[platform] || 'info';
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = { online: '在线', offline: '离线', expired: '已过期' };
  return map[status] || status;
}

function getGroupName(groupId?: string) {
  if (!groupId) return '';
  const group = groupStore.groups.find((g) => g.id === groupId);
  return group?.name || '';
}

onMounted(() => {
  accountStore.fetchAccounts();
  groupStore.fetchGroups();
  if (route.query.action === 'add') {
    bindDialogVisible.value = true;
  }
});

function handleRefresh() {
  accountStore.fetchAccounts();
}

function handlePlatformFilter(value: string) {
  platformFilter.value = value;
}

function handleGroupFilter(value: string) {
  groupFilter.value = value;
}

function handleStatusFilter(value: string) {
  statusFilter.value = value;
}

function handleDetail(id: string) {
  selectedAccount.value = accountStore.accounts.find((a) => a.id === id) || null;
  settingsDrawerVisible.value = true;
}

function handleSettings(id: string) {
  selectedAccount.value = accountStore.accounts.find((a) => a.id === id) || null;
  settingsDrawerVisible.value = true;
}

async function handleLogin(id: string) {
  try {
    await accountStore.loginAccount(id);
    ElMessage.success('登录请求已发送');
  } catch {
    ElMessage.error('登录失败');
  }
}

async function handleCheckCookie(id: string) {
  try {
    const valid = await accountStore.checkCookie(id);
    ElMessage(valid ? 'Cookie 有效' : 'Cookie 已失效，请重新登录');
  } catch {
    ElMessage.error('检测失败');
  }
}

async function handleDelete(id: string) {
  await accountStore.deleteAccount(id);
  ElMessage.success('已删除');
}

const platformColorMap: Record<string, string> = {
  douyin: 'var(--color-plat-douyin)',
  xiaohongshu: 'var(--color-plat-xiaohongshu)',
  channels: 'var(--color-plat-wechat)',
  kuaishou: 'var(--color-plat-kuaishou)',
  bilibili: 'var(--color-plat-bilibili)',
};

function getPlatformColor(platform: string) {
  return platformColorMap[platform] || 'var(--color-primary)';
}

function shortId(id: string) {
  return id.length > 16 ? id.slice(0, 16) + '…' : id;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return dateStr;
  }
}

const PLATFORM_HOMEPAGE: Record<string, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/home',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  kuaishou: 'https://cp.kuaishou.com/article/publish/video',
  bilibili: 'https://member.bilibili.com/platform/home',
  channels: 'https://channels.weixin.qq.com/platform',
};

async function openHomepageFromRow(row: Account) {
  if (!row.cookieValid) {
    ElMessage.warning('账号已离线，请重新登录');
    return;
  }
  const url = row.homepageUrl || PLATFORM_HOMEPAGE[row.platform];
  if (!url) {
    ElMessage.warning('未配置主页地址');
    return;
  }
  try {
    const result = await window.matrixflow.browser.openAccountBrowser(row.id, url);
    if (!result.success) {
      ElMessage.warning(result.message || '登录态已过期，请重新登录');
    }
  } catch {
    ElMessage.error('打开主页失败');
  }
}
</script>

<style scoped>
.page-accounts {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-page);
}

/* ── Tab 栏 ── */
.page-accounts__tabs {
  background: var(--color-bg-card);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.page-accounts__tabs :deep(.el-tabs__header) {
  margin: 0;
}

.page-accounts__tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.page-accounts__tab-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* ── 内容区分栏 ── */
.page-accounts__content {
  flex: 1;
  overflow: hidden;
}

.page-accounts__split {
  display: flex;
  height: 100%;
}

/* ── 右侧主内容区 ── */
.page-accounts__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 工具栏 ── */
.page-accounts__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
}

.page-accounts__filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
}

.status-filter {
  flex-shrink: 0;
}

.search-input {
  width: 200px;
}

.page-accounts__toolbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* ── 视图切换 ── */
.view-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
}

/* ── 列表区域 ── */
.page-accounts__list-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

/* ── 卡片网格 ── */
.page-accounts__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-4);
}

/* ── 列表视图 ── */
.page-accounts__table {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border-light);
}

.page-accounts__table :deep(.el-table__header th) {
  background: var(--color-bg-page);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  height: 40px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-border-light);
}

.page-accounts__table :deep(.el-table__row) {
  transition: background var(--transition-fast);
}

.page-accounts__table :deep(.el-table__row:hover > td) {
  background: var(--color-bg-page) !important;
}

.page-accounts__table :deep(.el-table__row td) {
  padding: 0 var(--space-3);
  height: 64px;
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: middle;
}

.page-accounts__table :deep(.el-table__row:last-child td) {
  border-bottom: none;
}

.page-accounts__table :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.account-table-row {
  cursor: default;
}

/* ── 账号列 ── */
.account-table-account {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.account-table-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-border);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-page);
}

.account-table-avatar__fallback {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
}

.account-table-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-table-account__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.account-table-account__name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.account-table-account__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.account-table-account__plat {
  flex-shrink: 0;
  height: 18px;
  padding: 0 6px;
  font-size: 10px;
}

.account-table-account__meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-2xs);
  color: var(--color-text-placeholder);
  min-width: 0;
}

.account-table-account__id {
  font-family: var(--font-family-mono);
  flex-shrink: 0;
}

.account-table-account__remark {
  color: var(--color-text-secondary);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

/* ── 状态列 ── */
.account-table-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-bg-page);
}

.account-table-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.account-table-status__dot--online {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

.account-table-status__dot--offline {
  background: var(--color-text-placeholder);
}

.account-table-status__dot--expired {
  background: var(--color-danger);
}

.account-table-status__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-regular);
  font-weight: var(--font-weight-medium);
}

/* ── 分组列 ── */
.account-table-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.account-table-group-chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  line-height: 1.5;
  font-weight: var(--font-weight-medium);
}

/* ── 代理列 ── */
.account-table-proxy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.account-table-proxy__name {
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.account-table-proxy__addr {
  font-size: var(--font-size-2xs);
  color: var(--color-text-placeholder);
  font-family: var(--font-family-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 指纹列 ── */
.account-table-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.account-table-pill--on {
  color: var(--color-success);
  background: var(--color-success-light);
}

/* ── 通用空值 ── */
.account-table-empty {
  color: var(--color-text-placeholder);
  font-size: var(--font-size-sm);
}

/* ── 时间列 ── */
.account-table-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── 操作列 ── */
.account-table-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-content: flex-end;
}

.account-table-actions :deep(.el-button) {
  width: 28px;
  height: 28px;
  padding: 0;
}

.account-table-actions :deep(.el-button .el-icon) {
  font-size: 14px;
}

/* ── 占位符 ── */
.page-accounts__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
}

/* ── 响应式 ── */
.page-accounts__groups {
  flex: 1;
}

@media (max-width: 1024px) {
  .page-accounts__split {
    flex-direction: column;
  }

  .page-accounts__split :deep(.filter-panel) {
    width: 100%;
    min-width: unset;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    flex-direction: row;
    overflow-x: auto;
  }

  .page-accounts__filter-bar {
    flex-wrap: wrap;
  }

  .search-input {
    width: 160px;
  }
}
</style>