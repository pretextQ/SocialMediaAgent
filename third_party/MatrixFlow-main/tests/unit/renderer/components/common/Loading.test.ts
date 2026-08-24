import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Loading from '@/renderer/components/common/Loading.vue';
import ElementPlus from 'element-plus';

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
  props: ['size'],
};

function mountLoading(props: Record<string, unknown> = {}) {
  return mount(Loading, {
    props,
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-icon': ElIconStub,
      },
    },
  });
}

describe('Loading', () => {
  it('renders default text "加载中..." when no text prop provided', () => {
    const wrapper = mountLoading();
    expect(wrapper.find('.loading__text').text()).toBe('加载中...');
  });

  it('renders custom text from text prop', () => {
    const wrapper = mountLoading({ text: '正在获取数据...' });
    expect(wrapper.find('.loading__text').text()).toBe('正在获取数据...');
  });

  it('renders loading icon element', () => {
    const wrapper = mountLoading();
    expect(wrapper.find('.loading__icon').exists()).toBe(true);
  });

  it('has correct CSS class "loading"', () => {
    const wrapper = mountLoading();
    expect(wrapper.find('.loading').exists()).toBe(true);
  });

  it('icon stub receives size prop 32', () => {
    const wrapper = mountLoading();
    const icon = wrapper.findComponent({ name: 'ElIcon' });
    expect(icon.props('size')).toBe(32);
  });
});
