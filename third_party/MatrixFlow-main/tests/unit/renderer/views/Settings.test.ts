import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Settings from '@/renderer/views/Settings.vue';

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
  'el-form': {
    template: '<form data-testid="el-form"><slot /></form>',
    props: ['labelWidth', 'class'],
  },
  'el-form-item': {
    template: '<div data-testid="el-form-item"><slot /></div>',
    props: ['label'],
  },
  'el-select': {
    template: '<select data-testid="el-select"><slot /></select>',
    props: ['modelValue', 'style'],
    emits: ['update:modelValue', 'change'],
  },
  'el-option': {
    template: '<option><slot /></option>',
    props: ['label', 'value'],
  },
  'el-input': {
    template: '<input data-testid="el-input" />',
    props: ['modelValue', 'placeholder', 'style'],
    emits: ['update:modelValue', 'change'],
  },
  'el-input-number': {
    template: '<input type="number" data-testid="el-input-number" />',
    props: ['modelValue', 'min', 'max', 'step'],
    emits: ['update:modelValue', 'change'],
  },
  'el-switch': {
    template: '<div data-testid="el-switch" />',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
  },
  'el-radio-group': {
    template: '<div data-testid="el-radio-group"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
  },
  'el-radio-button': {
    template: '<label><slot /></label>',
    props: ['value'],
  },
  'el-divider': {
    template: '<hr data-testid="el-divider" />',
    props: ['contentPosition'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size'],
    emits: ['click'],
  },
  'FingerprintSettings': { template: '<div data-testid="fingerprint-settings" />' },
  'ProxySettings': { template: '<div data-testid="proxy-settings" />' },
  'PlatformSettings': { template: '<div data-testid="platform-settings" />' },
  'LicenseSettings': { template: '<div data-testid="license-settings" />' },
  'NotificationSettings': { template: '<div data-testid="notification-settings" />' },
  'DataManagementSettings': { template: '<div data-testid="data-settings" />' },
  'AboutPanel': { template: '<div data-testid="about-panel" />' },
};

const defaultSettings = {
  theme: 'light', language: 'zh-CN', concurrentTasks: 3, retryLimit: 3,
  autoCheckCookie: true, cookieCheckInterval: 60, proxyEnabled: false,
  proxyUrl: '', dataDir: '', browserMode: 'embedded', chromePath: '',
  fingerprintBrowserPath: '', chromeCdpEndpoint: '', fingerprintCdpEndpoint: '', notificationEnabled: true,
  notificationSound: true, notificationMonitorAlerts: true,
  notificationAnomalyAlerts: true, notificationCriticalOnly: false,
};

function mountView() {
  return mount(Settings, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            settings: { settings: { ...defaultSettings }, loading: false },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Settings', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    wrapper = mountView();
    expect(wrapper.find('.page-settings__title').text()).toBe('设置');
  });

  it('renders tabs component', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-tabs"]').exists()).toBe(true);
  });

  it('renders all tab panes', () => {
    wrapper = mountView();
    const panes = wrapper.findAll('[data-testid="el-tab-pane"]');
    expect(panes.length).toBe(9);
  });

  it('renders settings card in general tab', () => {
    wrapper = mountView();
    expect(wrapper.find('.settings-card').exists()).toBe(true);
  });

  it('renders settings form', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-form"]').exists()).toBe(true);
  });

  it('renders theme select', () => {
    wrapper = mountView();
    const selects = wrapper.findAll('[data-testid="el-select"]');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders concurrent tasks input number', () => {
    wrapper = mountView();
    const inputs = wrapper.findAll('[data-testid="el-input-number"]');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders cookie check switch', () => {
    wrapper = mountView();
    const switches = wrapper.findAll('[data-testid="el-switch"]');
    expect(switches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders browser mode radio group', () => {
    wrapper = mountView();
    const groups = wrapper.findAll('[data-testid="el-radio-group"]');
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it('renders sub-setting components', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="fingerprint-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="proxy-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="about-panel"]').exists()).toBe(true);
  });
});
