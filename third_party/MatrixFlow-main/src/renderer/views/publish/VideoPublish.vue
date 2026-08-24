<template>
  <div class="page-video">
    <!-- 发布子导航 -->
    <nav class="page-video__tabs">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="page-video__tab"
        :class="{ 'page-video__tab--active': isActive(item.path) }"
      >
        <el-icon :size="15"><component :is="item.icon" /></el-icon>
        {{ item.label }}
      </router-link>
    </nav>

    <!-- 主体内容 -->
    <div class="page-video__body">
      <!-- 左侧 + 右侧内容包装 -->
      <div class="page-video__content">
        <!-- 左侧配置面板 -->
        <div class="page-video__left">
          <div class="page-video__left-scroll">
            <VideoUploadCard
              :model-value="uploadState"
              @update:model-value="handleUploadStateUpdate"
              @delete="handleDeleteVideo"
              @auto-title="handleAutoTitle"
            />

            <VideoCommonForm :model-value="commonConfig" @update:model-value="handleCommonConfigUpdate" />

            <div class="page-video__sync-bar">
              <span class="page-video__sync-hint">
                <el-icon :size="14"><Promotion /></el-icon>
                将通用配置同步至右侧各平台账号
              </span>
              <div class="page-video__sync-actions">
                <el-button size="small" @click="handleClearCommonConfig">清空</el-button>
                <el-button size="small" type="primary" @click="handleApplyToAccounts">应用账号</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧账号 + 配置 -->
        <div class="page-video__right">
          <PlatformAccountBar
            :accounts="platformAccounts"
            :selected-account-id="selectedAccountId"
            @select="handleSelectAccount"
            @add-account="handleAddAccount"
          />

          <PlatformConfigEditor
            v-if="selectedAccount"
            :account="selectedAccount"
            :platform-config="platformConfigs[selectedAccount.id] || {}"
            :common-config="commonConfig"
            @update:platform-config="handleUpdatePlatformConfig"
          />

          <!-- 无账号时的默认空状态 -->
          <div v-if="!selectedAccount && platformAccounts.length === 0" class="page-video__right-empty">
            <el-icon :size="48" color="var(--color-text-placeholder)"><VideoCamera /></el-icon>
            <p class="page-video__right-empty-title">添加发布账号</p>
            <p class="page-video__right-empty-desc">选择需要发布的平台账号，开始配置发布内容</p>
            <el-button type="primary" @click="handleAddAccount">
              <el-icon :size="14"><Plus /></el-icon>
              添加账号
            </el-button>
          </div>
        </div>
      </div>

      <!-- 全宽底部操作栏 -->
      <div class="page-video__footer">
        <div class="page-video__publish-mode">
          <span class="page-video__publish-mode-label">发布方式</span>
          <el-radio-group v-model="headlessMode" size="small">
            <el-radio-button :value="false">浏览器可视</el-radio-button>
            <el-radio-button :value="true">后台静默</el-radio-button>
          </el-radio-group>
          <el-checkbox
            v-if="isDevelopment"
            v-model="publishDebugMode"
            class="page-video__debug-toggle"
          >
            调试步骤
          </el-checkbox>
        </div>
        <PublishActionBar
          :publishing="isPublishing"
          :disabled="isPublishing"
          @clear-all="handleClearAll"
          @save-draft="handleSaveDraft"
          @publish="handlePublish"
        />
      </div>

      <transition name="publish-queue">
        <div v-if="queueVisible" class="publish-queue" role="dialog" aria-label="发布队列">
          <div class="publish-queue__panel">
            <div class="publish-queue__header">
              <div>
                <h3 class="publish-queue__title">发布队列</h3>
                <p class="publish-queue__subtitle">{{ publishQueueSummary }}</p>
              </div>
              <el-button
                v-if="!isPublishing"
                text
                size="small"
                @click="queueVisible = false"
              >
                关闭
              </el-button>
            </div>

            <div class="publish-queue__rail">
              <div
                v-for="(item, index) in publishQueue"
                :key="item.id"
                class="publish-queue__item"
                :class="`publish-queue__item--${item.status}`"
                :style="{ '--delay': `${index * 70}ms` }"
              >
                <div class="publish-queue__step">
                  <span v-if="item.status === 'success'">✓</span>
                  <span v-else-if="item.status === 'failed'">!</span>
                  <span v-else>{{ index + 1 }}</span>
                </div>
                <div class="publish-queue__meta">
                  <div class="publish-queue__line">
                    <span class="publish-queue__platform">{{ item.platformLabel }}</span>
                    <span class="publish-queue__account">{{ item.accountName }}</span>
                  </div>
                  <div class="publish-queue__message">{{ item.message }}</div>
                </div>
                <div v-if="item.status === 'running'" class="publish-queue__pulse" />
              </div>
            </div>
          </div>
        </div>
      </transition>

      <AccountPickerDialog
        v-model="showAccountPicker"
        :platform-configs="platformConfigs"
        @confirm="handleAccountsConfirmed"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, toRaw, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { List, Document, VideoCamera, Promotion, Plus } from '@element-plus/icons-vue';
