import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Sidebar from '@/renderer/components/Sidebar.vue';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';

const mockPush = vi.fn();
const mockRoute = { path: '/accounts', params: {}, query: {}, meta: {} };

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
  props: ['size'],
};

function mountSidebar() {
  return mount(Sidebar, {
    global: {
      plugins: [
        ElementPlus,
        createTestingPinia({ createSpy: vi.fn }),
      ],
      stubs: {
        'el-icon': ElIconStub,
        'router-link': {
          name: 'RouterLink',
          props: ['to'],
          template: '<a class="router-link-stub"><slot /></a>',
        },
      },
    },
  });
}

describe('Sidebar', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.path = '/accounts';
  });

  it('renders 7 navigation items', () => {
    wrapper = mountSidebar();
    const items = wrapper.findAll('.sidebar__item');
    expect(items.length).toBe(7);
  });

  it('renders all expected menu labels', () => {
    wrapper = mountSidebar();
    const labels = wrapper.findAll('.sidebar__label');
    const labelTexts = labels.map((l) => l.text());
    expect(labelTexts).toEqual([
      '账号管理',
      '内容库',
      '发布管理',
      '任务管理',
      '分组管理',
      '数据中心',
      '设置',
    ]);
  });

  it('highlights active route item with --active class', () => {
    mockRoute.path = '/publish';
    wrapper = mountSidebar();
    const items = wrapper.findAll('.sidebar__item');
    const publishItem = items.find((item) => item.text().includes('发布管理'));
    expect(publishItem).toBeDefined();
    expect(publishItem!.classes()).toContain('sidebar__item--active');
  });

  it('only highlights one item as active', () => {
    mockRoute.path = '/accounts';
    wrapper = mountSidebar();
    const items = wrapper.findAll('.sidebar__item');
    const activeItems = items.filter((item) => item.classes().includes('sidebar__item--active'));
    expect(activeItems.length).toBe(1);
    expect(activeItems[0].text()).toContain('账号管理');
  });

  it('renders brand logo "M"', () => {
    wrapper = mountSidebar();
    expect(wrapper.find('.sidebar__logo').text()).toBe('M');
  });

  it('renders brand title "MatrixFlow" when not collapsed', () => {
    wrapper = mountSidebar();
    expect(wrapper.find('.sidebar__title').text()).toBe('MatrixFlow');
  });

  it('toggles collapsed state when toggle button is clicked', async () => {
    wrapper = mountSidebar();
    expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--collapsed');

    await wrapper.find('.sidebar__toggle').trigger('click');
    await nextTick();
    expect(wrapper.find('.sidebar').classes()).toContain('sidebar--collapsed');

    await wrapper.find('.sidebar__toggle').trigger('click');
    await nextTick();
    expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--collapsed');
  });

  it('hides title text when collapsed', async () => {
    wrapper = mountSidebar();
    expect(wrapper.find('.sidebar__title').exists()).toBe(true);

    await wrapper.find('.sidebar__toggle').trigger('click');
    await nextTick();
    expect(wrapper.find('.sidebar__title').exists()).toBe(false);
  });

  it('hides label text when collapsed', async () => {
    wrapper = mountSidebar();
    expect(wrapper.findAll('.sidebar__label').length).toBe(7);

    await wrapper.find('.sidebar__toggle').trigger('click');
    await nextTick();
    expect(wrapper.findAll('.sidebar__label').length).toBe(0);
  });
});
