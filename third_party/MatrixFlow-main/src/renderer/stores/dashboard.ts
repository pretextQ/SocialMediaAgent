import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface DashboardTask {
  id: string;
  platform: string;
  accountName: string;
  title: string;
  status: string;
  time: string;
}

export interface DashboardActivity {
  desc: string;
  time: string;
  color: string;
  type: string;
}

export interface DashboardOverview {
  accountCount: number;
  onlineCount: number;
  contentCount: number;
  aiScore: number;
  aiInsightCount: number;
  weekTrend: number[];
  trendDates: string[];
  recentTasks: DashboardTask[];
  activities: DashboardActivity[];
}

export const useDashboardStore = defineStore('dashboard', () => {
  const loading = ref(false);
  const accountCount = ref(0);
  const onlineCount = ref(0);
  const contentCount = ref(0);
  const aiScore = ref(85);
  const aiInsightCount = ref(0);
  const weekTrend = ref<number[]>([]);
  const trendDates = ref<string[]>([]);
  const recentTasks = ref<DashboardTask[]>([]);
  const activities = ref<DashboardActivity[]>([]);

  const weekTotal = computed(() => weekTrend.value.reduce((a, b) => a + b, 0));

  const weekTrendDir = computed(() => {
    if (weekTrend.value.length < 2) return 'flat';
    const first = weekTrend.value[0];
    const last = weekTrend.value[weekTrend.value.length - 1];
    return last >= first ? 'up' : 'down';
  });

  const weekTrendPct = computed(() => {
    if (weekTrend.value.length < 2) return 0;
    const first = weekTrend.value[0];
    if (first === 0) return weekTrend.value[weekTrend.value.length - 1] > 0 ? 100 : 0;
    const last = weekTrend.value[weekTrend.value.length - 1];
    return Math.abs(Math.round(((last - first) / first) * 100));
  });

  async function fetchOverview() {
    if (!window.matrixflow) return;
    loading.value = true;
    try {
      const result = (await window.matrixflow.dashboard.getOverview()) as any;
      const data = result?.data ?? result;
      if (data) {
        accountCount.value = data.accountCount ?? 0;
        onlineCount.value = data.onlineCount ?? 0;
        contentCount.value = data.contentCount ?? 0;
        aiScore.value = data.aiScore ?? 85;
        aiInsightCount.value = data.aiInsightCount ?? 0;
        weekTrend.value = data.weekTrend ?? [];
        trendDates.value = data.trendDates ?? [];
        recentTasks.value = data.recentTasks ?? [];
        activities.value = data.activities ?? [];
      }
    } catch {
      // fallback to defaults
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    accountCount,
    onlineCount,
    contentCount,
    aiScore,
    aiInsightCount,
    weekTrend,
    trendDates,
    recentTasks,
    activities,
    weekTotal,
    weekTrendDir,
    weekTrendPct,
    fetchOverview,
  };
});
