import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Groups from '@/renderer/views/Groups.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const globalStubs = {
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'disabled'],
    emits: ['click'],
  },
  'el-icon': { template: '<span><slot /></span>', props: ['size'] },
  'Loading': { template: '<div data-testid="loading">Loading...</div>' },
  'Empty': {
    template: '<div data-testid="empty">{{ text }}</div>',
    props: ['text', 'actionLabel'],
    emits: ['action'],
  },
  'GroupCard': {
    template: '<div data-testid="group-card">{{ group.name }}</div>',
    props: ['group'],
    emits: ['edit', 'manageAccounts', 'configRules', 'delete'],
  },
  'GroupEditDialog': {
    template: '<div data-testid="group-edit-dialog" />',
    props: ['modelValue', 'group'],
    emits: ['update:modelValue', 'saved'],
  },
  'AccountBindDialog': {
    template: '<div data-testid="account-bind-dialog" />',
    props: ['modelValue', 'group'],
    emits: ['update:modelValue'],
  },
  'PublishRuleDialog': {
    template: '<div data-testid="publish-rule-dialog" />',
    props: ['modelValue', 'group'],
    emits: ['update:modelValue'],
  },
  Plus: { template: '<span>+</span>' },
};

const defaultRule = {
  platforms: [], timeSlots: ['09:00'], randomOffsetMin: 10, dailyCount: 3,
  publishMode: 'client' as const, publishOrder: 'upload_order' as const,
  restDays: [], isActive: true, publishStartTime: '08:00', publishEndTime: '22:00',
  intervalMinutes: 30, dailyLimit: 10, randomDelay: true,
};

const sampleGroups = [
  { id: 'g1', name: '默认分组', color: '#409EFF', accountIds: ['a1', 'a2'], publishRule: { ...defaultRule, platforms: ['douyin'] }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'g2', name: '测试分组', color: '#67C23A', accountIds: ['a3'], publishRule: defaultRule, createdAt: '2026-02-01', updatedAt: '2026-02-01' },
];

function mountView(groups: unknown[] = []) {
  return mount(Groups, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            group: { groups, loading: false },
            account: { accounts: [], loading: false },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Groups', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    wrapper = mountView();
    expect(wrapper.find('.page-groups__title').text()).toBe('分组管理');
  });

  it('renders create group button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const createBtn = buttons.find(b => b.text().includes('创建分组'));
    expect(createBtn).toBeDefined();
  });

  it('renders group count stat', () => {
    wrapper = mountView(sampleGroups);
    const labels = wrapper.findAll('.stat-card__label');
    expect(labels[0].text()).toBe('分组总数');
    const values = wrapper.findAll('.stat-card__value');
    expect(values[0].text()).toBe('2');
  });

  it('renders bound accounts stat', () => {
    wrapper = mountView(sampleGroups);
    const labels = wrapper.findAll('.stat-card__label');
    expect(labels[1].text()).toBe('已绑定账号');
    const values = wrapper.findAll('.stat-card__value');
    expect(values[1].text()).toBe('3');
  });

  it('renders group cards when groups exist', () => {
    wrapper = mountView(sampleGroups);
    const cards = wrapper.findAll('[data-testid="group-card"]');
    expect(cards.length).toBe(2);
  });

  it('renders Empty when no groups', () => {
    wrapper = mountView([]);
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
  });

  it('renders Loading when store is loading', () => {
    wrapper = mount(Groups, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: { group: { groups: [], loading: true }, account: { accounts: [], loading: false } },
          }),
        ],
        stubs: globalStubs,
      },
    });
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);
  });

  it('renders stats section', () => {
    wrapper = mountView(sampleGroups);
    expect(wrapper.find('.page-groups__stats').exists()).toBe(true);
  });

  it('renders grid container for group cards', () => {
    wrapper = mountView(sampleGroups);
    expect(wrapper.find('.page-groups__grid').exists()).toBe(true);
  });

  it('renders active rules stat', () => {
    wrapper = mountView(sampleGroups);
    const labels = wrapper.findAll('.stat-card__label');
    expect(labels[2].text()).toBe('已配置规则');
  });
});
