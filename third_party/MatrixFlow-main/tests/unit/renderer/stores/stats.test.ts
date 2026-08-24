import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import { useStatsStore } from '@/renderer/stores/stats';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';

let mock: MatrixflowMock;

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

describe('useStatsStore', () => {
  describe('initial state', () => {
    it('starts with loading=false', () => {
      const store = useStatsStore();
      expect(store.loading).toBe(false);
    });

    it('starts with default timeRange=week', () => {
      const store = useStatsStore();
      expect(store.timeRange).toBe('week');
    });

    it('starts with empty platformStats', () => {
      const store = useStatsStore();
      expect(store.platformStats).toEqual([]);
    });

    it('starts with empty trendData', () => {
      const store = useStatsStore();
      expect(store.trendData).toEqual([]);
    });

    it('starts with empty accountRanking', () => {
      const store = useStatsStore();
      expect(store.accountRanking).toEqual([]);
    });
  });

  describe('computed', () => {
    it('successRate is 0 when no publishes', () => {
      const store = useStatsStore();
      expect(store.successRate).toBe(0);
    });

    it('successRate calculates percentage', () => {
      const store = useStatsStore();
      store.rawOverview = {
        ...store.rawOverview,
        totalPublishes: 100,
        successPublishes: 85,
      };
      expect(store.successRate).toBe(85);
    });

    it('overviewCards returns 5 cards', () => {
      const store = useStatsStore();
      expect(store.overviewCards).toHaveLength(5);
    });

    it('overviewCards labels include expected names', () => {
      const store = useStatsStore();
      const labels = store.overviewCards.map((c) => c.label);
      expect(labels).toContain('总播放量');
      expect(labels).toContain('总点赞数');
      expect(labels).toContain('发布数量');
    });

    it('platformTableData formats numbers', () => {
      const store = useStatsStore();
      store.platformStats = [
        { platform: 'douyin', accountCount: 5, publishCount: 100, playCount: 50000, likeCount: 10000, commentCount: 500, avgPlay: 500, successRate: 90 },
      ];
      const data = store.platformTableData;
      expect(data[0].playCountDisplay).toBe('5.0万');
      expect(data[0].successRateDisplay).toBe('90%');
    });
  });

  describe('fetchAll', () => {
    it('fetches overview, platform stats, and trend in parallel', async () => {
      mock.stats.getOverview.mockResolvedValue({ totalPlays: 1000, totalLikes: 500, totalPublishes: 100 });
      mock.stats.getPlatformStats.mockResolvedValue([]);
      mock.stats.getTrend.mockResolvedValue([]);

      const store = useStatsStore();
      await store.fetchAll();

      expect(mock.stats.getOverview).toHaveBeenCalled();
      expect(mock.stats.getPlatformStats).toHaveBeenCalled();
      expect(mock.stats.getTrend).toHaveBeenCalled();
    });

    it('updates rawOverview from IPC data', async () => {
      mock.stats.getOverview.mockResolvedValue({ totalPlays: 5000, totalLikes: 200, totalPublishes: 50 });
      mock.stats.getPlatformStats.mockResolvedValue([]);
      mock.stats.getTrend.mockResolvedValue([]);

      const store = useStatsStore();
      await store.fetchAll();

      expect(store.rawOverview.totalPlays).toBe(5000);
    });

    it('manages loading state', async () => {
      let loadingDuringCall = false;
      mock.stats.getOverview.mockImplementation(async () => {
        loadingDuringCall = useStatsStore().loading;
        return {};
      });
      mock.stats.getPlatformStats.mockResolvedValue([]);
      mock.stats.getTrend.mockResolvedValue([]);

      const store = useStatsStore();
      await store.fetchAll();

      expect(loadingDuringCall).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('does nothing when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      (globalThis as Record<string, unknown>).window = {};

      const store = useStatsStore();
      await store.fetchAll();

      expect(store.loading).toBe(false);
    });
  });

  describe('setTimeRange', () => {
    it('updates timeRange and triggers fetchAll', async () => {
      mock.stats.getOverview.mockResolvedValue({});
      mock.stats.getPlatformStats.mockResolvedValue([]);
      mock.stats.getTrend.mockResolvedValue([]);

      const store = useStatsStore();
      store.setTimeRange('month');

      expect(store.timeRange).toBe('month');
      expect(mock.stats.getOverview).toHaveBeenCalledWith('month');
    });
  });

  describe('fetchLatestReport', () => {
    it('fetches report from IPC', async () => {
      const reportData = { id: 'r-1', content: 'Weekly report' };
      mock.report.getLatest.mockResolvedValue(reportData);

      const store = useStatsStore();
      await store.fetchLatestReport();

      expect(store.latestReport).toEqual(reportData);
    });

    it('manages reportLoading state', async () => {
      let loadingDuringCall = false;
      mock.report.getLatest.mockImplementation(async () => {
        loadingDuringCall = useStatsStore().reportLoading;
        return null;
      });

      const store = useStatsStore();
      await store.fetchLatestReport();

      expect(loadingDuringCall).toBe(true);
      expect(store.reportLoading).toBe(false);
    });

    it('does nothing when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      (globalThis as Record<string, unknown>).window = {};

      const store = useStatsStore();
      await store.fetchLatestReport();

      expect(store.reportLoading).toBe(false);
    });
  });

  describe('generateReport', () => {
    it('generates report and updates latestReport', async () => {
      const report = { id: 'r-2', content: 'New report' };
      mock.report.generate.mockResolvedValue(report);

      const store = useStatsStore();
      const result = await store.generateReport();

      expect(result).toEqual(report);
      expect(store.latestReport).toEqual(report);
    });

    it('returns null when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      (globalThis as Record<string, unknown>).window = {};

      const store = useStatsStore();
      const result = await store.generateReport();

      expect(result).toBeNull();
    });
  });
});
