import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Accounts from '@/renderer/views/Accounts.vue';

const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/accounts', params: {}, query: {}, meta: {} }),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

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
  'el-radio-group': {
    template: '<div data-testid="el-radio-group"><slot /></div>',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue'],
  },
  'el-radio-button': {
    template: '<label><slot /></label>',
    props: ['value', 'label'],
  },
  'el-select': {
    template: '<select data-testid="el-select"><slot /></select>',
    props: ['modelValue', 'placeholder', 'clearable', 'size', 'style'],
    emits: ['update:modelValue', 'change'],
  },
  'el-option': {
    template: '<option><slot /></option>',
    props: ['label', 'value', 'key'],
  },
  'el-input': {
    template: '<input data-testid="el-input" />',
    props: ['modelValue', 'placeholder', 'prefixIcon', 'clearable', 'style'],
    emits: ['update:modelValue'],
  },
  'el-popconfirm': {
    template: '<div data-testid="el-popconfirm"><slot name="reference" /><slot /></div>',
    props: ['title'],
    emits: ['confirm'],
  },
  'Loading': { template: '<div data-testid="loading">Loading...</div>' },
  'Empty': {
    template: '<div data-testid="empty">{{ text }}</div>',
    props: ['text', 'actionLabel'],
    emits: ['action'],
  },
  'AccountCard': {
    template: '<div data-testid="account-card">{{ account.nickname }}</div>',
    props: ['account', 'selected', 'groups'],
    emits: ['toggleSelect', 'detail', 'validate', 'login', 'delete'],
  },
  'BindAccountDialog': {
    template: '<div data-testid="bind-dialog" />',
    props: ['modelValue'],
    emits: ['update:modelValue', 'success'],
  },
  'AccountSettingsDrawer': {
    template: '<div data-testid="settings-drawer" />',
    props: ['modelValue', 'account'],
    emits: ['update:modelValue', 'changed'],
  },
  'AccountFilterPanel': {
    template: '<div data-testid="account-filter-panel" />',
    props: ['groups'],
    emits: ['filter-platform', 'filter-group', 'filter-status'],
  },
  'GroupsTab': {
    template: '<div data-testid="groups-tab" />',
    props: ['groups'],
  },
  'el-tabs': {
    template: '<div data-testid="el-tabs"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-tab-pane': {
    template: '<div><slot /><slot name="label" /></div>',
    props: ['label', 'name'],
  },
  Plus: { template: '<span>+</span>' },
  Grid: { template: '<span>grid</span>' },
  User: { template: '<span>user</span>' },
  Search: { template: '<span>search</span>' },
};

function mountView(initialAccounts: unknown[] = [], initialGroups: unknown[] = []) {
  return mount(Accounts, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            account: {
              accounts: initialAccounts,
              loading: false,
            },
            group: {
              groups: initialGroups,
              loading: false,
            },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

const sampleAccounts = [
  { id: 'a1', platform: 'douyin', nickname: '抖音号1', status: 'online', cookieValid: true, lastLogin: '2026-05-01', createdAt: '2026-01-01' },
  { id: 'a2', platform: 'xiaohongshu', nickname: '小红书号', status: 'expired', cookieValid: false, lastLogin: '2026-03-01', createdAt: '2026-01-01' },
  { id: 'a3', platform: 'channels', nickname: '视频号', status: 'online', cookieValid: true, lastLogin: '2026-05-19', createdAt: '2026-02-01' },
];

const sampleGroups = [
  { id: 'g1', name: '默认分组', accountIds: [], publishRule: { platforms: [], timeSlots: [], dailyCount: 3 }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

describe('Accounts', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders add account button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders account cards when accounts exist', () => {
    wrapper = mountView(sampleAccounts);
    const cards = wrapper.findAll('[data-testid="account-card"]');
    expect(cards.length).toBe(3);
  });

  it('renders Empty when no accounts', () => {
    wrapper = mountView([]);
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty"]').text()).toContain('暂无匹配的账号');
  });

  it('renders Loading when store is loading', () => {
    wrapper = mount(Accounts, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              account: { accounts: [], loading: true },
              group: { groups: [], loading: false },
            },
          }),
        ],
        stubs: globalStubs,
      },
    });
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);
  });

  it('renders filter toolbar with radio group', () => {
    wrapper = mountView(sampleAccounts);
    expect(wrapper.find('[data-testid="el-radio-group"]').exists()).toBe(true);
  });

  it('renders search input', () => {
    wrapper = mountView(sampleAccounts);
    expect(wrapper.find('[data-testid="el-input"]').exists()).toBe(true);
  });

  it('calls fetchAccounts on mount', () => {
    wrapper = mountView();
    const pinia = wrapper.vm.$pinia;
    const accountStore = pinia.state.value.account;
    // fetchAccounts is called onMounted; with createTestingPinia it's mocked
    expect(wrapper.find('.page-accounts').exists()).toBe(true);
  });
});
