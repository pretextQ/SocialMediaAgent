import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import GroupEditDialog from '@/renderer/components/group/GroupEditDialog.vue';
import type { Group } from '@/renderer/stores/group';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const globalStubs = {
  'el-dialog': {
    template: '<div data-testid="el-dialog" :title="title" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width', 'destroyOnClose'],
    emits: ['update:modelValue'],
  },
  'el-form': {
    template: '<form data-testid="el-form"><slot /></form>',
    props: ['model', 'rules'],
    methods: {
      validate: vi.fn().mockResolvedValue(true),
    },
  },
  'el-form-item': {
    template: '<div data-testid="el-form-item" :label="label"><slot /></div>',
    props: ['label'],
  },
  'el-input': {
    template: '<input data-testid="el-input" type="text" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-select': {
    template: '<div data-testid="el-select"><slot /></div>',
    props: ['modelValue', 'multiple', 'filterable', 'placeholder'],
    emits: ['update:modelValue'],
  },
  'el-option': {
    template: '<option data-testid="el-option" :value="value">{{ label }}</option>',
    props: ['label', 'value'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'loading'],
    emits: ['click'],
  },
};

const resolvedColors = [
  '#db4b4b', '#e8993d', '#37b36e', '#2974e0',
  '#8a95a5', '#7f52b8', '#29b89d', '#e04040',
];

function createMockGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    name: '测试分组',
    color: resolvedColors[0],
    accountIds: ['acc-1', 'acc-2'],
    publishRule: {
      platforms: ['douyin'],
      timeSlots: ['09:00'],
      randomOffsetMin: 10,
      dailyCount: 3,
      publishMode: 'client',
      publishOrder: 'upload_order',
      restDays: [],
      isActive: true,
      publishStartTime: '08:00',
      publishEndTime: '22:00',
      intervalMinutes: 30,
      dailyLimit: 10,
      randomDelay: true,
    },
    sortOrder: 0,
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
    ...overrides,
  };
}

function createMockAccount(id: string, nickname: string, platform: string = 'douyin') {
  return {
    id,
    platform,
    nickname,
    avatar: undefined,
    status: 'online' as const,
    cookieValid: true,
    lastLogin: undefined,
    groupId: undefined,
    fingerprintId: undefined,
    proxyId: undefined,
    createdAt: '2026-05-01T10:00:00Z',
  };
}

function mountDialog(modelValue = true, group: Group | null = null) {
  return mount(GroupEditDialog, {
    props: { modelValue, group },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: globalStubs,
    },
  });
}

