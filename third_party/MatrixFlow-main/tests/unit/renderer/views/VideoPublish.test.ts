import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import VideoPublish from '@/renderer/views/publish/VideoPublish.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/publish/video', query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const presetGet = vi.fn();

const accounts = [
  {
    id: 'xhs-1',
    platform: 'xiaohongshu',
    nickname: '小红书账号',
    status: 'online',
    cookieValid: true,
    createdAt: '2026-06-01T00:00:00.000Z',
  },
];

function mountView() {
  const ElIconStub = { template: '<span><slot /></span>', props: ['size', 'color'] };
  const ElButtonStub = {
    template: '<button data-testid="el-btn" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'disabled'],
    emits: ['click'],
  };
  const ElRadioGroupStub = {
    template: '<div><slot /></div>',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue'],
  };
  const ElRadioButtonStub = {
    template: '<label><slot /></label>',
    props: ['value'],
  };
  const ElCheckboxStub = {
    template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  };

  return mount(VideoPublish, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            account: {
              accounts,
              loading: false,
            },
          },
        }),
      ],
      stubs: {
        RouterLink: {
          template: '<a><slot /></a>',
          props: ['to'],
        },
        'el-icon': ElIconStub,
        ElIcon: ElIconStub,
        'el-button': ElButtonStub,
        ElButton: ElButtonStub,
        'el-radio-group': ElRadioGroupStub,
        ElRadioGroup: ElRadioGroupStub,
        'el-radio-button': ElRadioButtonStub,
        ElRadioButton: ElRadioButtonStub,
        'el-checkbox': ElCheckboxStub,
        ElCheckbox: ElCheckboxStub,
        VideoUploadCard: {
          template: '<div data-testid="upload-card" />',
          props: ['modelValue'],
          emits: ['update:modelValue', 'delete', 'autoTitle'],
        },
        VideoCommonForm: {
          template: '<div data-testid="common-form" />',
          props: ['modelValue'],
          emits: ['update:modelValue'],
        },
        PlatformAccountBar: {
          template: '<div data-testid="account-bar"><button data-testid="open-picker" @click="$emit(\'add-account\')">添加</button></div>',
          props: ['accounts', 'selectedAccountId'],
          emits: ['select', 'addAccount'],
        },
        PlatformConfigEditor: {
          template: '<pre data-testid="platform-config">{{ JSON.stringify(platformConfig) }}</pre>',
          props: ['account', 'platformConfig', 'commonConfig'],
          emits: ['update:platformConfig'],
        },
        PublishActionBar: {
          template: '<div data-testid="action-bar" />',
          props: ['publishing', 'disabled'],
          emits: ['clearAll', 'saveDraft', 'publish'],
        },
        AccountPickerDialog: {
          template: '<button data-testid="confirm-account" @click="$emit(\'confirm\', [\'xhs-1\'])">确认账号</button>',
          props: ['modelValue', 'platformConfigs'],
          emits: ['update:modelValue', 'confirm'],
        },
      },
    },
  });
}

describe('VideoPublish 账号发布预设', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    wrapper?.unmount();
    vi.clearAllMocks();
    delete (window as any).matrixflow;
  });

  it('添加账号时填充启用的发布预设，应用账号时左侧无标签不清空预设标签', async () => {
    presetGet.mockResolvedValue({
      success: true,
      data: {
        accountId: 'xhs-1',
        platform: 'xiaohongshu',
        defaultTopics: ['#笔记', '#AI合成内容'],
        platformOptions: { declaration: 2, visibility: 'private' },
        enabled: true,
      },
    });
    (window as any).matrixflow = {
      accountPublishPreset: { get: presetGet },
      draft: {},
    };

    wrapper = mountView();
    await wrapper.get('[data-testid="confirm-account"]').trigger('click');
    await flushPromises();

    const initialConfig = JSON.parse(wrapper.get('[data-testid="platform-config"]').text());
    expect(initialConfig).toMatchObject({
      tags: ['#笔记', '#AI合成内容'],
      declaration: '2',
      visibility: 'private',
    });

    const applyButton = wrapper.findAll('[data-testid="el-btn"]').find(button => button.text().includes('应用账号'));
    expect(applyButton).toBeTruthy();
    await applyButton!.trigger('click');
    await flushPromises();

    const afterApplyConfig = JSON.parse(wrapper.get('[data-testid="platform-config"]').text());
    expect(afterApplyConfig.tags).toEqual(['#笔记', '#AI合成内容']);
    expect(afterApplyConfig.declaration).toBe('2');
  });
});
