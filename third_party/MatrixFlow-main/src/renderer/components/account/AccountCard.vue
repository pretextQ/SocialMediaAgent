<template>
  <div class="account-card" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <div class="account-card__head">
      <div class="account-card__head-left">
        <div class="account-card__avatar-wrap" :style="avatarRingStyle">
          <div class="account-card__status-dot" :class="isOnline ? 'account-card__status-dot--on' : 'account-card__status-dot--off'"></div>
          <img v-if="account.avatar" :src="account.avatar" class="account-card__avatar-img" />
          <span v-else class="account-card__avatar-fallback">{{ initial }}</span>
        </div>
        <div class="account-card__head-info">
          <span class="account-card__name">{{ account.nickname }}</span>
          <el-tag :type="platformTagType" size="small" effect="plain" class="account-card__plat-tag">
            {{ platformLabel }}
          </el-tag>
          <el-button v-if="!isOnline" text size="small" type="warning" class="account-card__relogin-btn" @click.stop="$emit('login', account.id)">
            重新登录
          </el-button>
        </div>
      </div>
      <div class="account-card__head-actions" :class="{ 'account-card__head-actions--visible': hovered }">
        <el-tooltip content="账号设置" placement="top">
          <el-button text size="small" :icon="Setting" circle class="account-card__icon-btn" @click.stop="$emit('settings', account.id)" />
        </el-tooltip>
        <el-tooltip content="打开主页" placement="top">
          <el-button text size="small" :icon="Share" circle class="account-card__icon-btn" @click.stop="openHomepage" />
        </el-tooltip>
        <el-popconfirm title="确定删除该账号？" @confirm="$emit('delete', account.id)">
          <template #reference>
            <el-button text size="small" type="danger" :icon="Delete" circle class="account-card__icon-btn" />
          </template>
        </el-popconfirm>
      </div>
    </div>

    <div class="account-card__tags">
      <span class="account-card__tag" :class="isOnline ? 'account-card__tag--done' : 'account-card__tag--warn'">
        <el-icon :size="11"><CircleCheck /></el-icon>
        {{ isOnline ? '在线' : '离线' }}
      </span>

      <el-popover
        :visible="showProxyPicker"
        placement="bottom"
        :width="240"
        trigger="click"
        :virtual-ref="proxyTriggerRef"
        virtual-triggering
      >
        <div class="account-card__picker">
          <div class="account-card__picker-header">
            <span>选择代理</span>
            <el-button v-if="account.proxyId" text size="small" type="danger" @click="clearProxy">清除</el-button>
          </div>
          <div class="account-card__picker-list">
            <div
              v-for="p in proxyList"
              :key="p.id"
              class="account-card__picker-item"
              :class="{ 'account-card__picker-item--active': p.id === account.proxyId }"
              @click="selectProxy(p.id)"
            >
              <div class="account-card__picker-item-main">
                <span class="account-card__picker-item-name">{{ p.name }}</span>
                <span class="account-card__picker-item-addr">{{ p.protocol }}://{{ p.host }}:{{ p.port }}</span>
              </div>
              <el-icon v-if="p.id === account.proxyId" :size="14" color="var(--color-primary)"><CircleCheck /></el-icon>
            </div>
            <div v-if="!proxyList.length" class="account-card__picker-empty">
              暂无代理，请先在系统设置中添加
            </div>
          </div>
        </div>
      </el-popover>
      <span
        ref="proxyTriggerRef"
        class="account-card__tag"
        :class="account.proxyId ? 'account-card__tag--done' : 'account-card__tag--empty'"
        @click.stop="openProxyPicker"
      >
        <el-icon :size="11"><Connection /></el-icon>
        {{ account.proxyId ? '代理已设' : '设置代理' }}
      </span>
      <span v-if="account.proxyId && proxyDisplay" class="account-card__tag account-card__tag--info">
        {{ proxyDisplay }}
      </span>

      <span v-if="account.fingerprintId" class="account-card__tag account-card__tag--done">
        <el-icon :size="11"><Stamp /></el-icon>
        指纹已设
      </span>

      <el-popover
        :visible="showGroupPicker"
        placement="bottom"
        :width="180"
        trigger="click"
        :virtual-ref="groupTriggerRef"
        virtual-triggering
      >
        <div class="account-card__picker">
          <div class="account-card__picker-header">
            <span>选择分组</span>
            <el-button v-if="activeGroupIds.size > 0" text size="small" type="danger" @click="clearAllGroups">清除全部</el-button>
          </div>
          <div class="account-card__picker-list">
            <div
              v-for="g in groups"
              :key="g.id"
              class="account-card__picker-item"
              :class="{ 'account-card__picker-item--active': activeGroupIds.has(g.id) }"
              @click="toggleGroup(g.id)"
            >
              <span class="account-card__group-dot" :style="{ background: g.color }"></span>
              <span class="account-card__picker-item-name">{{ g.name }}</span>
              <el-icon v-if="activeGroupIds.has(g.id)" :size="14" color="var(--color-primary)"><CircleCheck /></el-icon>
            </div>
            <div v-if="!groups.length" class="account-card__picker-empty">
              暂无分组，请先在分组管理中创建
            </div>
          </div>
        </div>
      </el-popover>
      <span ref="groupTriggerRef" class="account-card__tag"
        :class="accountGroupInfos.length ? 'account-card__tag--group' : 'account-card__tag--empty'"
        @click.stop="showGroupPicker = !showGroupPicker"
      >
        <template v-if="accountGroupInfos.length">
          <span
            v-for="gc in accountGroupInfos"
            :key="gc.id"
            class="account-card__group-chip"
            :style="{ background: gc.color + '22', color: gc.color }"
          >{{ gc.name }}</span>
        </template>
        <template v-else>
          <el-icon :size="11"><FolderOpened /></el-icon>
          分组+
        </template>
      </span>
    </div>

    <div class="account-card__remark-area">
      <div v-if="!editingRemark" class="account-card__remark-display" @click="startEditRemark">
        <template v-if="account.remark">
          <el-icon :size="12"><ChatLineRound /></el-icon>
          <span>{{ account.remark }}</span>
        </template>
        <template v-else>
          <el-icon :size="12"><EditPen /></el-icon>
          <span>添加备注</span>
        </template>
      </div>
      <div v-else class="account-card__remark-edit">
        <el-input
          v-model="remarkInput"
          size="small"
          placeholder="输入备注..."
          maxlength="100"
          @keydown.enter="saveRemark"
          @keydown.escape="editingRemark = false"
          @blur="saveRemark"
        />
      </div>
    </div>

    <div class="account-card__info">
      <div class="account-card__info-col">
        <div class="account-card__info-row">
          <span class="account-card__info-key">账号 ID</span>
          <span class="account-card__info-val account-card__info-val--mono">{{ shortId }}</span>
        </div>
        <div class="account-card__info-row">
          <span class="account-card__info-key">上次登录</span>
          <span class="account-card__info-val">{{ formatDate(account.lastLogin || account.createdAt) }}</span>
        </div>
      </div>
      <div class="account-card__info-col">
        <div class="account-card__info-row">
          <span class="account-card__info-key">浏览器</span>
          <span class="account-card__info-val">{{ browserModeLabel }}</span>
        </div>
        <div class="account-card__info-row">
          <span class="account-card__info-key">添加时间</span>
          <span class="account-card__info-val">{{ formatDate(account.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, Stamp, Connection, FolderOpened, CircleCheck, ChatLineRound, EditPen, Share, Setting } from '@element-plus/icons-vue';
import type { Account } from '@/renderer/stores/account';
import { useAccountStore } from '@/renderer/stores/account';
import { useGroupStore } from '@/renderer/stores/group';

const props = defineProps<{
  account: Account;
  groups: Array<{ id: string; name: string; color: string }>;
}>();

const emit = defineEmits<{
  detail: [id: string];
  validate: [id: string];
  login: [id: string];
  delete: [id: string];
  settings: [id: string];
}>();

const store = useAccountStore();
const groupStore = useGroupStore();
const hovered = ref(false);
const editingRemark = ref(false);
const remarkInput = ref('');
const showProxyPicker = ref(false);
const showGroupPicker = ref(false);
const proxyTriggerRef = ref<HTMLElement>();
const groupTriggerRef = ref<HTMLElement>();

interface ProxyItem {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
}

const proxyList = ref<ProxyItem[]>([]);

onMounted(async () => {
  await loadProxies();
});

async function loadProxies() {
  if (!window.matrixflow?.proxy?.list) return;
  try {
    const res = await window.matrixflow.proxy.list();
    const data = (res as any)?.data ?? res;
    proxyList.value = Array.isArray(data) ? data : [];
  } catch {
    proxyList.value = [];
  }
}

const platformMap: Record<string, string> = {
  douyin: '抖音', xiaohongshu: '小红书', channels: '视频号', kuaishou: '快手', bilibili: 'B站',
};
const platformTagTypeMap: Record<string, string> = {
  douyin: '', xiaohongshu: 'danger', channels: 'success', kuaishou: 'warning', bilibili: 'primary',
};
const platformColorMap: Record<string, string> = {
  douyin: 'var(--color-plat-douyin)', xiaohongshu: 'var(--color-plat-xiaohongshu)',
  channels: 'var(--color-plat-wechat)', kuaishou: 'var(--color-plat-kuaishou)', bilibili: 'var(--color-plat-bilibili)',
};
const browserModeMap: Record<string, string> = {
  embedded: '内嵌浏览器', chrome: 'Chrome', fingerprint: '指纹环境+',
};

const isOnline = computed(() => props.account.cookieValid);
const platformLabel = computed(() => platformMap[props.account.platform] || props.account.platform);
const platformTagType = computed(() => platformTagTypeMap[props.account.platform] || 'info');
const platformColor = computed(() => platformColorMap[props.account.platform] || 'var(--color-primary)');
const initial = computed(() => props.account.nickname?.charAt(0) || '?');
const shortId = computed(() => props.account.id.length > 16 ? props.account.id.slice(0, 16) + '...' : props.account.id);

const browserMode = computed(() => props.account.browserMode || 'embedded');
const browserModeLabel = computed(() => browserModeMap[browserMode.value] || browserMode.value);

const proxyDisplay = computed(() => {
  const p = props.account.proxyInfo;
  if (!p) return '';
  return `${p.protocol}://${p.host}:${p.port}`;
});

const accountGroupInfos = computed(() => {
  return props.account.groupInfos || [];
});

const activeGroupIds = computed(() => {
  return new Set((props.account.groupIds || []));
});

const avatarRingStyle = computed(() => ({
  borderColor: platformColor.value,
}));

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return dateStr; }
}

