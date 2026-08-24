<template>
  <div class="home">
    <!-- Quick Actions Bar -->
    <div class="home__quick-actions">
      <div class="home__actions-left">
        <el-button type="primary" :icon="Upload" @click="$router.push('/publish/video')">
          快速发布
        </el-button>
        <el-button :icon="User" @click="$router.push('/accounts?action=add')">
          授权账号
        </el-button>
      </div>
      <div class="home__ai-badge" v-if="aiInsightCount > 0" @click="$router.push('/stats')">
        <el-icon :size="16"><MagicStick /></el-icon>
        <span>{{ aiInsightCount }} 条 AI 洞察</span>
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="home__metrics">
      <div class="home__metric-card">
        <div class="home__metric-icon" style="background: var(--color-primary-lighter); color: var(--color-primary);">
          <el-icon :size="22"><User /></el-icon>
        </div>
        <div class="home__metric-info">
          <span class="home__metric-value">{{ accountCount }}</span>
          <span class="home__metric-label">账号总数</span>
        </div>
        <div class="home__metric-badge">
          <span class="home__metric-online">{{ onlineCount }} 在线</span>
          <span class="home__metric-offline">{{ accountCount - onlineCount }} 离线</span>
        </div>
      </div>

      <div class="home__metric-card">
        <div class="home__metric-icon" style="background: var(--color-success-light); color: var(--color-success);">
          <el-icon :size="22"><Folder /></el-icon>
        </div>
        <div class="home__metric-info">
          <span class="home__metric-value">{{ contentCount }}</span>
          <span class="home__metric-label">发布中</span>
        </div>
      </div>

      <div class="home__metric-card">
        <div class="home__metric-icon" style="background: var(--color-warning-light); color: var(--color-warning);">
          <el-icon :size="22"><TrendCharts /></el-icon>
        </div>
        <div class="home__metric-info">
          <span class="home__metric-value">+{{ weekTotal }}</span>
          <span class="home__metric-label">近7日趋势</span>
        </div>
        <div class="home__metric-badge">
          <span class="home__metric-trend" :class="weekTrendDir">
            <el-icon :size="12"><ArrowUp v-if="weekTrendDir === 'up'" /><ArrowDown v-else /></el-icon>
            {{ weekTrendPct }}%
          </span>
        </div>
      </div>

      <div class="home__metric-card">
        <div class="home__metric-icon" style="background: #f0e6ff; color: #8b5cf6;">
          <el-icon :size="22"><MagicStick /></el-icon>
        </div>
        <div class="home__metric-info">
          <span class="home__metric-value">{{ aiScore }}</span>
          <span class="home__metric-label">AI 评分</span>
        </div>
      </div>
    </div>

    <!-- Data Area: Chart + Recent List -->
    <div class="home__data-area">
      <div class="home__chart">
        <TrendChart title="发布趋势" :dates="trendDates" :series="trendSeries" chart-type="area" />
      </div>
      <div class="home__recent-list">
        <div class="home__section-header">
          <h3>最近发布</h3>
          <el-button text size="small" @click="$router.push('/tasks')">查看全部</el-button>
        </div>
        <el-table :data="recentTasks" size="small" style="width: 100%" v-loading="loading">
          <el-table-column label="平台" width="64" align="center">
            <template #default="{ row }">
              <span class="home__platform-dot" :style="{ background: platformColor(row.platform) }"></span>
            </template>
          </el-table-column>
          <el-table-column prop="accountName" label="账号" width="80" show-overflow-tooltip />
          <el-table-column prop="title" label="标题" min-width="100" show-overflow-tooltip />
          <el-table-column label="状态" width="72" align="center">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small" effect="light">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="80" align="right">
            <template #default="{ row }">
              <span class="home__time-text">{{ row.time }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- Activity Timeline -->
    <div class="home__timeline">
      <div class="home__section-header">
        <h3>最近动态</h3>
      </div>
      <div class="home__timeline-list">
        <div
          v-for="(item, idx) in activities"
          :key="idx"
          class="home__timeline-item"
        >
          <div class="home__timeline-dot" :style="{ background: item.color }"></div>
          <div class="home__timeline-content">
            <span class="home__timeline-desc">{{ item.desc }}</span>
            <span class="home__timeline-time">{{ item.time }}</span>
          </div>
        </div>
        <div v-if="activities.length === 0" class="home__timeline-empty">
          暂无动态
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDashboardStore } from '@/renderer/stores/dashboard';
import TrendChart from '@/renderer/components/charts/TrendChart.vue';
import type { TrendSeries } from '@/renderer/components/charts/TrendChart.vue';
import {
  MagicStick,
  TrendCharts,
  Folder,
  Upload,
  User,
  ArrowUp,
  ArrowDown,
} from '@element-plus/icons-vue';

const router = useRouter();
const dashboardStore = useDashboardStore();

