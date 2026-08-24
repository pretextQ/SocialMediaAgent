import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ContentCard from '@/renderer/components/content/ContentCard.vue';
import type { ContentItem } from '@/renderer/stores/content';

const globalStubs = {
  'el-checkbox': {
    template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'change\')" />',
    props: ['modelValue'],
    emits: ['change'],
  },
  'el-icon': {
    template: '<span class="el-icon"><slot /></span>',
    props: ['size'],
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size', 'effect', 'round', 'closable'],
    emits: ['close'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'text'],
    emits: ['click'],
  },
  'el-tooltip': {
    template: '<span><slot /></span>',
    props: ['content', 'placement'],
  },
  'el-popconfirm': {
    template: '<div data-testid="el-popconfirm"><slot name="reference" /><slot /></div>',
    props: ['title'],
    emits: ['confirm'],
  },
};

function createContent(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'cnt-1',
    title: '测试视频标题',
    description: '这是一段测试描述',
    type: 'video',
    thumbnail: 'https://example.com/thumb.jpg',
    duration: '03:25',
    status: 'ready',
    tags: ['测试', 'vlog', '日常'],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mountCard(overrides: Partial<ContentItem> = {}, selected = false) {
  return mount(ContentCard, {
    props: { content: createContent(overrides), selected },
    global: { stubs: globalStubs },
  });
}

describe('ContentCard', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── Basic rendering ──

  it('renders content title', () => {
    wrapper = mountCard({ title: '我的视频' });
    expect(wrapper.find('.content-card__title').text()).toBe('我的视频');
  });

  it('renders description when present', () => {
    wrapper = mountCard({ description: '详细描述' });
    expect(wrapper.find('.content-card__desc').exists()).toBe(true);
    expect(wrapper.find('.content-card__desc').text()).toBe('详细描述');
  });

  it('hides description when not present', () => {
    wrapper = mountCard({ description: undefined });
    expect(wrapper.find('.content-card__desc').exists()).toBe(false);
  });

  it('renders thumbnail image when provided', () => {
    wrapper = mountCard({ thumbnail: 'https://example.com/img.jpg' });
    expect(wrapper.find('.content-card__image').exists()).toBe(true);
  });

  it('renders placeholder when no thumbnail', () => {
    wrapper = mountCard({ thumbnail: undefined });
    expect(wrapper.find('.content-card__placeholder').exists()).toBe(true);
  });

  it('renders duration when present', () => {
    wrapper = mountCard({ duration: '05:30' });
    expect(wrapper.find('.content-card__duration').text()).toBe('05:30');
  });

  it('hides duration when not present', () => {
    wrapper = mountCard({ duration: undefined });
    expect(wrapper.find('.content-card__duration').exists()).toBe(false);
  });

  // ── Type badge ──

  it('renders type badge for video', () => {
    wrapper = mountCard({ type: 'video' });
    expect(wrapper.find('.content-card__type-badge').text()).toBe('视频');
  });

  it('renders type badge for image', () => {
    wrapper = mountCard({ type: 'image' });
    expect(wrapper.find('.content-card__type-badge').text()).toBe('图片');
  });

  it('renders type badge for article', () => {
    wrapper = mountCard({ type: 'article' });
    expect(wrapper.find('.content-card__type-badge').text()).toBe('文章');
  });

  // ── Status tag ──

  it('renders correct status label for draft', () => {
    wrapper = mountCard({ status: 'draft' });
    const tags = wrapper.findAll('[data-testid="el-tag"]');
    const statusTag = tags.find(t => t.text() === '草稿');
    expect(statusTag).toBeDefined();
  });

  it('renders correct status label for ready', () => {
    wrapper = mountCard({ status: 'ready' });
    const tags = wrapper.findAll('[data-testid="el-tag"]');
    const statusTag = tags.find(t => t.text() === '待发布');
    expect(statusTag).toBeDefined();
  });

  it('renders correct status label for published', () => {
    wrapper = mountCard({ status: 'published' });
    const tags = wrapper.findAll('[data-testid="el-tag"]');
    const statusTag = tags.find(t => t.text() === '已发布');
    expect(statusTag).toBeDefined();
  });

  // ── Tags display ──

  it('renders up to 3 tags', () => {
    wrapper = mountCard({ tags: ['tag1', 'tag2', 'tag3'] });
    const tagEls = wrapper.findAll('.content-card__tag');
    expect(tagEls.length).toBe(3);
  });

  it('shows "+N" indicator when more than 3 tags', () => {
    wrapper = mountCard({ tags: ['a', 'b', 'c', 'd', 'e'] });
    expect(wrapper.find('.content-card__tag-more').text()).toBe('+2');
  });

  it('does not show tag section when tags array is empty', () => {
    wrapper = mountCard({ tags: [] });
    expect(wrapper.find('.content-card__tags').exists()).toBe(false);
  });

  // ── Date formatting ──

  it('shows "刚刚" for content created less than 1 minute ago', () => {
    wrapper = mountCard({ createdAt: new Date().toISOString() });
    expect(wrapper.find('.content-card__date').text()).toBe('刚刚');
  });

  it('shows minutes ago for recent content', () => {
    wrapper = mountCard({ createdAt: new Date(Date.now() - 5 * 60000).toISOString() });
    expect(wrapper.find('.content-card__date').text()).toContain('分钟前');
  });

  it('shows hours ago for content from today', () => {
    wrapper = mountCard({ createdAt: new Date(Date.now() - 2 * 3600000).toISOString() });
    expect(wrapper.find('.content-card__date').text()).toContain('小时前');
  });

  // ── CSS classes ──

  it('applies selected class when selected', () => {
    wrapper = mountCard({}, true);
    expect(wrapper.find('.content-card').classes()).toContain('content-card--selected');
  });

  it('applies published class when status is published', () => {
    wrapper = mountCard({ status: 'published' });
    expect(wrapper.find('.content-card').classes()).toContain('content-card--published');
  });

  // ── Events ──

  it('emits select on card click', async () => {
    wrapper = mountCard();
    await wrapper.find('.content-card').trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['cnt-1']);
  });

  it('emits edit when edit button clicked', async () => {
    wrapper = mountCard();
    const actions = wrapper.find('.content-card__actions');
    const buttons = actions.findAll('[data-testid="el-btn"]');
    await buttons[0].trigger('click');
    expect(wrapper.emitted('edit')).toBeTruthy();
  });

  it('emits publish when publish button clicked on ready content', async () => {
    wrapper = mountCard({ status: 'ready' });
    const actions = wrapper.find('.content-card__actions');
    const buttons = actions.findAll('[data-testid="el-btn"]');
    // buttons: [edit, publish, delete]
    await buttons[1].trigger('click');
    expect(wrapper.emitted('publish')).toBeTruthy();
  });

  it('shows view button instead of publish when status is published', async () => {
    wrapper = mountCard({ status: 'published' });
    const actions = wrapper.find('.content-card__actions');
    const buttons = actions.findAll('[data-testid="el-btn"]');
    await buttons[1].trigger('click');
    expect(wrapper.emitted('view')).toBeTruthy();
    expect(wrapper.emitted('publish')).toBeFalsy();
  });
});