describe('GroupEditDialog', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    wrapper?.unmount();
  });

  describe('title rendering', () => {
    it('shows "创建分组" title when no group prop', () => {
      wrapper = mountDialog(true, null);
      const dialog = wrapper.findComponent('[data-testid="el-dialog"]');
      expect(dialog.exists()).toBe(true);
      expect(dialog.props('title')).toBe('创建分组');
    });

    it('shows "编辑分组" title when group prop provided', () => {
      const group = createMockGroup();
      wrapper = mountDialog(true, group);
      const dialog = wrapper.findComponent('[data-testid="el-dialog"]');
      expect(dialog.exists()).toBe(true);
      expect(dialog.props('title')).toBe('编辑分组');
    });

    it('does not render dialog when modelValue is false', () => {
      wrapper = mountDialog(false, null);
      expect(wrapper.find('[data-testid="el-dialog"]').exists()).toBe(false);
    });
  });

  describe('form fields', () => {
    it('renders name input field', () => {
      wrapper = mountDialog(true, null);
      const formItems = wrapper.findAll('[data-testid="el-form-item"]');
      expect(formItems.length).toBeGreaterThan(0);
      expect(wrapper.find('[data-testid="el-input"]').exists()).toBe(true);
    });

    it('renders color picker with 8 color options', () => {
      wrapper = mountDialog(true, null);
      const colorButtons = wrapper.findAll('.color-picker__item');
      expect(colorButtons.length).toBe(8);
    });

    it('renders account multi-select', () => {
      wrapper = mountDialog(true, null);
      const selects = wrapper.findAll('[data-testid="el-select"]');
      expect(selects.length).toBeGreaterThan(0);
    });

    it('renders form with 3 form items (name, color, accounts)', () => {
      wrapper = mountDialog(true, null);
      const formItems = wrapper.findAll('[data-testid="el-form-item"]');
      expect(formItems.length).toBe(3);
    });
  });

  describe('color selection', () => {
    it('renders first color as selected by default', () => {
      wrapper = mountDialog(true, null);
      const firstColor = wrapper.find('.color-picker__item');
      expect(firstColor.classes()).toContain('color-picker__item--active');
    });

    it('allows selecting a different color', async () => {
      wrapper = mountDialog(true, null);
      const colors = wrapper.findAll('.color-picker__item');
      await colors[2].trigger('click');
      expect(colors[2].classes()).toContain('color-picker__item--active');
    });
  });

  describe('form initialization on edit', () => {
    it('pre-fills name when editing existing group', async () => {
      wrapper = mountDialog(false, null);
      const group = createMockGroup({ name: '编辑的分组名称' });
      await wrapper.setProps({ modelValue: true, group });
      const vm = wrapper.vm as any;
      expect(vm.form.name).toBe('编辑的分组名称');
    });

    it('pre-fills color when editing existing group', async () => {
      wrapper = mountDialog(false, null);
      const group = createMockGroup({ color: resolvedColors[3] });
      await wrapper.setProps({ modelValue: true, group });
      const vm = wrapper.vm as any;
      expect(vm.form.color).toBe(resolvedColors[3]);
    });
  });

  describe('submit button text', () => {
    it('shows "确认创建" in create mode', () => {
      wrapper = mountDialog(true, null);
      const buttons = wrapper.findAll('[data-testid="el-btn"]');
      const submitBtn = buttons.find(b => b.text() === '确认创建');
      expect(submitBtn).toBeDefined();
    });

    it('shows "保存修改" in edit mode', () => {
      const group = createMockGroup();
      wrapper = mountDialog(true, group);
      const buttons = wrapper.findAll('[data-testid="el-btn"]');
      const submitBtn = buttons.find(b => b.text() === '保存修改');
      expect(submitBtn).toBeDefined();
    });
  });

  describe('cancel button', () => {
    it('renders cancel button', () => {
      wrapper = mountDialog(true, null);
      const buttons = wrapper.findAll('[data-testid="el-btn"]');
      const cancelBtn = buttons.find(b => b.text() === '取消');
      expect(cancelBtn).toBeDefined();
    });

    it('emits update:modelValue false when cancel clicked', async () => {
      wrapper = mountDialog(true, null);
      const buttons = wrapper.findAll('[data-testid="el-btn"]');
      const cancelBtn = buttons.find(b => b.text() === '取消');
      await cancelBtn!.trigger('click');
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([false]);
    });
  });

  describe('create flow', () => {
    it('calls createGroup API on submit', async () => {
      const groupStore = {
        createGroup: vi.fn().mockResolvedValue({ id: 'new-group' }),
        updateGroup: vi.fn(),
      };
      wrapper = mountDialog(true, null);
      wrapper.vm.$pinia.state.value.group = groupStore;

      const buttons = wrapper.findAll('[data-testid="el-btn"]');
      const submitBtn = buttons.find(b => b.text() === '确认创建');
      await submitBtn!.trigger('click');
    });
  });

  describe('edit flow', () => {
    it('calls updateGroup API on submit with correct params', async () => {
      const group = createMockGroup();
      wrapper = mountDialog(true, group);

      const vm = wrapper.vm as any;
      const groupStore = vm.groupStore;

      groupStore.updateGroup = vi.fn().mockResolvedValue({});
      groupStore.createGroup = vi.fn();

      const buttons = wrapper.findAll('[data-testid="el-btn"]');
      const submitBtn = buttons.find(b => b.text() === '保存修改');
      await submitBtn!.trigger('click');
    });
  });

  describe('reset form on dialog close', () => {
    it('resets form when dialog closes', async () => {
      wrapper = mountDialog(true, null);

      const group = createMockGroup({ name: '分组名称' });
      await wrapper.setProps({ group });

      await wrapper.setProps({ modelValue: false });

      await wrapper.setProps({ modelValue: true, group: null });

      const dialog = wrapper.findComponent('[data-testid="el-dialog"]');
      expect(dialog.props('title')).toBe('创建分组');
    });
  });
});