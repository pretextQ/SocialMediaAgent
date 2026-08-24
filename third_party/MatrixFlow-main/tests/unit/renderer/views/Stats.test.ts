import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Stats from '@/renderer/views/Stats.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/renderer/components/charts', () => ({
  TrendChart: { template: '<div data-testid="trend-chart" />', props: ['title', 'dates', 'series', 'chartType', 'colors'] },
  PlatformComparison: { template: '<div data-testid="platform-comparison" />', props: ['platforms'] },
  isDark: { value: false },
}));

vi.mock('@/renderer/components/charts/TrendChart.vue', () => ({
  default: { template: '<div data-testid="trend-chart" />', props: ['title', 'dates', 'series', 'chartType', 'colors'] },
}));

vi.mock('@/renderer/components/charts/PlatformComparison.vue', () => ({
  default: { template: '<div data-testid="platform-comparison" />', props: ['platforms'] },
}));

vi.mock('@/renderer/components/stats/WeeklyReportPanel.vue', () => ({
  default: { template: '<div data-testid="weekly-report" />' },
}));

vi.mock('@/renderer/components/stats/MonitorPanel.vue', () => ({
  default: { template: '<div data-testid="monitor-panel" />' },
}));

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal('MutationObserver', class {
  observe = mockObserve;
  disconnect = mockDisconnect;
});

const globalStubs = {
  'el-tabs': {
    template: '<div data-testid="el-tabs"><slot /></div>',
    props: ['modelValue', 'class'],
    emits: ['update:modelValue'],
  },
  'el-tab-pane': {
    template: '<div data-testid="el-tab-pane"><slot /></div>',
    props: ['label', 'name'],
  },
  'el-icon': { template: '<span><slot /></span>', props: ['size', 'color'] },
  'el-radio-group': {
    template: '<div data-testid="el-radio-group"><slot /></div>',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue', 'change'],
  },
  'el-radio-button': {
    template: '<label><slot /></label>',
    props: ['value'],
  },
  'el-select': {
    template: '<select data-testid="el-select"><slot /></select>',
    props: ['modelValue', 'placeholder', 'size', 'style', 'multiple', 'clearable'],
    emits: ['update:modelValue', 'change'],
  },
  'el-option': {
    template: '<option><slot /></option>',
    props: ['label', 'value'],
  },
  'el-table': {
    template: '<div data-testid="el-table"><slot /></div>',
    props: ['data', 'stripe', 'size', 'style'],
  },
  'el-table-column': {
    template: '<div />',
    props: ['prop', 'label', 'width', 'minWidth', 'showOverflowTooltip'],
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size', 'effect', 'round'],
  },
  'el-progress': {
    template: '<div data-testid="el-progress" />',
    props: ['percentage', 'strokeWidth', 'showText', 'status'],
  },
  'el-date-picker': {
    template: '<input data-testid="el-date-picker" />',
    props: ['modelValue', 'type', 'rangeSeparator', 'startPlaceholder', 'endPlaceholder', 'size', 'style', 'valueFormat'],
    emits: ['update:modelValue', 'change'],
  },
  'el-pagination': {
    template: '<div data-testid="el-pagination" />',
    props: ['total', 'pageSize', 'currentPage', 'layout', 'small'],
    emits: ['currentChange'],
  },
  'TrendChart': { template: '<div data-testid="trend-chart" />', props: ['title', 'dates', 'series', 'chartType', 'colors'] },
  'PlatformComparison': { template: '<div data-testid="platform-comparison" />', props: ['platforms'] },
  'WeeklyReportPanel': { template: '<div data-testid="weekly-report" />' },
  'MonitorPanel': { template: '<div data-testid="monitor-panel" />' },
  User: { template: '<span>user</span>' },
  CircleCheck: { template: '<span>check</span>' },
  VideoCamera: { template: '<span>video</span>' },
  TrendCharts: { template: '<span>trend</span>' },
};

function mountView() {
  return mount(Stats, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            account: { accounts: [], loading: false },
            content: { contents: [], loading: false, searchQuery: '', statusFilter: '' },
            task: { tasks: [], loading: false },
            stats: {
              rawOverview: {
                totalPlays: 0, totalLikes: 0, totalComments: 0,
                totalPublishes: 0, successPublishes: 0, failedPublishes: 0,
                playChange: 0, likeChange: 0, commentChange: 0,
                publishChange: 0, successRate: 0,
              },
              trendData: [],
              platformStats: [],
              accountRanking: [],
              successRate: 0,
              loading: false,
              timeRange: 'week',
              latestReport: null,
              reportLoading: false,
            },
            publish: {
              tasks: [],
              loading: false,
              publishHistory: [],
              publishHistoryTotal: 0,
              publishHistoryLoading: false,
            },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Stats', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page-stats container', () => {
    wrapper = mountView();
    expect(wrapper.find('.page-stats').exists()).toBe(true);
  });

  it('renders tabs component', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-tabs"]').exists()).toBe(true);
  });

  it('renders all tab panes', () => {
    wrapper = mountView();
    const panes = wrapper.findAll('[data-testid="el-tab-pane"]');
    expect(panes.length).toBe(4); // overview, monitor, report, history
  });

  it('renders stats grid with KPI cards', () => {
    wrapper = mountView();
    expect(wrapper.find('.stats-grid').exists()).toBe(true);
  });

  it('renders 4 stat cards in overview', () => {
    wrapper = mountView();
    const cards = wrapper.findAll('.stat-card');
    expect(cards.length).toBe(4);
  });

  it('renders stat card titles', () => {
    wrapper = mountView();
    const titles = wrapper.findAll('.stat-card__title');
    expect(titles.map(t => t.text())).toEqual(['账号总数', '在线账号', '内容总数', '发布成功率']);
  });

  it('renders date range filter', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-radio-group"]').exists()).toBe(true);
  });

  it('renders ranking section', () => {
    wrapper = mountView();
    expect(wrapper.find('.ranking-section').exists()).toBe(true);
  });

  it('renders section header with ranking metric selector', () => {
    wrapper = mountView();
    const header = wrapper.find('.section-header');
    expect(header.exists()).toBe(true);
    expect(header.find('h3').text()).toBe('账号排行榜');
  });

  it('renders trend chart component', () => {
    wrapper = mountView();
    const charts = wrapper.findAll('[data-testid="trend-chart"]');
    expect(charts.length).toBeGreaterThanOrEqual(1);
  });
});
