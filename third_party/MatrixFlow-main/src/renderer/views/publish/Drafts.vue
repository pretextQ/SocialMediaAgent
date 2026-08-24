<template>
  <div class="page-drafts">
    <!-- 发布子导航 -->
    <nav class="page-drafts__tabs">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="page-drafts__tab"
        :class="{ 'page-drafts__tab--active': isActive(item.path) }"
      >
        <el-icon :size="15"><component :is="item.icon" /></el-icon>
        {{ item.label }}
      </router-link>
    </nav>

    <!-- 页面标题栏 -->
    <header class="page-drafts__header">
      <h1 class="page-drafts__title">草稿管理</h1>
      <el-button type="primary" size="small" @click="goToVideoPublish">
        <el-icon :size="14"><Plus /></el-icon>
        新建视频发布
      </el-button>
    </header>

    <!-- 筛选工具栏 -->
    <div class="page-drafts__toolbar">
      <div class="page-drafts__filter-bar">
        <el-select v-model="filterStatus" placeholder="全部状态" size="small" @change="handleFilterChange">
          <el-option label="全部状态" value="" />
          <el-option label="编辑中" value="editing" />
          <el-option label="待发布" value="ready" />
          <el-option label="已发布" value="published" />
        </el-select>

        <el-select v-model="filterPlatform" placeholder="全部平台" size="small" @change="handleFilterChange">
          <el-option label="全部平台" value="" />
          <el-option label="抖音" value="douyin" />
          <el-option label="小红书" value="xiaohongshu" />
          <el-option label="B站" value="bilibili" />
          <el-option label="视频号" value="channels" />
          <el-option label="快手" value="kuaishou" />
        </el-select>

        <el-input
          v-model="searchKeyword"
          placeholder="搜索标题..."
          prefix-icon="Search"
          clearable
          size="small"
          class="page-drafts__search"
          @input="handleSearchInput"
        />
      </div>

      <div class="page-drafts__view-toggle">
        <el-button text size="small" :type="viewMode === 'grid' ? 'primary' : ''" @click="viewMode = 'grid'">
          <el-icon><Grid /></el-icon>
        </el-button>
        <el-button text size="small" :type="viewMode === 'list' ? 'primary' : ''" @click="viewMode = 'list'">
          <el-icon><List /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- 草稿列表 -->
    <div class="page-drafts__list">
      <div v-if="loading" class="page-drafts__loading">
        加载中...
      </div>

      <template v-else-if="filteredDrafts.length > 0">
        <!-- 网格视图 -->
        <div v-if="viewMode === 'grid'" class="page-drafts__grid">
          <DraftCard
            v-for="draft in filteredDrafts"
            :key="draft.id"
            :draft="draft"
          />
        </div>

        <!-- 列表视图 -->
        <div v-else class="page-drafts__list-view">
          <DraftCard
            v-for="draft in filteredDrafts"
            :key="draft.id"
            :draft="draft"
          />
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else class="page-drafts__empty">
        <div class="page-drafts__empty-icon">
          <el-icon :size="36"><VideoCamera /></el-icon>
        </div>
        <h3 class="page-drafts__empty-title">还没有草稿</h3>
        <p class="page-drafts__empty-desc">在视频发布页编辑配置后保存草稿，这里就能看到</p>
        <el-button type="primary" @click="goToVideoPublish">去视频发布</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  List, Document, VideoCamera, Grid, Plus,
} from '@element-plus/icons-vue';
import { useDraftStore } from '@/renderer/stores/draft';
import DraftCard from '@/renderer/components/publish/DraftCard.vue';

const route = useRoute();
const router = useRouter();
const draftStore = useDraftStore();

const navItems = [
  { path: '/publish/tasks', label: '任务列表', icon: List },
  { path: '/publish/drafts', label: '草稿', icon: Document },
  { path: '/publish/video', label: '视频发布', icon: VideoCamera },
];

function isActive(path: string) {
  return route.path === path;
}

const filterStatus = ref('');
const filterPlatform = ref('');
const searchKeyword = ref('');
const viewMode = ref<'grid' | 'list'>('grid');

const loading = computed(() => draftStore.loading);

const filteredDrafts = computed(() => {
  let drafts = draftStore.drafts;

  if (filterStatus.value) {
    drafts = drafts.filter(d => d.status === filterStatus.value);
  }

  if (filterPlatform.value) {
    drafts = drafts.filter(d => {
      const accounts = d.snapshotJson?.accounts as Array<{ platform: string }> | undefined;
      if (!accounts) return false;
      return accounts.some(a => a.platform === filterPlatform.value);
    });
  }

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase();
    drafts = drafts.filter(d => {
      const title = (d.title || '').toLowerCase();
      const desc = (d.snapshotJson?.title as string || '').toLowerCase();
      return title.includes(kw) || desc.includes(kw);
    });
  }

  return drafts;
});

onMounted(async () => {
  await draftStore.fetchDrafts();
});

function handleFilterChange() {
  draftStore.filter = {
    status: filterStatus.value || undefined,
    platform: filterPlatform.value || undefined,
    search: searchKeyword.value || undefined,
  };
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function handleSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    handleFilterChange();
  }, 300);
}

function goToVideoPublish() {
  router.push({ path: '/publish/video' });
}
</script>

<style scoped>
.page-drafts {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-page);
}

/* ── 子导航 ── */
.page-drafts__tabs {
  display: flex;
  gap: 0;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-6);
}

.page-drafts__tab {
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

.page-drafts__tab:hover {
  color: var(--color-primary);
}

.page-drafts__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

/* ── 标题栏 ── */
.page-drafts__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
}

.page-drafts__title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0;
}

/* ── 筛选工具栏 ── */
.page-drafts__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-6) var(--space-3);
}

.page-drafts__filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
}

.page-drafts__search {
  width: 200px;
}

.page-drafts__view-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
}

/* ── 列表区域 ── */
.page-drafts__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-6) var(--space-4);
}

.page-drafts__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-4);
}

.page-drafts__list-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* ── 空状态 ── */
.page-drafts__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  text-align: center;
}

.page-drafts__empty-icon {
  width: 80px;
  height: 80px;
  background: var(--color-primary-lighter);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4);
  color: var(--color-primary);
}

.page-drafts__empty-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
}

.page-drafts__empty-desc {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-4);
}
</style>