function startEditRemark() {
  remarkInput.value = props.account.remark || '';
  editingRemark.value = true;
}

async function saveRemark() {
  if (!editingRemark.value) return;
  editingRemark.value = false;
  const newRemark = remarkInput.value.trim();
  if (newRemark === (props.account.remark || '')) return;
  await store.updateRemark(props.account.id, newRemark);
}

function openProxyPicker() {
  showProxyPicker.value = !showProxyPicker.value;
}

async function selectProxy(proxyId: string) {
  showProxyPicker.value = false;
  if (!window.matrixflow?.account?.setProxy) return;
  await window.matrixflow.account.setProxy(props.account.id, proxyId);
  await store.fetchAccounts();
}

async function clearProxy() {
  showProxyPicker.value = false;
  if (!window.matrixflow?.account?.setProxy) return;
  await window.matrixflow.account.setProxy(props.account.id, null);
  await store.fetchAccounts();
}

async function toggleGroup(groupId: string) {
  if (!window.matrixflow?.accounts?.setGroup) return;
  const action = activeGroupIds.value.has(groupId) ? 'remove' : 'add';
  await window.matrixflow.accounts.setGroup(props.account.id, groupId, action);
  await Promise.all([store.fetchAccounts(), groupStore.fetchGroups()]);
}

