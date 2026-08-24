<template>
  <div class="draft-card" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <!-- Head: 缩略图 + 标题 + 状态 -->
    <div class="draft-card__head">
      <div class="draft-card__thumb" :style="thumbBgStyle">
        <div class="draft-card__thumb-placeholder">
          <el-icon :size="28"><VideoCamera /></el-icon>
        </div>
        <span class="draft-card__duration">{{ duration }}</span>
      </div>
      <div class="draft-card__head-info">
        <div class="draft-card__title-row">
          <span class="draft-card__name">{{ draft.title || '未命名草稿' }}</span>
          <el-tag :type="statusTagType" size="small" effect="plain" class="draft-card__status-tag">
            {{ statusLabel }}
          </el-tag>
        </div>
        <div class="draft-card__desc">{{ description }}</div>
      </div>
    </div>

    <!-- Tags: 元数据标签行 -->
    <div class="draft-card__tags">
      <span v-if="resolution" class="draft-card__tag draft-card__tag--info">
        <el-icon :size="11"><Crop /></el-icon>
        {{ resolution }}
      </span>
      <span v-if="duration" class="draft-card__tag draft-card__tag--info">
        <el-icon :size="11"><Clock /></el-icon>
        {{ duration }}
      </span>
      <span v-if="fileSize" class="draft-card__tag draft-card__tag--info">
        <el-icon :size="11"><Box /></el-icon>
        {{ fileSize }}
      </span>
      <span v-if="scheduledTime" class="draft-card__tag draft-card__tag--warn">
        <el-icon :size="11"><Timer /></el-icon>
        {{ scheduledTime }}
      </span>
      <span v-if="publishedSuccessText" class="draft-card__tag draft-card__tag--done">
        <el-icon :size="11"><CircleCheck /></el-icon>
        {{ publishedSuccessText }}
      </span>
    </div>

    <!-- Platform: 平台账号信息 -->
    <div class="draft-card__platform-bar">
      <template v-if="platforms.length > 0">
        <span
          v-for="p in platforms"
          :key="p.platform"
          class="draft-card__platform-chip"
          :style="{ borderColor: p.color, color: p.color }"
        >
          <span class="draft-card__platform-dot" :style="{ background: p.color }"></span>
          {{ p.label }} · {{ p.accountName }}
        </span>
      </template>
      <span v-else class="draft-card__platform-warning">
        <el-icon :size="12"><WarningFilled /></el-icon>
        尚未选择目标平台账号
      </span>
    </div>

    <!-- Info: 两列 key-value -->
    <div class="draft-card__info">
      <div class="draft-card__info-col">
        <div class="draft-card__info-row">
          <span class="draft-card__info-key">草稿 ID</span>
          <span class="draft-card__info-val draft-card__info-val--mono">{{ shortId }}</span>
        </div>
        <div class="draft-card__info-row">
          <span class="draft-card__info-key">创建时间</span>
          <span class="draft-card__info-val">{{ formatDate(draft.createdAt) }}</span>
        </div>
      </div>
      <div class="draft-card__info-col">
        <div class="draft-card__info-row">
          <span class="draft-card__info-key">状态</span>
          <span class="draft-card__info-val">{{ statusLabel }}</span>
        </div>
        <div class="draft-card__info-row">
          <span class="draft-card__info-key">更新时间</span>
          <span class="draft-card__info-val">{{ formatDate(draft.updatedAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="draft-card__actions" :class="{ 'draft-card__actions--visible': hovered }">
      <template v-if="draft.status === 'editing'">
        <el-button size="small" type="primary" @click="handleEdit">
          <el-icon :size="12"><Edit /></el-icon>
          编辑
        </el-button>
        <el-button size="small" :disabled="!canPublish" @click="handlePublish">
          <el-icon :size="12"><Promotion /></el-icon>
          发布
        </el-button>
        <el-button size="small" type="danger" @click="handleDelete">
          <el-icon :size="12"><Delete /></el-icon>
          删除
        </el-button>
      </template>
      <template v-else-if="draft.status === 'ready'">
        <el-button size="small" @click="handleViewTask">查看任务</el-button>
        <el-button size="small" type="warning" @click="handleRevoke">
          <el-icon :size="12"><RefreshLeft /></el-icon>
          撤回编辑
        </el-button>
      </template>
      <template v-else-if="draft.status === 'published'">
        <el-button size="small" @click="handleViewTask">查看任务</el-button>
        <el-button size="small" @click="handleReuse">
          <el-icon :size="12"><CopyDocument /></el-icon>
          复用配置
        </el-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  VideoCamera, Edit, Delete, Promotion, RefreshLeft, CopyDocument,
  Crop, Clock, Box, Timer, CircleCheck, WarningFilled,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useDraftStore } from '@/renderer/stores/draft';
import type { Draft, DraftStatus } from '@/renderer/stores/draft';

const props = defineProps<{
  draft: Draft;
}>();

const router = useRouter();
const draftStore = useDraftStore();
const hovered = ref(false);

const platformMap: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  channels: '视频号',
  kuaishou: '快手',
  bilibili: 'B站',
};

const platformColorMap: Record<string, string> = {
  douyin: 'var(--color-plat-douyin)',
  xiaohongshu: 'var(--color-plat-xiaohongshu)',
  channels: 'var(--color-plat-wechat)',
  kuaishou: 'var(--color-plat-kuaishou)',
  bilibili: 'var(--color-plat-bilibili)',
};

const statusLabelMap: Record<DraftStatus, string> = {
  editing: '编辑中',
  ready: '待发布',
  published: '已发布',
};

const statusTagTypeMap: Record<DraftStatus, '' | 'success' | 'warning' | 'info'> = {
  editing: '',
  ready: 'warning',
  published: 'success',
};

const statusLabel = computed(() => statusLabelMap[props.draft.status]);
const statusTagType = computed(() => statusTagTypeMap[props.draft.status]);

const snapshot = computed(() => props.draft.snapshotJson || {});

const thumbBgStyle = computed(() => {
  const coverPath = snapshot.value.coverPath as string;
  if (coverPath) {
    const url = coverPath.startsWith('local-file://') ? coverPath : `local-file://${coverPath}`;
    return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return {};
});

const resolution = computed(() => {
  const res = snapshot.value.resolution as string || snapshot.value.width as string;
  if (!res) return '';
  const w = snapshot.value.width || snapshot.value.videoWidth;
  const h = snapshot.value.height || snapshot.value.videoHeight;
  if (w && h) return `${w}×${h}`;
  return res;
});

const duration = computed(() => {
  const d = snapshot.value.duration as number;
  if (!d) return '';
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
});

const fileSize = computed(() => {
  const s = snapshot.value.fileSize as number;
  if (!s) return '';
  if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)}KB`;
  return `${(s / (1024 * 1024)).toFixed(0)}MB`;
});

const description = computed(() => {
  const snap = snapshot.value;
  const parts: string[] = [];
  if (snap.title) parts.push(`标题：${snap.title}`);
  else parts.push('标题未设置');
  if (snap.description) parts.push(`简介已填写`);
  else parts.push('简介未填写');
  if (snap.coverPath) parts.push('封面已选取');
  else parts.push('封面未选取');
  if (snap.tags && (snap.tags as string[]).length > 0) {
    parts.push(`标签：${(snap.tags as string[]).map(t => `#${t}`).join(' ')}`);
  }
  return parts.join(' · ') || '暂无描述';
});

const scheduledTime = computed(() => {
  const t = snapshot.value.scheduledTime as string;
  if (!t) return '';
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm}`;
});

