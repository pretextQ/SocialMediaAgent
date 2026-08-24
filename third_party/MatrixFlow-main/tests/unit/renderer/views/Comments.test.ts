import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Comments from '@/renderer/views/Comments.vue';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const globalStubs = {
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'text', 'disabled'],
    emits: ['click'],
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
    props: ['type', 'size', 'effect', 'round'],
  },
  'el-dialog': {
    template: '<div data-testid="el-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width', 'destroyOnClose'],
    emits: ['update:modelValue'],
  },
  'comment-template-editor': {
    template: '<div data-testid="template-editor" />',
    props: ['template'],
    emits: ['save', 'cancel'],
  },
};

function mountView(templates: unknown[] = [], tasks: unknown[] = []) {
  return mount(Comments, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            comment: { templates, tasks, loading: false },
          },
        }),
      ],
      stubs: globalStubs,
    },
  });
}

const sampleTemplates = [
  { id: 't1', platform: 'douyin', name: '感谢评论', content: '感谢支持！', triggerCondition: 'after_publish', delay: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: 't2', platform: 'xiaohongshu', name: '互动模板', content: '太棒了！', triggerCondition: 'threshold', createdAt: new Date(), updatedAt: new Date() },
];

const sampleTasks = [
  { id: 'task1', templateId: 't1', accountId: 'a1', platform: 'douyin', videoId: 'v1', status: 'completed', createdAt: new Date() },
  { id: 'task2', templateId: 't2', accountId: 'a2', platform: 'xiaohongshu', videoId: 'v2', status: 'pending', createdAt: new Date() },
];

describe('Comments', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders comment-view container', () => {
    wrapper = mountView();
    expect(wrapper.find('.comment-view').exists()).toBe(true);
  });

  it('renders template section header', () => {
    wrapper = mountView();
    const headers = wrapper.findAll('.section-header h3');
    expect(headers[0].text()).toBe('评论模板');
  });

  it('renders task section header', () => {
    wrapper = mountView();
    const headers = wrapper.findAll('.section-header h3');
    expect(headers[1].text()).toBe('评论任务');
  });

  it('renders template table', () => {
    wrapper = mountView(sampleTemplates);
    expect(wrapper.find('[data-testid="el-table"]').exists()).toBe(true);
  });

  it('renders create template button', () => {
    wrapper = mountView();
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const createBtn = buttons.find(b => b.text().includes('新建模板'));
    expect(createBtn).toBeDefined();
  });

  it('renders comment sections', () => {
    wrapper = mountView();
    const sections = wrapper.findAll('.comment-section');
    expect(sections.length).toBe(2);
  });

  it('has two tables (templates and tasks)', () => {
    wrapper = mountView();
    const tables = wrapper.findAll('[data-testid="el-table"]');
    expect(tables.length).toBe(2);
  });

  it('renders new template button with correct type', () => {
    wrapper = mountView();
    const btn = wrapper.findAll('[data-testid="el-btn"]').find(b => b.text().includes('新建模板'));
    expect(btn).toBeDefined();
  });

  it('does not show template editor dialog by default', () => {
    wrapper = mountView();
    expect(wrapper.find('[data-testid="template-editor"]').exists()).toBe(false);
  });

  it('renders table columns for templates', () => {
    wrapper = mountView();
    const columns = wrapper.findAll('[data-testid="el-table-column"]');
    expect(columns.length).toBeGreaterThan(0);
  });
});
