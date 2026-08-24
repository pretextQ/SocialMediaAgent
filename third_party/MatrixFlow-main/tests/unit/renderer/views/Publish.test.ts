import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Publish from '@/renderer/views/Publish.vue';

const globalStubs = {
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'disabled', 'text', 'plain'],
    emits: ['click'],
  },
  'el-button-group': {
    template: '<div data-testid="el-btn-group"><slot /></div>',
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
  'el-drawer': {
    template: '<div v-if="modelValue" data-testid="el-drawer"><slot /></div>',
    props: ['modelValue', 'title', 'direction', 'size'],
    emits: ['update:modelValue'],
  },
  'Loading': { template: '<div data-testid="loading">Loading...</div>' },
  'PublishWizard': {
    template: '<div data-testid="publish-wizard" />',
    emits: ['confirmed', 'cancel'],
  },
  'CreatePublishDialog': {
    template: '<div data-testid="create-dialog" />',
    props: ['modelValue', 'defaultDate'],
    emits: ['update:modelValue', 'created'],
  },
  'EditPublishDialog': {
    template: '<div data-testid="edit-dialog" />',
    props: ['modelValue', 'task'],
    emits: ['update:modelValue', 'updated', 'deleted'],
  },
  'CalendarWeekView': {
    template: '<div data-testid="week-view" />',
    props: ['tasks', 'weekStart'],
    emits: ['taskContextmenu', 'taskDrop'],
  },
  'CalendarDayView': {
    template: '<div data-testid="day-view" />',
    props: ['tasks', 'date', 'conflicts'],
    emits: ['taskContextmenu', 'taskDrop'],
  },
  'CalendarContextMenu': {
    template: '<div data-testid="context-menu" />',
    props: ['visible', 'x', 'y', 'task'],
    emits: ['action', 'close'],
  },
  'CalendarSummaryBar': {
    template: '<div data-testid="summary-bar" />',
    props: ['tasks'],
  },
  'AIRuleOptimizationBanner': {
    template: '<div data-testid="ai-banner" />',
    props: ['groupId', 'groupName', 'currentRule'],
    emits: ['adopt', 'dismiss'],
  },
  'AICheckPanel': {
    template: '<div data-testid="ai-check" />',
    props: ['groupId', 'groupName', 'contentIds', 'accounts', 'scheduleSlots', 'rule'],
    emits: ['confirmed'],
  },
  Plus: { template: '<span>+</span>' },
  ArrowLeft: { template: '<span><</span>' },
  ArrowRight: { template: '<span>></span>' },
  Check: { template: '<span>✓</span>' },
};

function mountView(tasks: unknown[] = []) {
  return mount(Publish, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            publish: {
              tasks,
              loading: false,
              dryRun: false,
              prePublishCheck: true,
              healthCheckResults: [],
              publishHistory: [],
              publishHistoryTotal: 0,
              publishHistoryLoading: false,
            },
            group: {
              groups: [],
              loading: false,
            },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Publish', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page-publish container', () => {
    wrapper = mountView();
    expect(wrapper.find('.page-publish').exists()).toBe(true);
  });

  it('renders page title in calendar mode', () => {
    wrapper = mountView();
    expect(wrapper.find('.page-title').text()).toBe('发布管理');
  });

  it('renders calendar navigation', () => {
    wrapper = mountView();
    expect(wrapper.find('.calendar-nav').exists()).toBe(true);
  });

  it('renders today button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const todayBtn = buttons.find(b => b.text().includes('今天'));
    expect(todayBtn).toBeDefined();
  });

  it('renders view mode toggle (month/week/day)', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-radio-group"]').exists()).toBe(true);
  });

  it('renders create publish plan button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const createBtn = buttons.find(b => b.text().includes('创建发布计划'));
    expect(createBtn).toBeDefined();
  });

  it('renders calendar weekday headers', () => {
    wrapper = mountView();
    const weekdays = wrapper.findAll('.calendar__weekday');
    expect(weekdays.length).toBe(7);
    expect(weekdays[0].text()).toBe('日');
  });

  it('renders calendar cells (6 weeks * 7 days = 42)', () => {
    wrapper = mountView();
    const cells = wrapper.findAll('.calendar__cell');
    expect(cells.length).toBe(42);
  });

  it('renders summary bar', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="summary-bar"]').exists()).toBe(true);
  });

  it('does not render AI check button when no pending tasks', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const aiBtn = buttons.find(b => b.text().includes('AI 检查'));
    expect(aiBtn).toBeUndefined();
  });
});
