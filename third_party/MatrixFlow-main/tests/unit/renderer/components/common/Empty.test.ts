import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Empty from '@/renderer/components/common/Empty.vue';
import ElementPlus from 'element-plus';

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
  props: ['size'],
};

function mountEmpty(props: Record<string, unknown> = {}) {
  return mount(Empty, {
    props,
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-icon': ElIconStub,
        'el-button': {
          name: 'ElButton',
          template: '<button :class="[type ? \'el-button--\' + type : \'\']" @click="$emit(\'click\')"><slot /></button>',
          props: ['type'],
          emits: ['click'],
        },
      },
    },
  });
}

describe('Empty', () => {
  it('renders default text "暂无数据" when no text prop provided', () => {
    const wrapper = mountEmpty();
    expect(wrapper.find('.empty__text').text()).toBe('暂无数据');
  });

  it('renders custom text from text prop', () => {
    const wrapper = mountEmpty({ text: '没有找到账号' });
    expect(wrapper.find('.empty__text').text()).toBe('没有找到账号');
  });

  it('renders icon element', () => {
    const wrapper = mountEmpty();
    expect(wrapper.find('.empty__icon').exists()).toBe(true);
  });

  it('does not render action button when actionLabel is not provided', () => {
    const wrapper = mountEmpty();
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('renders action button with actionLabel text', () => {
    const wrapper = mountEmpty({ actionLabel: '添加账号' });
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe('添加账号');
  });

  it('emits "action" when action button is clicked', async () => {
    const wrapper = mountEmpty({ actionLabel: '创建内容' });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('action')).toBeTruthy();
    expect(wrapper.emitted('action')!.length).toBe(1);
  });

  it('has correct CSS class "empty"', () => {
    const wrapper = mountEmpty();
    expect(wrapper.find('.empty').exists()).toBe(true);
  });
});
