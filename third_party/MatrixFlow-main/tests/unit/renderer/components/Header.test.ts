import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import Header from '@/renderer/components/Header.vue';
import ElementPlus from 'element-plus';

const mockPush = vi.fn();
const mockRoute = { path: '/accounts', params: {}, query: {}, meta: { title: '账号管理' } };

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
  props: ['size'],
};

function mountHeader(initialTasks: unknown[] = []) {
  return mount(Header, {
    global: {
      plugins: [
        ElementPlus,
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            task: {
              tasks: initialTasks,
              loading: false,
            },
          },
        }),
      ],
      stubs: {
        'el-icon': ElIconStub,
        'el-badge': {
          name: 'ElBadge',
          template: '<span class="el-badge-stub"><slot /></span>',
          props: ['value', 'hidden', 'max'],
        },
        'el-button': {
          name: 'ElButton',
          template: '<button @click="$emit(\'click\')"><slot /></button>',
          props: ['text'],
          emits: ['click'],
        },
        'el-divider': {
          name: 'ElDivider',
          template: '<div class="el-divider-stub" />',
          props: ['direction'],
        },
        'el-avatar': {
          name: 'ElAvatar',
          template: '<span class="el-avatar-stub"><slot /></span>',
          props: ['size'],
        },
      },
    },
  });
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.path = '/accounts';
    mockRoute.meta = { title: '账号管理' };
  });

  it('renders title from route meta', () => {
    const wrapper = mountHeader();
    expect(wrapper.find('.header__title').text()).toBe('账号管理');
  });

  it('falls back to "MatrixFlow" when route has no meta.title', () => {
    mockRoute.meta = {};
    const wrapper = mountHeader();
    expect(wrapper.find('.header__title').text()).toBe('MatrixFlow');
  });

  it('renders username "管理员"', () => {
    const wrapper = mountHeader();
    expect(wrapper.find('.header__username').text()).toBe('管理员');
  });

  it('renders user avatar section', () => {
    const wrapper = mountHeader();
    expect(wrapper.find('.header__avatar').exists()).toBe(true);
    expect(wrapper.find('.header__user').exists()).toBe(true);
  });

  it('renders task button', () => {
    const wrapper = mountHeader();
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
  });

  it('renders header with correct CSS class', () => {
    const wrapper = mountHeader();
    expect(wrapper.find('.header').exists()).toBe(true);
  });
});