import VideoUploadCard from '@/renderer/components/publish/VideoUploadCard.vue';
import VideoCommonForm from '@/renderer/components/publish/VideoCommonForm.vue';
import PlatformAccountBar from '@/renderer/components/publish/PlatformAccountBar.vue';
import PlatformConfigEditor from '@/renderer/components/publish/PlatformConfigEditor.vue';
import PublishActionBar from '@/renderer/components/publish/PublishActionBar.vue';
import AccountPickerDialog from '@/renderer/components/publish/AccountPickerDialog.vue';
import { useAccountStore } from '@/renderer/stores/account';
import { useDraftStore } from '@/renderer/stores/draft';
import { useTaskStore } from '@/renderer/stores/task';
import { useAccountPublishPresetStore } from '@/renderer/stores/account-publish-preset';
import type { Account } from '@/renderer/stores/account';
import type { PublishPreset } from '@/renderer/stores/account-publish-preset';

const route = useRoute();
const router = useRouter();

const navItems = [
  { path: '/publish/tasks', label: '任务列表', icon: List },
  { path: '/publish/drafts', label: '草稿', icon: Document },
  { path: '/publish/video', label: '视频发布', icon: VideoCamera },
];

function isActive(path: string) {
  return route.path === path;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number;
  fileName?: string;
  fileSize?: number;
  coverUrl?: string;
  thumbnailPath?: string;
  filePath?: string;
  videoUrl?: string;
  errorMessage?: string;
}

interface PlatformConfig {
  title?: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  coverRatio?: string;
  location?: string;
  visibility?: string;
  declaration?: string;
  scheduleMode?: 'immediate' | 'scheduled';
  scheduledAt?: string;
  allowComment?: boolean;
  allowShare?: boolean;
  allowSameFrame?: boolean;
  allowDownload?: boolean;
  showInCity?: boolean;
}

interface CommonConfig {
  title: string;
  description: string;
  tags: string[];
  scheduleMode: 'immediate' | 'scheduled';
  scheduledAt?: string;
}

type QueueStatus = 'queued' | 'preparing' | 'running' | 'success' | 'failed';

interface PublishQueueItem {
  id: string;
  accountId: string;
  accountName: string;
  platform: string;
  platformLabel: string;
  status: QueueStatus;
  message: string;
  taskId?: string;
}

const accountStore = useAccountStore();
const draftStore = useDraftStore();
const taskStore = useTaskStore();
const presetStore = useAccountPublishPresetStore();

const uploadState = reactive<UploadState>({
  status: 'idle',
  progress: 0,
});

const commonConfig = reactive<CommonConfig>({
  title: '',
  description: '',
  tags: [],
  scheduleMode: 'immediate',
  scheduledAt: '',
});

const platformConfigs = reactive<Record<string, PlatformConfig>>({});

const selectedAccountId = ref<string | null>(null);

const currentDraftId = ref<string | null>(null);

const isDevelopment = import.meta.env.DEV;
const headlessMode = ref(false);
const publishDebugMode = ref(isDevelopment);
const showAccountPicker = ref(false);
const isPublishing = ref(false);
const queueVisible = ref(false);
const publishQueue = ref<PublishQueueItem[]>([]);

const platformInfoMap: Record<string, { label: string; color: string; short: string }> = {
  xiaohongshu: { label: '小红书', color: '#FF2442', short: '红' },
  douyin: { label: '抖音', color: '#000000', short: '音' },
  bilibili: { label: 'B站', color: '#FB7299', short: 'B' },
  channels: { label: '视频号', color: '#07C160', short: '视' },
  kuaishou: { label: '快手', color: '#FF4906', short: '快' },
  weibo: { label: '微博', color: '#E6162D', short: '博' },
  zhihu: { label: '知乎', color: '#0066FF', short: '知' },
};

