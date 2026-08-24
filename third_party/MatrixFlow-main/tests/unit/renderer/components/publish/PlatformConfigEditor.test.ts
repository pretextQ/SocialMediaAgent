import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import PlatformConfigEditor from '@/renderer/components/publish/PlatformConfigEditor.vue';
import type { Account } from '@/renderer/stores/account';

const account: Account = {
  id: 'channels-account',
  platform: 'channels',
  nickname: '视频号账号',
  status: 'online',
  cookieValid: true,
  createdAt: '2026-06-06T00:00:00.000Z',
};

function mountEditor() {
  return mount(PlatformConfigEditor, {
    props: {
      account,
      platformConfig: {},
      commonConfig: {
        title: '',
        description: '',
        tags: [],
        scheduleMode: 'immediate',
      },
    },
    global: {
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
      },
    },
  });
}

describe('PlatformConfigEditor', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    wrapper?.unmount();
  });

  it('中文输入法组合期间不提交拼音中间态，候选词确认后再更新标题', async () => {
    wrapper = mountEditor();
    const titleInput = wrapper.get<HTMLInputElement>('input[placeholder="输入视频号标题"]');

    await titleInput.trigger('compositionstart');
    titleInput.element.value = 'zhi';
    titleInput.element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: 'i',
      inputType: 'insertCompositionText',
      isComposing: true,
    }));

    expect(wrapper.emitted('update:platform-config')).toBeUndefined();

    titleInput.element.value = '知行合一测试';
    titleInput.element.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: '知行合一测试',
    }));

    const updates = wrapper.emitted('update:platform-config');
    expect(updates).toHaveLength(1);
    expect(updates?.[0]?.[0]).toMatchObject({
      title: '知行合一测试',
      location: '',
    });
  });

  it('视频号地点为空时明确提示发布会选择不显示位置', () => {
    wrapper = mountEditor();

    expect(wrapper.text()).toContain('选择位置');
    expect(wrapper.text()).toContain('留空时自动选择“不显示位置”');
    expect(wrapper.get<HTMLInputElement>('input[placeholder="输入地点名称，留空则不显示位置"]').element.value).toBe('');
  });

  it('勾选视频号原创声明时同步发布链使用的 declaration 字段', async () => {
    wrapper = mountEditor();
    const originalCheckbox = wrapper.get<HTMLInputElement>('input[type="checkbox"]');

    await originalCheckbox.setValue(true);

    const updates = wrapper.emitted('update:platform-config');
    expect(updates?.at(-1)?.[0]).toMatchObject({
      isOriginal: true,
      declaration: 'original',
    });

    await originalCheckbox.setValue(false);

    expect(wrapper.emitted('update:platform-config')?.at(-1)?.[0]).toMatchObject({
      isOriginal: false,
      declaration: '',
    });
  });
});