async function clearAllGroups() {
  showGroupPicker.value = false;
  if (!window.matrixflow?.accounts?.setGroup) return;
  for (const gid of activeGroupIds.value) {
    await window.matrixflow.accounts.setGroup(props.account.id, gid, 'remove');
  }
  await Promise.all([store.fetchAccounts(), groupStore.fetchGroups()]);
}

const PLATFORM_HOMEPAGE: Record<string, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/home',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  kuaishou: 'https://cp.kuaishou.com/article/publish/video',
  bilibili: 'https://member.bilibili.com/platform/home',
  channels: 'https://channels.weixin.qq.com/platform',
};

async function openHomepage() {
  if (!isOnline.value) {
    ElMessage.warning('账号已离线，请重新登录');
    emit('login', props.account.id);
    return;
  }

  const url = props.account.homepageUrl || PLATFORM_HOMEPAGE[props.account.platform];
  if (!url) return;

  const result = await window.matrixflow.browser.openAccountBrowser(props.account.id, url);
  if (!result.success) {
    ElMessage.warning(result.message || '登录态已过期，请重新登录');
    emit('login', props.account.id);
  }
}
</script>

<style scoped>
.account-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-card);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-xs);
  transition: all var(--transition-base);
}

.account-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-lighter);
  transform: translateY(-1px);
}