const publishQueueSummary = computed(() => {
  const total = publishQueue.value.length;
  const done = publishQueue.value.filter(item => item.status === 'success').length;
  const failed = publishQueue.value.filter(item => item.status === 'failed').length;
  if (isPublishing.value) return `${done + failed}/${total} 已处理，队列按账号顺序逐个执行`;
  return `完成 ${done} 个，失败 ${failed} 个`;
});

async function restoreDraft(draftId: string) {
  try {
    const draft = await draftStore.getDraft(draftId);
    if (!draft) {
      ElMessage.error('草稿不存在或已被删除');
      return;
    }

    const snap = (draft.snapshotJson || {}) as Record<string, unknown>;
    if (!snap.materialId) {
      ElMessage.error('草稿数据异常，无法还原');
      return;
    }

    // 还原 currentDraftId
    currentDraftId.value = draft.id;

    // 还原通用配置
    commonConfig.title = (snap.title as string) || draft.title || '';
    commonConfig.description = (snap.description as string) || '';
    commonConfig.tags = Array.isArray(snap.tags) ? snap.tags as string[] : [];
    if (snap.scheduledTime) {
      commonConfig.scheduleMode = 'scheduled';
      commonConfig.scheduledAt = snap.scheduledTime as string;
    } else {
      commonConfig.scheduleMode = 'immediate';
      commonConfig.scheduledAt = '';
    }

    // 还原上传状态
    const materialId = snap.materialId as string;
    const materialPath = (snap.materialPath as string) || '';
    const configs = snap.platformConfigs as Array<Record<string, unknown>> | undefined;
    const fallbackCover = configs?.find(config => typeof config.coverUrl === 'string' && config.coverUrl)?.coverUrl as string | undefined;
    const coverPath = stripLocalFileProtocol((snap.coverPath as string) || fallbackCover || '');
    uploadState.status = 'done';
    uploadState.progress = 100;
    uploadState.videoUrl = materialId;
    uploadState.filePath = materialPath;
    uploadState.thumbnailPath = coverPath;
    uploadState.coverUrl = toLocalFileUrl(coverPath);
    uploadState.fileName = materialPath ? materialPath.split('/').pop() || '' : '';

    // 清空现有账号配置
    for (const key of Object.keys(platformConfigs)) {
      delete platformConfigs[key];
    }

    // 还原账号配置
    if (configs && configs.length > 0) {
      for (const config of configs) {
        const accountId = config.accountId as string;
        if (!accountId) continue;
        const configCover = stripLocalFileProtocol(config.coverUrl as string | undefined) || coverPath;
        platformConfigs[accountId] = {
          title: config.title as string | undefined,
          description: config.description as string | undefined,
          tags: config.tags as string[] | undefined,
          coverUrl: toLocalFileUrl(configCover),
          location: config.location as string | undefined,
          visibility: config.visibility as string | undefined,
          declaration: config.declaration as string | undefined,
          scheduleMode: (config.scheduleMode as 'immediate' | 'scheduled') || undefined,
          scheduledAt: config.scheduledAt as string | undefined,
          allowComment: config.allowComment as boolean | undefined,
          allowShare: config.allowShare as boolean | undefined,
          allowSameFrame: config.allowSameFrame as boolean | undefined,
          allowDownload: config.allowDownload as boolean | undefined,
          showInCity: config.showInCity as boolean | undefined,
        };
      }
      selectedAccountId.value = (configs[0].accountId as string) || null;
    }

    // 清掉 URL 中的 draftId 参数，避免刷新时重复加载
    router.replace({ path: '/publish/video' });

    ElMessage.success('草稿已加载');
  } catch (e) {
    console.error('加载草稿失败:', e);
    ElMessage.error('加载草稿失败');
  }
}

onMounted(() => {
  const draftId = route.query.draftId as string;
  if (draftId) {
    restoreDraft(draftId);
  }
});

const platformAccounts = computed(() => {
  const addedAccountIds = new Set(Object.keys(platformConfigs));
  const groups = new Map<string, { platform: string; label: string; color: string; short: string; accounts: Account[] }>();

  for (const account of accountStore.accounts) {
    if (!addedAccountIds.has(account.id)) continue;
    const info = platformInfoMap[account.platform] || { label: account.platform, color: '#909399', short: account.platform[0].toUpperCase() };
    if (!groups.has(account.platform)) {
      groups.set(account.platform, { platform: account.platform, label: info.label, color: info.color, short: info.short, accounts: [] });
    }
    groups.get(account.platform)!.accounts.push(account);
  }

  return Array.from(groups.values());
});

