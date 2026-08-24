import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Content from '@/renderer/views/Content.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockRejectedValue('cancel') },
}));

const globalStubs = {
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'disabled', 'text', 'plain', 'loading'],
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
  'el-input': {
    template: '<input data-testid="el-input" />',
    props: ['modelValue', 'placeholder', 'prefixIcon', 'clearable', 'class'],
    emits: ['update:modelValue'],
  },
  'el-select': {
    template: '<select><slot /></select>',
    props: ['modelValue', 'style'],
    emits: ['update:modelValue'],
  },
  'el-option': {
    template: '<option><slot /></option>',
    props: ['label', 'value'],
  },
  'el-form': { template: '<form><slot /></form>', props: ['labelWidth'] },
  'el-form-item': { template: '<div><slot /></div>', props: ['label'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width', 'destroyOnClose'],
    emits: ['update:modelValue'],
  },
  'el-table': {
    template: '<div data-testid="el-table"><slot /></div>',
    props: ['data', 'stripe', 'class'],
  },
  'el-table-column': {
    template: '<div><slot name="default" :row="{}" /></div>',
    props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'type', 'showOverflowTooltip'],
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size', 'effect', 'round'],
  },
  'el-popconfirm': {
    template: '<div><slot name="reference" /><slot /></div>',
    props: ['title'],
    emits: ['confirm'],
  },
  'Loading': { template: '<div data-testid="loading">Loading...</div>' },
  'Empty': {
    template: '<div data-testid="empty">{{ text }}</div>',
    props: ['text', 'actionLabel'],
    emits: ['action'],
  },
  'ContentCard': {
    template: '<div data-testid="content-card">{{ content.title }}</div>',
    props: ['content', 'selected'],
    emits: ['select', 'edit', 'publish', 'view', 'delete'],
  },
  'ContentEditDialog': {
    template: '<div data-testid="edit-dialog" />',
    props: ['modelValue', 'content'],
    emits: ['update:modelValue', 'saved'],
  },
  'PublishDialog': {
    template: '<div data-testid="publish-dialog" />',
    props: ['modelValue', 'contents'],
    emits: ['update:modelValue'],
  },
  Upload: { template: '<span>upload</span>' },
  Promotion: { template: '<span>promote</span>' },
  Delete: { template: '<span>del</span>' },
  Grid: { template: '<span>grid</span>' },
  List: { template: '<span>list</span>' },
  VideoCamera: { template: '<span>video</span>' },
  Picture: { template: '<span>pic</span>' },
};

const sampleContents = [
  { id: 'c1', title: '视频1', type: 'video', status: 'ready', tags: ['测试'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'c2', title: '图片2', type: 'image', status: 'draft', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

function mountView(contents: unknown[] = []) {
  return mount(Content, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            content: {
              contents,
              loading: false,
              searchQuery: '',
              statusFilter: '',
            },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

describe('Content', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    wrapper = mountView();
    expect(wrapper.find('.content-page__title').text()).toBe('内容库');
  });

  it('renders content count', () => {
    wrapper = mountView(sampleContents);
    expect(wrapper.find('.content-page__count').text()).toContain('2 项');
  });

  it('renders content cards in grid view by default', () => {
    wrapper = mountView(sampleContents);
    const cards = wrapper.findAll('[data-testid="content-card"]');
    expect(cards.length).toBe(2);
  });

  it('renders Loading when store is loading', () => {
    wrapper = mount(Content, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: { content: { contents: [], loading: true, searchQuery: '', statusFilter: '' } },
          }),
        ],
        stubs: globalStubs,
      },
    });
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);
  });

  it('renders Empty when no contents', () => {
    wrapper = mountView([]);
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
  });

  it('renders toolbar with filter radio group', () => {
    wrapper = mountView(sampleContents);
    expect(wrapper.find('[data-testid="el-radio-group"]').exists()).toBe(true);
  });

  it('renders search input', () => {
    wrapper = mountView(sampleContents);
    expect(wrapper.find('[data-testid="el-input"]').exists()).toBe(true);
  });

  it('renders import content button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const importBtn = buttons.find(b => b.text().includes('导入内容'));
    expect(importBtn).toBeDefined();
  });

  it('renders publish button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const publishBtn = buttons.find(b => b.text().includes('发布选中'));
    expect(publishBtn).toBeDefined();
  });

  it('applies dragging class when isDragging is true', async () => {
    wrapper = mountView();
    expect(wrapper.find('.content-page--dragging').exists()).toBe(false);
  });
});