.account-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.account-card__head-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}

.account-card__avatar-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-border);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-page);
}

.account-card__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-card__avatar-fallback {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
}

.account-card__status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--color-bg-card);
  z-index: 1;
}

.account-card__status-dot--on {
  background: var(--color-success);
}

.account-card__status-dot--off {
  background: var(--color-text-placeholder);
}

.account-card__head-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  flex-wrap: wrap;
}

.account-card__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-card__plat-tag {
  flex-shrink: 0;
}

.account-card__relogin-btn {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  height: 20px;
}

.account-card__head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.account-card__head-actions--visible {
  opacity: 1;
}

.account-card__icon-btn {
  width: 28px;
  height: 28px;
}

.account-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.account-card__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--font-size-3xs);
  font-weight: var(--font-weight-medium);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  white-space: nowrap;
  cursor: default;
}

.account-card__tag--empty {
  color: var(--color-text-placeholder);
  background: transparent;
  border: 1px dashed var(--color-border);
  cursor: pointer;
}

.account-card__tag--empty:hover {
  border-color: var(--color-primary-light);
  color: var(--color-primary);
}

.account-card__tag--done {
  color: var(--color-success);
  background: var(--color-success-light);
  cursor: pointer;
}

.account-card__tag--warn {
  color: var(--color-danger);
  background: var(--color-danger-light);
}

.account-card__tag--info {
  color: var(--color-info);
  background: var(--color-info-light, #f0f5ff);
}

.account-card__tag--accent {
  color: #8a2be2;
  background: #f3e8ff;
}

.account-card__tag--group {
  border: 1px solid var(--color-border-light);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
}

.account-card__tag--group:hover {
  filter: brightness(0.95);
}

.account-card__group-chip {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  line-height: 1.4;
}

.account-card__picker {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: -12px;
}

.account-card__picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--color-border-light);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.account-card__picker-list {
  max-height: 240px;
  overflow-y: auto;
  padding: var(--space-1) 0;
}

.account-card__picker-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.account-card__picker-item:hover {
  background: var(--color-bg-page);
}

.account-card__picker-item--active {
  background: var(--color-primary-lighter);
}

.account-card__picker-item-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.account-card__picker-item-name {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-card__picker-item-addr {
  font-size: var(--font-size-2xs);
  color: var(--color-text-placeholder);
  font-family: var(--font-family-mono);
}

.account-card__picker-empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  text-align: center;
  padding: var(--space-4) var(--space-3);
}

.account-card__group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.account-card__remark-area {
  min-height: 28px;
}

.account-card__remark-display {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  padding: var(--space-1) var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.account-card__remark-display:hover {
  border-color: var(--color-primary-light);
  color: var(--color-text-secondary);
  background: var(--color-bg-page);
}

.account-card__remark-edit :deep(.el-input__wrapper) {
  border-radius: var(--radius-md);
}

.account-card__info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-light);
}

.account-card__info-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-card__info-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.account-card__info-key {
  font-size: var(--font-size-3xs);
  color: var(--color-text-placeholder);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  flex-shrink: 0;
}

.account-card__info-val {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-card__info-val--mono {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-2xs);
}
</style>