const selectedAccount = computed(() => {
  if (!selectedAccountId.value) return null;
  return accountStore.accounts.find(a => a.id === selectedAccountId.value) || null;
});

function handleUploadStateUpdate(newState: UploadState) {
  Object.assign(uploadState, newState);
}

function stripLocalFileProtocol(value?: string) {
  return value?.replace(/^local-file:\/\//, '') || '';
}

function toLocalFileUrl(value?: string) {
  if (!value) return '';
  return value.startsWith('local-file://') ? value : `local-file://${value}`;
}

function handleCommonConfigUpdate(newConfig: CommonConfig) {
  Object.assign(commonConfig, newConfig);
}

function handleDeleteVideo() {
  uploadState.status = 'idle';
  uploadState.progress = 0;
  uploadState.fileName = undefined;
  uploadState.fileSize = undefined;
  uploadState.coverUrl = undefined;
  uploadState.thumbnailPath = undefined;
  uploadState.filePath = undefined;
  uploadState.videoUrl = undefined;
  uploadState.errorMessage = undefined;
  currentDraftId.value = null;
}

function handleAutoTitle(title: string) {
  if (title && !commonConfig.title) {
    commonConfig.title = title;
  }
}

function handleSelectAccount(accountId: string) {
  selectedAccountId.value = accountId;
}

function handleAddAccount() {
  showAccountPicker.value = true;
}

async function handleAccountsConfirmed(accountIds: string[]) {
  // 取消全部选择：清空已有配置
  for (const key of Object.keys(platformConfigs)) {
    delete platformConfigs[key];
  }

  const selectedAccounts = accountIds
    .map(id => accountStore.accounts.find(a => a.id === id))
    .filter((account): account is Account => Boolean(account));
  const configs = await Promise.all(
    selectedAccounts.map(async (account) => [account.id, await buildInitialPlatformConfig(account)] as const),
  );

  // 重新添加选中的账号
  for (const [id, config] of configs) {
    platformConfigs[id] = config;
  }

  // 更新选中状态
  if (accountIds.length === 0) {
    selectedAccountId.value = null;
  } else if (!accountIds.includes(selectedAccountId.value || '')) {
    selectedAccountId.value = accountIds[0];
  }
  showAccountPicker.value = false;
}

function handleUpdatePlatformConfig(config: PlatformConfig) {
  if (selectedAccountId.value) {
    platformConfigs[selectedAccountId.value] = config;
  }
}

function handleClearCommonConfig() {
  commonConfig.title = '';
  commonConfig.description = '';
  commonConfig.tags = [];
  commonConfig.scheduleMode = 'immediate';
  commonConfig.scheduledAt = '';
}

function handleApplyToAccounts() {
  for (const accountId of Object.keys(platformConfigs)) {
    const account = accountStore.accounts.find(a => a.id === accountId);
    platformConfigs[accountId] = {
      ...getDefaultPlatformConfig(account?.platform),
      ...platformConfigs[accountId],
      title: commonConfig.title || undefined,
      description: commonConfig.description || undefined,
      scheduleMode: commonConfig.scheduleMode,
      scheduledAt: commonConfig.scheduledAt,
      coverUrl: uploadState.coverUrl || undefined,
    };
    if (commonConfig.tags.length > 0) {
      platformConfigs[accountId].tags = [...commonConfig.tags];
    }
  }
  ElMessage.success('已同步应用到所有平台账号');
}

function handleClearAll() {
  handleClearCommonConfig();
  for (const key of Object.keys(platformConfigs)) {
    delete platformConfigs[key];
  }
  uploadState.status = 'idle';
  uploadState.progress = 0;
  uploadState.fileName = undefined;
  uploadState.fileSize = undefined;
  uploadState.coverUrl = undefined;
  uploadState.thumbnailPath = undefined;
  uploadState.filePath = undefined;
  uploadState.videoUrl = undefined;
  uploadState.errorMessage = undefined;
  selectedAccountId.value = null;
  currentDraftId.value = null;
}

async function handleSaveDraft() {
  if (!uploadState.videoUrl) {
    ElMessage.error('请先上传视频');
    return;
  }

  try {
    // 构建账号列表 — 供 DraftCard 展示平台+账号名
    const accounts = Object.entries(platformConfigs).map(([accountId, config]) => {
      const account = accountStore.accounts.find(a => a.id === accountId);
      return {
        accountId,
        platform: account?.platform || '',
        accountName: account?.nickname || '',
      };
    });

    // 构建每个账号的平台配置
    const platformConfigList = Object.entries(platformConfigs).map(([accountId, config]) => {
      const account = accountStore.accounts.find(a => a.id === accountId);
      const effectiveConfig = {
        ...getDefaultPlatformConfig(account?.platform),
        ...config,
      };
      return {
        accountId,
        platform: account?.platform || '',
        title: effectiveConfig.title || commonConfig.title,
        description: effectiveConfig.description || commonConfig.description,
        tags: effectiveConfig.tags || commonConfig.tags,
        coverUrl: stripLocalFileProtocol(effectiveConfig.coverUrl || uploadState.coverUrl || uploadState.thumbnailPath || ''),
        location: effectiveConfig.location,
        visibility: effectiveConfig.visibility,
        declaration: effectiveConfig.declaration,
        scheduleMode: effectiveConfig.scheduleMode || commonConfig.scheduleMode,
        scheduledAt: effectiveConfig.scheduledAt || commonConfig.scheduledAt,
        allowComment: effectiveConfig.allowComment,
        allowShare: effectiveConfig.allowShare,
        allowSameFrame: effectiveConfig.allowSameFrame,
        allowDownload: effectiveConfig.allowDownload,
        showInCity: effectiveConfig.showInCity,
      };
    });

    // 确定 scheduledTime 用于 DraftCard 展示
    const scheduledTime = commonConfig.scheduleMode === 'scheduled' && commonConfig.scheduledAt
      ? commonConfig.scheduledAt
      : undefined;

    const snapshot = JSON.parse(JSON.stringify({
      materialId: uploadState.videoUrl,
      materialPath: uploadState.filePath || '',
      coverPath: stripLocalFileProtocol(uploadState.coverUrl || uploadState.thumbnailPath || ''),
      title: commonConfig.title,
      description: commonConfig.description,
      tags: commonConfig.tags,
      accounts,
      platformConfigs: platformConfigList,
      scheduledTime,
    }));

    const result = await window.matrixflow.draft.save(snapshot, currentDraftId.value || undefined);
    // 保存成功后记录 draftId，后续保存变为更新
    if (result?.success && result.data?.id) {
      currentDraftId.value = result.data.id;
    }
    ElMessage.success('草稿保存成功');
  } catch (e) {
    console.error('保存草稿失败:', e);
    ElMessage.error('草稿保存失败');
  }
}

async function handlePublish() {
  if (isPublishing.value) return;

  if (!commonConfig.title.trim()) {
    ElMessage.error('请输入视频标题');
    return;
  }

  const selectedAccounts = accountStore.accounts.filter(a => platformConfigs[a.id]);
  if (selectedAccounts.length === 0) {
    ElMessage.error('请至少选择一个平台账号');
    return;
  }

  if (!uploadState.videoUrl) {
    ElMessage.error('请先上传视频');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let executedCount = 0;
  let scheduledCount = 0;

  publishQueue.value = selectedAccounts.map((account) => ({
    id: `queue_${account.id}_${Date.now()}`,
    accountId: account.id,
    accountName: account.nickname || account.platform,
    platform: account.platform,
    platformLabel: getPlatformLabel(account.platform),
    status: 'queued',
    message: '已加入发布队列',
  }));
  queueVisible.value = true;
  isPublishing.value = true;

  await sleep(850);

  try {
    for (const account of selectedAccounts) {
      const item = publishQueue.value.find(q => q.accountId === account.id);
      const rawConfig = toRaw(platformConfigs[account.id]) || {};
      try {
        updateQueueItem(account.id, { status: 'preparing', message: '正在创建发布任务' });
        await sleep(450);

        const taskData = buildPublishTaskData(account, rawConfig);
        const result = await window.matrixflow.publish.createTask(taskData);
        if (!result?.success) {
          failCount++;
          updateQueueItem(account.id, { status: 'failed', message: result?.message || '创建任务失败' });
          console.error('创建任务失败:', result?.message);
          continue;
        }

        successCount++;
        const taskId = result.data?.id;
        if (!taskId) {
          failCount++;
          updateQueueItem(account.id, { status: 'failed', message: '创建任务成功但未返回任务 ID' });
          console.error('创建任务成功但未返回任务 ID');
          continue;
        }

        if (item) item.taskId = taskId;

        updateQueueItem(account.id, { status: 'running', message: '正在自动填写并提交发布' });
        await taskStore.retryTask(taskId);
        executedCount++;
        if (taskData.scheduledAt) scheduledCount++;
        updateQueueItem(account.id, { status: 'success', message: taskData.scheduledAt ? '已提交平台定时发布' : '发布任务执行完成' });
        await sleep(600);
      } catch (e) {
        failCount++;
        const message = e instanceof Error ? e.message : '执行发布任务失败';
        updateQueueItem(account.id, { status: 'failed', message });
        console.error('发布任务失败:', e);
      }
    }
  } finally {
    isPublishing.value = false;
  }

  if (successCount > 0) {
    const parts = [`已创建 ${successCount} 个发布任务`];
    if (executedCount > 0) parts.push(`已执行 ${executedCount} 个`);
    if (scheduledCount > 0) parts.push(`已定时 ${scheduledCount} 个`);
    ElMessage.success(parts.join('，'));
  }
  if (failCount > 0) {
    const failedItems = publishQueue.value.filter(q => q.status === 'failed');
    const details = failedItems
      .map(q => `${q.accountName}：${q.message || '未知错误'}`)
      .join('；');
    ElMessage.warning({ message: `${failCount} 个账号发布失败 — ${details}`, duration: 6000, showClose: true });
  }
}

function buildPublishTaskData(account: Account, rawConfig: PlatformConfig) {
  const config = {
    ...getDefaultPlatformConfig(account.platform),
    ...rawConfig,
  };
  const scheduledAt = config.scheduleMode === 'scheduled' && config.scheduledAt
    ? config.scheduledAt
    : commonConfig.scheduleMode === 'scheduled' && commonConfig.scheduledAt
      ? commonConfig.scheduledAt
      : undefined;
  const coverUrl = stripLocalFileProtocol(config.coverUrl || uploadState.coverUrl || undefined);

  return JSON.parse(JSON.stringify({
    contentId: uploadState.videoUrl,
    accountId: account.id,
    platform: account.platform,
    scheduledAt,
    publishMode: 'client',
    headless: headlessMode.value,
    title: config.title || commonConfig.title || '',
    description: config.description || commonConfig.description || '',
    tags: config.tags || commonConfig.tags || [],
    coverUrl: coverUrl || undefined,
    source: 'video',
    metadata: {
      visibility: config.visibility,
      coverUrl: coverUrl || undefined,
      location: config.location,
      declaration: config.declaration,
      scheduleMode: taskDataScheduleMode(config),
      scheduledAt,
      allowComment: config.allowComment,
      allowShare: config.allowShare,
      allowSameFrame: config.allowSameFrame,
      allowDownload: config.allowDownload,
      showInCity: config.showInCity,
      debugSteps: isDevelopment && publishDebugMode.value,
      autoExecute: false,
    },
  }));
}

function taskDataScheduleMode(config: PlatformConfig) {
  if (config.scheduleMode === 'scheduled' || commonConfig.scheduleMode === 'scheduled') return 'scheduled';
  return 'immediate';
}

function getPlatformLabel(platform: string) {
  return platformInfoMap[platform]?.label || platform;
}

async function buildInitialPlatformConfig(account: Account): Promise<PlatformConfig> {
  const config = getDefaultPlatformConfig(account.platform);
  try {
    const preset = await presetStore.getPreset(account.id, account.platform);
    if (!preset?.enabled) return config;
    return mergePresetIntoConfig(config, preset, account.platform);
  } catch (e) {
    console.warn(`[VideoPublish] 读取账号发布预设失败: accountId=${account.id}`, e);
    return config;
  }
}

function mergePresetIntoConfig(config: PlatformConfig, preset: PublishPreset, platform: string): PlatformConfig {
  const next: PlatformConfig = {
    ...config,
    ...normalizePresetOptions(preset.platformOptions, platform),
  };
  const topics = normalizePresetTopics(preset.defaultTopics);
  if (topics.length > 0) {
    next.tags = topics;
  }
  return next;
}

function normalizePresetOptions(options: Record<string, unknown>, platform: string): PlatformConfig {
  const supportedKeys: Array<keyof PlatformConfig> = [
    'location',
    'visibility',
    'declaration',
    'allowComment',
    'allowShare',
    'allowSameFrame',
    'allowDownload',
    'showInCity',
  ];
  const normalized: PlatformConfig = {};
  for (const key of supportedKeys) {
    const value = options[key];
    if (value !== undefined && value !== null && value !== '') {
      (normalized as any)[key] = value;
    }
  }
  if (normalized.declaration !== undefined && platform === 'xiaohongshu') {
    normalized.declaration = String(normalized.declaration);
  }
  return normalized;
}

function normalizePresetTopics(topics: string[]): string[] {
  return topics
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
}

function getDefaultPlatformConfig(platform?: string): PlatformConfig {
  if (platform === 'kuaishou') {
    return {
      declaration: '',
      visibility: 'public',
      scheduleMode: 'immediate',
      allowSameFrame: false,
      allowDownload: false,
      showInCity: true,
    };
  }
  if (platform === 'xiaohongshu') {
    return {
      declaration: '',
      visibility: 'public',
      scheduleMode: 'immediate',
    };
  }
  if (platform === 'channels') {
    return {
      location: '',
    };
  }
  return {};
}

function updateQueueItem(accountId: string, patch: Partial<PublishQueueItem>) {
  const item = publishQueue.value.find(q => q.accountId === accountId);
  if (item) Object.assign(item, patch);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
</script>

<style scoped>
.page-video {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-page);
}

/* ── 子导航 ── */
.page-video__tabs {
  display: flex;
  gap: 0;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-6);
}

.page-video__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.page-video__tab:hover {
  color: var(--color-primary);
}

.page-video__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

/* ── 主体 ── */
.page-video__body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-6) 0;
  min-width: 1024px;
}

