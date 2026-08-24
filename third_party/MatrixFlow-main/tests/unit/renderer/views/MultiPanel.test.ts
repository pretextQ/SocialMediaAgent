import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import MultiPanel from '@/renderer/views/MultiPanel.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/stores/panel', () => ({
  usePanelStore: () => ({
    panels: [],
    availableAccounts: [
      { id: 'a1', platform: 'douyin', nickname: '抖音号' },
      { id: 'a2', platform: 'xiaohongshu', nickname: '小红书号' },
    ],
    focusedPanelId: null,
    maxPanels: 10,
    loadAvailableAccounts: vi.fn().mockResolvedValue(undefined),
    loadPanels: vi.fn().mockResolvedValue(undefined),
    openPanel: vi.fn().mockResolvedValue(null),
    closePanel: vi.fn(),
    focusPanel: vi.fn(),
  }),
}));

const globalStubs = {
  'el-select': {
    template: '<select data-testid="el-select"><slot /></select>',
    props: ['modelValue', 'placeholder', 'style', 'disabled'],
    emits: ['update:modelValue'],
  },
  'el-option': {
    template: '<option data-testid="el-option"><slot /></option>',
    props: ['label', 'value', 'key'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'text', 'disabled'],
    emits: ['click'],
  },
  'el-icon': { template: '<span><slot /></span>', props: ['size'] },
  Monitor: { template: '<span>monitor</span>' },
  Grid: { template: '<span>grid</span>' },
};

function mountView() {
  return mount(MultiPanel, {
    global: {
      plugins: [
        createTestingPinia({ createSpy: vi.fn }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('MultiPanel', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders multi-panel-view container', () => {
    wrapper = mountView();
    expect(wrapper.find('.multi-panel-view').exists()).toBe(true);
  });

  it('renders panel toolbar with account selector', () => {
    wrapper = mountView();
    expect(wrapper.find('.panel-toolbar').exists()).toBe(true);
    expect(wrapper.find('[data-testid="el-select"]').exists()).toBe(true);
  });

  it('renders open panel button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const openBtn = buttons.find(b => b.text().includes('打开面板'));
    expect(openBtn).toBeDefined();
  });

  it('renders panel count indicator', () => {
    wrapper = mountView();
    expect(wrapper.find('.panel-count').exists()).toBe(true);
    expect(wrapper.find('.panel-count').text()).toContain('已打开');
  });

  it('renders empty state when no panels open', () => {
    wrapper = mountView();
    expect(wrapper.find('.panel-empty').exists()).toBe(true);
  });

  it('renders hint text in empty state', () => {
    wrapper = mountView();
    const empty = wrapper.find('.panel-empty');
    expect(empty.text()).toContain('暂无打开的面板');
  });

  it('renders secondary hint about max panels', () => {
    wrapper = mountView();
    const hint = wrapper.find('.hint-secondary');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain('10');
  });

  it('does not show panel tabs when no panels open', () => {
    wrapper = mountView();
    expect(wrapper.find('.panel-tabs').exists()).toBe(false);
  });

  it('does not show panel content when no panels open', () => {
    wrapper = mountView();
    expect(wrapper.find('.panel-content').exists()).toBe(false);
  });
});
