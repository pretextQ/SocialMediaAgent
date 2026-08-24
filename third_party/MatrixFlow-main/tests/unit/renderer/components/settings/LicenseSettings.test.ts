import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import LicenseSettings from '@/renderer/components/settings/LicenseSettings.vue';

const mockLicenseStatus = vi.fn();
const mockLicenseActivate = vi.fn();
const mockLicenseDeactivate = vi.fn();
const mockLicenseOfflineRequest = vi.fn();
const mockLicenseActivateOffline = vi.fn();

vi.stubGlobal('window', {
  matrixflow: {
    license: {
      status: mockLicenseStatus,
      activate: mockLicenseActivate,
      deactivate: mockLicenseDeactivate,
      offlineRequest: mockLicenseOfflineRequest,
      activateOffline: mockLicenseActivateOffline,
    },
  },
});

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockRejectedValue('cancel') },
}));

const globalStubs = {
  'el-skeleton': {
    template: '<div data-testid="el-skeleton" />',
    props: ['rows', 'animated'],
  },
  'el-alert': {
    template: '<div data-testid="el-alert"><slot name="title" /><slot /></div>',
    props: ['type', 'closable', 'showIcon'],
  },
  'el-divider': {
    template: '<hr data-testid="el-divider" />',
    props: ['contentPosition'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading'],
    emits: ['click'],
  },
  'el-icon': {
    template: '<span data-testid="el-icon"><slot /></span>',
    props: ['size', 'color'],
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size'],
  },
  'el-form': {
    template: '<form data-testid="el-form"><slot /></form>',
    props: ['model', 'rules', 'labelWidth'],
  },
  'el-form-item': {
    template: '<div data-testid="el-form-item"><slot /></div>',
    props: ['label', 'prop'],
  },
  'el-input': {
    template: '<input data-testid="el-input" />',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
  },
  'el-steps': {
    template: '<div data-testid="el-steps"><slot /></div>',
    props: ['active', 'simple'],
  },
  'el-step': {
    template: '<div data-testid="el-step" />',
    props: ['title'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue" data-testid="el-dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  'CircleCheck': { template: '<span>✓</span>' },
  'CircleClose': { template: '<span>✗</span>' },
};

function mountComponent(licenseOverrides: Record<string, unknown> = {}) {
  return mount(LicenseSettings, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            license: {
              license: null,
              isValid: false,
              loading: false,
              ...licenseOverrides,
            },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('LicenseSettings', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLicenseStatus.mockResolvedValue({
      success: true,
      data: { valid: false },
    });
  });

  it('renders license-settings container', async () => {
    wrapper = mountComponent();
    expect(wrapper.find('.license-settings').exists()).toBe(true);
  });

  it('renders loading state on mount', async () => {
    mockLicenseStatus.mockImplementation(() => new Promise(() => {}));
    wrapper = mount(LicenseSettings, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: globalStubs,
      },
    });
    expect(wrapper.find('[data-testid="el-skeleton"]').exists()).toBe(true);
  });

  it('renders inactive license form when license is not valid', async () => {
    mockLicenseStatus.mockResolvedValue({
      success: true,
      data: { valid: false },
    });
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    expect(wrapper.find('.license-inactive').exists()).toBe(true);
  });

  it('renders license key input in inactive state', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    const inputs = wrapper.findAll('[data-testid="el-input"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders online activate button', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const activateBtn = buttons.find(b => b.text().includes('在线激活'));
    expect(activateBtn).toBeDefined();
  });

  it('renders offline request button', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const offlineBtn = buttons.find(b => b.text().includes('生成离线请求文件'));
    expect(offlineBtn).toBeDefined();
  });

  it('renders import offline file button', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const importBtn = buttons.find(b => b.text().includes('导入离线激活文件'));
    expect(importBtn).toBeDefined();
  });

  it('renders offline steps component', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    expect(wrapper.find('[data-testid="el-steps"]').exists()).toBe(true);
  });

  it('does not show offline dialog by default', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    expect(wrapper.find('[data-testid="el-dialog"]').exists()).toBe(false);
  });

  it('renders warning alert when license is inactive', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    const alert = wrapper.find('[data-testid="el-alert"]');
    expect(alert.exists()).toBe(true);
  });

  it('calls license status on mount', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    expect(mockLicenseStatus).toHaveBeenCalled();
  });

  it('renders form with license key and email fields', async () => {
    wrapper = mountComponent();
    await vi.dynamicImportSettled();
    const form = wrapper.find('[data-testid="el-form"]');
    expect(form.exists()).toBe(true);
    const formItems = wrapper.findAll('[data-testid="el-form-item"]');
    expect(formItems.length).toBeGreaterThanOrEqual(2);
  });
});