.page-video__content {
  flex: 1;
  overflow: hidden;
  display: flex;
  gap: var(--space-3);
  min-height: 0;
}

.page-video__left {
  width: 35%;
  min-width: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-video__left-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-2) var(--space-3) 0;
}

.page-video__right {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: var(--space-3);
  height: 100%;
}

/* ── 右侧空状态 ── */
.page-video__right-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  border: 2px dashed var(--color-border);
  padding: var(--space-8);
}
.page-video__right-empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}
.page-video__right-empty-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
  margin: 0;
}

.page-video__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-6);
  background: var(--color-bg-card);
  border-top: 1px solid var(--color-border);
}

.page-video__publish-mode {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.page-video__publish-mode-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.page-video__debug-toggle {
  margin-left: var(--space-1);
}

/* ── 同步栏 ── */
.page-video__sync-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-lighter);
  border-radius: var(--radius-lg);
  gap: var(--space-2);
  border: 1px solid var(--color-primary-lighter);
}

.page-video__sync-hint {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
  flex: 1;
}

.page-video__sync-actions {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

.publish-queue {
  position: fixed;
  right: 28px;
  bottom: 88px;
  z-index: 80;
  width: min(420px, calc(100vw - 56px));
  pointer-events: none;
}

.publish-queue__panel {
  pointer-events: auto;
  overflow: hidden;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.publish-queue__header {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-4);
  background: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
}

.publish-queue__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.publish-queue__subtitle {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.publish-queue__rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 360px;
  overflow-y: auto;
  padding: var(--space-3);
}

.publish-queue__item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 18px;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  animation: queueItemIn 260ms ease both;
  animation-delay: var(--delay);
}

.publish-queue__step {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  background: var(--color-bg-page);
  border-radius: 50%;
}

.publish-queue__item--preparing .publish-queue__step,
.publish-queue__item--running .publish-queue__step {
  color: #fff;
  background: var(--color-primary);
}

.publish-queue__item--success .publish-queue__step {
  color: #fff;
  background: var(--color-success);
}

.publish-queue__item--failed .publish-queue__step {
  color: #fff;
  background: var(--color-danger);
}

.publish-queue__line {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

.publish-queue__platform {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.publish-queue__account {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-queue__message {
  margin-top: 2px;
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.publish-queue__pulse {
  width: 10px;
  height: 10px;
  background: var(--color-primary);
  border-radius: 50%;
  animation: queuePulse 1s ease infinite;
}

.publish-queue-enter-active,
.publish-queue-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.publish-queue-enter-from,
.publish-queue-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@keyframes queueItemIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes queuePulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
