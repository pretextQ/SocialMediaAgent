import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Drafts from '@/renderer/views/Drafts.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockRejectedValue('cancel') },
}));

const globalStubs = {
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'text', 'disabled'],
    emits: ['click'],
  },
  'el-radio-group': {
    template: '<div data-testid="el-radio-group"><slot /></div>',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue', 'change'],
  },
  'el-radio-button': {
    template: '<label><slot /></label>',
    props: ['label'],
  },
  'el-table': {
    template: '<div data-testid="el-table"><slot /></div>',
    props: ['data', 'stripe', 'vLoading'],
  },
  'el-table-column': {
    template: '<div data-testid="el-table-column"><slot name="default" :row="{}" /></div>',
    props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'showOverflowTooltip'],
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue" data-testid="el-dialog"><slot /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  'draft-editor': {
    template: '<div data-testid="draft-editor" />',
    props: ['draft'],
    emits: ['save', 'cancel'],
  },
};

const sampleDrafts = [
  { id: 'd1', type: 'video', title: '测试草稿1', status: 'draft', updatedAt: new Date().toISOString(), createdAt: new Date(), platformConfigs: {} },
  { id: 'd2', type: 'image', title: '测试草稿2', status: 'ready', updatedAt: new Date().toISOString(), createdAt: new Date(), platformConfigs: {} },
];

function mountView(drafts: unknown[] = []) {
  return mount(Drafts, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            draft: { drafts, loading: false, filterStatus: '' },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Drafts', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders draft-view container', () => {
    wrapper = mountView();
    expect(wrapper.find('.draft-view').exists()).toBe(true);
  });

  it('renders create draft button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const createBtn = buttons.find(b => b.text().includes('新建草稿'));
    expect(createBtn).toBeDefined();
  });

  it('renders toolbar with radio group for filtering', () => {
    wrapper = mountView();
    expect(wrapper.find('.draft-toolbar').exists()).toBe(true);
    expect(wrapper.find('[data-testid="el-radio-group"]').exists()).toBe(true);
  });

  it('renders draft table', () => {
    wrapper = mountView(sampleDrafts);
    expect(wrapper.find('[data-testid="el-table"]').exists()).toBe(true);
  });

  it('does not show editor dialog by default', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="el-dialog"]').exists()).toBe(false);
  });

  it('renders table columns', () => {
    wrapper = mountView(sampleDrafts);
    const columns = wrapper.findAll('[data-testid="el-table-column"]');
    expect(columns.length).toBeGreaterThan(0);
  });

  it('renders action buttons in table rows', () => {
    wrapper = mountView(sampleDrafts);
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const editBtn = buttons.find(b => b.text().includes('编辑'));
    expect(editBtn).toBeDefined();
  });

  it('renders duplicate button in table', () => {
    wrapper = mountView(sampleDrafts);
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const dupBtn = buttons.find(b => b.text().includes('复制'));
    expect(dupBtn).toBeDefined();
  });

  it('renders delete button in table', () => {
    wrapper = mountView(sampleDrafts);
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const delBtn = buttons.find(b => b.text().includes('删除'));
    expect(delBtn).toBeDefined();
  });
});