// ── Computed (from store) ──
const accountCount = computed(() => dashboardStore.accountCount);
const onlineCount = computed(() => dashboardStore.onlineCount);
const contentCount = computed(() => dashboardStore.contentCount);
const aiScore = computed(() => dashboardStore.aiScore);
const aiInsightCount = computed(() => dashboardStore.aiInsightCount);
const weekTotal = computed(() => dashboardStore.weekTotal);
const weekTrendDir = computed(() => dashboardStore.weekTrendDir);
const weekTrendPct = computed(() => dashboardStore.weekTrendPct);
const recentTasks = computed(() => dashboardStore.recentTasks);
const activities = computed(() => dashboardStore.activities);
const loading = computed(() => dashboardStore.loading);

const trendDates = computed(() => dashboardStore.trendDates);
const trendSeries = computed<TrendSeries[]>(() => [
  { name: '发布量', data: dashboardStore.weekTrend },
]);

// ── Lifecycle ──
onMounted(async () => {
  await dashboardStore.fetchOverview();
});

// ── Helpers ──
const platformColorMap: Record<string, string> = {
  douyin: 'var(--color-plat-douyin)',
  xiaohongshu: 'var(--color-plat-xiaohongshu)',
  channels: 'var(--color-plat-wechat)',
  kuaishou: 'var(--color-plat-kuaishou)',
};

function platformColor(platform: string): string {
  return platformColorMap[platform] ?? 'var(--color-info)';
}

const statusMap: Record<string, { type: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  completed: { type: 'success', label: '成功' },
  running: { type: 'warning', label: '进行中' },
  failed: { type: 'danger', label: '失败' },
  pending: { type: 'info', label: '待发布' },
  scheduled: { type: 'info', label: '已排期' },
  cancelled: { type: 'info', label: '已取消' },
};

function statusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  return statusMap[status]?.type ?? 'info';
}

function statusLabel(status: string): string {
  return statusMap[status]?.label ?? status;
}
</script>

<style scoped>
.home {
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  position: relative;
}

/* ── Quick Actions ── */
.home__quick-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home__actions-left {
  display: flex;
  gap: var(--space-3);
}

.home__ai-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  background: linear-gradient(135deg, #f0e6ff, #e8deff);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: #7c3aed;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.home__ai-badge:hover {
  background: linear-gradient(135deg, #e8deff, #ddd4f7);
}

/* ── Metric Cards ── */
.home__metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.home__metric-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  transition: box-shadow var(--transition-fast);
}

.home__metric-card:hover {
  box-shadow: var(--shadow-md);
}

.home__metric-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.home__metric-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home__metric-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.2;
}

.home__metric-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.home__metric-badge {
  margin-left: auto;
  flex-shrink: 0;
}

.home__metric-online {
  font-size: var(--font-size-xs);
  color: var(--color-success);
  background: var(--color-success-light);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.home__metric-offline {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  background: var(--color-bg-page);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-left: 4px;
}

.home__metric-trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.home__metric-trend.up {
  color: var(--color-success);
  background: var(--color-success-light);
}

.home__metric-trend.down {
  color: var(--color-danger);
  background: var(--color-danger-light);
}

/* ── Data Area ── */
.home__data-area {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-4);
}

.home__chart {
  min-width: 0;
}

.home__recent-list {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}

.home__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.home__section-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.home__platform-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
}

.home__time-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* ── Timeline ── */
.home__timeline {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.home__timeline-list {
  display: flex;
  flex-direction: column;
}

.home__timeline-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  position: relative;
}

.home__timeline-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 4px;
  top: calc(var(--space-3) + 12px);
  bottom: calc(-1 * var(--space-3));
  width: 1px;
  background: var(--color-border-light);
}

.home__timeline-dot {
  width: 9px;
  height: 9px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  margin-top: 5px;
  position: relative;
  z-index: 1;
}

.home__timeline-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.home__timeline-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home__timeline-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  flex-shrink: 0;
  margin-left: var(--space-3);
}

.home__timeline-empty {
  text-align: center;
  padding: var(--space-6) 0;
  color: var(--color-text-placeholder);
  font-size: var(--font-size-sm);
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .home__metrics {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 900px) {
  .home__metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  .home__data-area {
    grid-template-columns: 1fr;
  }

  .home__quick-actions {
    flex-direction: column;
    gap: var(--space-3);
  }

  .home__actions-left {
    width: 100%;
  }

  .home__actions-left .el-button {
    flex: 1;
  }

  .home__ai-badge {
    align-self: flex-start;
  }
}

@media (max-width: 600px) {
  .home {
    padding: var(--space-4);
    gap: var(--space-4);
  }

  .home__metrics {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }

  .home__metric-card {
    padding: var(--space-4);
    gap: var(--space-3);
  }

  .home__metric-icon {
    width: 36px;
    height: 36px;
  }

  .home__metric-value {
    font-size: var(--font-size-xl);
  }

  .home__metric-badge {
    flex-direction: column;
    gap: 4px;
  }

  .home__metric-offline {
    margin-left: 0;
  }

  .home__data-area {
    gap: var(--space-3);
  }

  .home__quick-actions {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }

  .home__actions-left {
    flex-direction: column;
    width: 100%;
  }

  .home__actions-left .el-button {
    width: 100%;
  }

  .home__ai-badge {
    justify-content: center;
    width: 100%;
  }

  .home__recent-list,
  .home__timeline {
    padding: var(--space-4);
  }

  .home__chart {
    min-width: 0;
    overflow: hidden;
  }

  .home__section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
}
</style>
