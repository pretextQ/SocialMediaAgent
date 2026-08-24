import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Tasks from '@/renderer/views/Tasks.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockRejectedValue('cancel') },
}));

const globalStubs = {
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'disabled', 'text', 'plain', 'link', 'loading'],
    emits: ['click'],
  },
  'el-icon': { template: '<span><slot /></span>', props: ['size'] },
  'el-radio-group': {
    template: '<div data-testid="el-radio-group"><slot /></div>',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue'],
  },
  'el-radio-button': {
    template: '<label><slot /></label>',
    props: ['value'],
  },
  'el-table': {
    template: '<div data-testid="el-table"><slot /></div>',
    props: ['data', 'stripe', 'border', 'size', 'vLoading'],
  },
  'el-table-column': {
    template: '<div><slot name="default" :row="{}" /></div>',
    props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'type', 'showOverflowTooltip'],
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size', 'effect', 'round'],
  },
  'el-progress': {
    template: '<div data-testid="el-progress" />',
    props: ['percentage', 'strokeWidth', 'status', 'showText'],
  },
  'el-empty': {
    template: '<div data-testid="el-empty">{{ description }}</div>',
    props: ['description'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue" data-testid="el-dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  'el-skeleton': {
    template: '<div data-testid="el-skeleton" />',
    props: ['rows', 'animated'],
  },
  Refresh: { template: '<span>refresh</span>' },
  Camera: { template: '<span>camera</span>' },
};

const sampleTasks = [
  { id: 't1', type: 'publish', accountId: 'a1', accountName: '抖音号', contentTitle: '视频1', platform: 'douyin', status: 'success', progress: 100, retryCount: 0, createdAt: '2026-05-19T10:00:00Z', updatedAt: '2026-05-19T10:01:00Z', completedAt: '2026-05-19T10:01:00Z' },
  { id: 't2', type: 'publish', accountId: 'a2', accountName: '小红书号', contentTitle: '视频2', platform: 'xiaohongshu', status: 'failed', progress: 50, message: '上传失败', retryCount: 1, createdAt: '2026-05-19T09:00:00Z', updatedAt: '2026-05-19T09:05:00Z' },
  { id: 't3', type: 'publish', accountId: 'a3', accountName: '快手号', contentTitle: '视频3', platform: 'kuaishou', status: 'pending', progress: 0, retryCount: 0, createdAt: '2026-05-19T11:00:00Z', updatedAt: '2026-05-19T11:00:00Z' },
];

function mountView(tasks: unknown[] = []) {
  return mount(Tasks, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            task: { tasks, loading: false },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Tasks', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page-tasks container', () => {
    wrapper = mountView();
    expect(wrapper.find('.page-tasks').exists()).toBe(true);
  });

  it('renders stats cards row', () => {
    wrapper = mountView(sampleTasks);
    expect(wrapper.find('.page-tasks__stats').exists()).toBe(true);
  });

  it('renders correct number of stat cards (5 stats + 1 rate)', () => {
    wrapper = mountView(sampleTasks);
    const cards = wrapper.findAll('.stat-card');
    expect(cards.length).toBe(6);
  });

  it('renders stat card values from store', () => {
    wrapper = mountView(sampleTasks);
    const values = wrapper.findAll('.stat-card__value');
    expect(values[0].text()).toBe('3'); // total
    expect(values[1].text()).toBe('1'); // pending
    expect(values[4].text()).toBe('1'); // failed
  });

  it('renders success rate', () => {
    wrapper = mountView(sampleTasks);
    const rateCard = wrapper.find('.stat-card--rate');
    expect(rateCard.exists()).toBe(true);
    expect(rateCard.find('.stat-card__value').text()).toBe('33%'); // 1/3 = 33%
  });

  it('renders view mode radio group', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-radio-group"]').exists()).toBe(true);
  });

  it('renders summary view by default', () => {
    wrapper = mountView(sampleTasks);
    expect(wrapper.find('.tasks-view--summary').exists()).toBe(true);
  });

  it('renders failed section when tasks have failures', () => {
    wrapper = mountView(sampleTasks);
    expect(wrapper.find('.failed-section').exists()).toBe(true);
    expect(wrapper.find('.section-title').text()).toContain('需要处理');
  });

  it('renders retry all button when failed tasks exist', () => {
    wrapper = mountView(sampleTasks);
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const retryBtn = buttons.find(b => b.text().includes('全部重试'));
    expect(retryBtn).toBeDefined();
  });

  it('renders toolbar actions', () => {
    wrapper = mountView();
    expect(wrapper.find('.toolbar-actions').exists()).toBe(true);
  });

  it('does not show re-login dialog by default', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-dialog"]').exists()).toBe(false);
  });
});
