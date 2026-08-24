import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import EditPublishDialog from '@/renderer/components/publish/EditPublishDialog.vue';
import type { PublishTask } from '@/renderer/stores/publish';

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}));

const globalStubs = {
  'el-dialog': {
    template: '<div data-testid="el-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width', 'destroyOnClose'],
    emits: ['update:modelValue'],
  },
  'el-descriptions': { template: '<dl data-testid="el-descriptions"><slot /></dl>', props: ['column', 'border'] },
  'el-descriptions-item': { template: '<dt><slot /></dt>', props: ['label'] },
  'el-tag': { template: '<span data-testid="el-tag"><slot /></span>', props: ['type', 'size'] },
  'el-form': { template: '<form data-testid="el-form"><slot /></form>', props: ['labelWidth'] },
  'el-form-item': { template: '<div><slot /></div>', props: ['label'] },
  'el-date-picker': {
    template: '<input data-testid="el-date-picker" type="datetime" />',
    props: ['modelValue', 'type', 'placeholder', 'disabledDate'],
    emits: ['update:modelValue'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'loading'],
    emits: ['click'],
  },
};

const mockTask: PublishTask = {
  id: 'task-1',
  contentId: 'cnt-1',
  contentTitle: '测试内容标题',
  groupId: 'grp-1',
  platform: 'douyin',
  accountId: 'acc-1',
  accountName: '测试账号',
  publishMode: 'client',
  status: 'scheduled',
  scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  createdAt: '2026-05-19T10:00:00Z',
  updatedAt: '2026-05-19T10:00:00Z',
};

function mountDialog(modelValue = true, task: PublishTask | null = mockTask) {
  return mount(EditPublishDialog, {
    props: { modelValue, task },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: globalStubs,
    },
  });
}

describe('EditPublishDialog', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    wrapper?.unmount();
  });

  it('renders dialog when modelValue is true and task exists', () => {
    wrapper = mountDialog(true);
    expect(wrapper.find('[data-testid="el-dialog"]').exists()).toBe(true);
  });

  it('hides dialog when modelValue is false', () => {
    wrapper = mountDialog(false);
    expect(wrapper.find('[data-testid="el-dialog"]').exists()).toBe(false);
  });

  it('displays task content title', () => {
    wrapper = mountDialog(true);
    expect(wrapper.text()).toContain('测试内容标题');
  });

  it('displays task platform', () => {
    wrapper = mountDialog(true);
    expect(wrapper.text()).toContain('douyin');
  });

  it('displays status tag', () => {
    wrapper = mountDialog(true);
    const tags = wrapper.findAll('[data-testid="el-tag"]');
    const statusTag = tags.find(t => t.text() === '已排期');
    expect(statusTag).toBeDefined();
  });

  it('displays publish mode tag', () => {
    wrapper = mountDialog(true);
    const tags = wrapper.findAll('[data-testid="el-tag"]');
    const modeTag = tags.find(t => t.text() === '客户端直发');
    expect(modeTag).toBeDefined();
  });

  it('renders date picker for scheduled time', () => {
    wrapper = mountDialog(true);
    expect(wrapper.find('[data-testid="el-date-picker"]').exists()).toBe(true);
  });

  it('renders footer with delete, cancel, and save buttons', () => {
    wrapper = mountDialog(true);
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const texts = buttons.map(b => b.text());
    expect(texts).toContain('删除任务');
    expect(texts).toContain('取消');
    expect(texts).toContain('保存');
  });

  it('emits update:modelValue false when cancel clicked', async () => {
    wrapper = mountDialog(true);
    const buttons = wrapper.findAll('[data-testid="el-btn"]');
    const cancelBtn = buttons.find(b => b.text() === '取消');
    await cancelBtn!.trigger('click');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false]);
  });

  it('renders correct status labels for different statuses', () => {
    const cases: Array<[PublishTask['status'], string]> = [
      ['pending', '等待中'],
      ['scheduled', '已排期'],
      ['running', '执行中'],
      ['completed', '已完成'],
      ['failed', '失败'],
      ['cancelled', '已取消'],
    ];
    for (const [status, label] of cases) {
      const task = { ...mockTask, status };
      wrapper = mountDialog(true, task);
      const tags = wrapper.findAll('[data-testid="el-tag"]');
      const statusTag = tags.find(t => t.text() === label);
      expect(statusTag).toBeDefined();
      wrapper.unmount();
    }
  });

  it('renders server mode tag for server publish mode', () => {
    const task = { ...mockTask, publishMode: 'server' as const };
    wrapper = mountDialog(true, task);
    const tags = wrapper.findAll('[data-testid="el-tag"]');
    const modeTag = tags.find(t => t.text() === '服务端发布');
    expect(modeTag).toBeDefined();
  });
});