const publishedSuccessText = computed(() => {
  if (props.draft.status !== 'published') return '';
  const taskIds = snapshot.value.taskIds as string[] | undefined;
  if (taskIds && taskIds.length > 0) return `${taskIds.length}个平台全部成功`;
  return '';
});

const platforms = computed(() => {
  const accounts = snapshot.value.accounts as Array<{
    platform: string;
    accountId: string;
    accountName: string;
  }> | undefined;
  if (!accounts || accounts.length === 0) return [];
  return accounts.map(a => ({
    platform: a.platform,
    label: platformMap[a.platform] || a.platform,
    color: platformColorMap[a.platform] || 'var(--color-primary)',
    accountName: a.accountName || '',
  }));
});

const canPublish = computed(() => {
  return platforms.value.length > 0;
});

const shortId = computed(() =>
  props.draft.id.length > 16 ? props.draft.id.slice(0, 16) + '...' : props.draft.id
);

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch { return dateStr; }
}

function handleEdit() {
  router.push({ path: '/publish/video', query: { draftId: props.draft.id } });
}

async function handlePublish() {
  try {
    const result = await draftStore.publishDraft(props.draft.id);
    if (result) {
      ElMessage.success('发布成功');
    }
  } catch {
    ElMessage.error('发布失败');
  }
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('确定删除该草稿？', '确认删除', {
      type: 'warning',
    });
    await draftStore.deleteDraft(props.draft.id);
    ElMessage.success('删除成功');
  } catch {
    // cancelled
  }
}

async function handleRevoke() {
  try {
    await draftStore.revokeDraft(props.draft.id);
    ElMessage.success('已撤回编辑');
  } catch {
    ElMessage.error('撤回失败');
  }
}

function handleViewTask() {
  router.push({ path: '/publish/tasks' });
}

async function handleReuse() {
  try {
    await draftStore.saveDraft(props.draft.snapshotJson as Record<string, unknown>);
    ElMessage.success('配置已保存');
    router.push({ path: '/publish/video' });
  } catch {
    ElMessage.error('复用失败');
  }
}
</script>

<style scoped>
.draft-card {
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

.draft-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-lighter);
  transform: translateY(-1px);
}

/* ── Head ── */
.draft-card__head {
  display: flex;
  gap: var(--space-3);
}

.draft-card__thumb {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-lg);
  background: var(--color-bg-tertiary, var(--color-bg-page));
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.draft-card__thumb-placeholder {
  color: var(--color-text-placeholder);
}

.draft-card__duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--font-family-mono);
}

.draft-card__head-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.draft-card__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.draft-card__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draft-card__status-tag {
  flex-shrink: 0;
}

.draft-card__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Tags ── */
.draft-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.draft-card__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--font-size-3xs);
  font-weight: var(--font-weight-medium);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.draft-card__tag--info {
  color: var(--color-text-secondary);
  background: var(--color-bg-page);
  border: 1px solid var(--color-border-light);
}

.draft-card__tag--warn {
  color: var(--color-warning);
  background: var(--color-warning-light);
}

.draft-card__tag--done {
  color: var(--color-success);
  background: var(--color-success-light);
}

/* ── Platform bar ── */
.draft-card__platform-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.draft-card__platform-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-3xs);
  font-weight: var(--font-weight-medium);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid;
  background: transparent;
}

.draft-card__platform-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.draft-card__platform-warning {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── Info grid ── */
.draft-card__info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-light);
}

.draft-card__info-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.draft-card__info-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.draft-card__info-key {
  font-size: var(--font-size-3xs);
  color: var(--color-text-placeholder);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  flex-shrink: 0;
}

.draft-card__info-val {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draft-card__info-val--mono {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-2xs);
}

/* ── Actions ── */
.draft-card__actions {
  display: flex;
  gap: var(--space-2);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.draft-card__actions--visible {
  opacity: 1;
}
</style>