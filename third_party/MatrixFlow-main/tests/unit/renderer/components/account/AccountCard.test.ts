import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import AccountCard from '@/renderer/components/account/AccountCard.vue';
import type { Account } from '@/renderer/stores/account';

// ── Element Plus stubs ──
const globalStubs = {
  'el-checkbox': {
    template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'change\', modelValue)" />',
    props: ['modelValue'],
    emits: ['change'],
  },
  'el-avatar': {
    template: '<div data-testid="el-avatar"><slot />{{ src ? "" : fallback }}</div>',
    props: ['size', 'src'],
    computed: { fallback() { return '?'; } },
  },
  'el-tag': {
    template: '<span data-testid="el-tag"><slot /></span>',
    props: ['type', 'size', 'effect', 'round'],
  },
  'el-icon': {
    template: '<span class="el-icon"><slot /></span>',
    props: ['size'],
  },
  'el-button': {
    template: '<button data-testid="el-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'text', 'disabled'],
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

function createAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    platform: 'douyin',
    nickname: '测试账号',
    status: 'online',
    cookieValid: true,
    lastLogin: '2026-05-19',
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function mountCard(overrides: Partial<Account> = {}, selected = false) {
  const account = createAccount(overrides);
  return mount(AccountCard, {
    props: {
      account,
      selected,
      groups: [
        { id: 'grp-1', name: '默认分组' },
        { id: 'grp-2', name: '其他分组' },
      ],
    },
    global: { stubs: globalStubs },
  });
}

describe('AccountCard', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── Basic rendering ──

  it('renders account nickname', () => {
    wrapper = mountCard({ nickname: '我的抖音号' });
    expect(wrapper.find('.account-card__name').text()).toBe('我的抖音号');
  });

  it('renders platform label for known platforms', () => {
    const cases: Array<[string, string]> = [
      ['douyin', '抖音'],
      ['xiaohongshu', '小红书'],
      ['channels', '视频号'],
      ['kuaishou', '快手'],
      ['bilibili', 'B站'],
    ];
    for (const [platform, label] of cases) {
      wrapper = mountCard({ platform });
      const tag = wrapper.find('.account-card__platform');
      expect(tag.text()).toBe(label);
      wrapper.unmount();
    }
  });

  it('renders raw platform string for unknown platforms', () => {
    wrapper = mountCard({ platform: 'tiktok' });
    expect(wrapper.find('.account-card__platform').text()).toBe('tiktok');
  });

  it('renders status label correctly', () => {
    const cases: Array<[Account['status'], string]> = [
      ['online', '在线'],
      ['offline', '离线'],
      ['expired', '已过期'],
    ];
    for (const [status, label] of cases) {
      wrapper = mountCard({ status });
      expect(wrapper.find('.account-card__status-text').text()).toBe(label);
      wrapper.unmount();
    }
  });

  it('renders cookie valid tag', () => {
    wrapper = mountCard({ cookieValid: true });
    const cookieTag = wrapper.findAll('[data-testid="el-tag"]').find(t => t.text().includes('Cookie有效'));
    expect(cookieTag).toBeDefined();
  });

  it('renders cookie invalid tag', () => {
    wrapper = mountCard({ cookieValid: false });
    const cookieTag = wrapper.findAll('[data-testid="el-tag"]').find(t => t.text().includes('Cookie失效'));
    expect(cookieTag).toBeDefined();
  });

  // ── Conditional rendering ──

  it('shows group name when account has groupId', () => {
    wrapper = mountCard({ groupId: 'grp-1' });
    expect(wrapper.find('.account-card__group').exists()).toBe(true);
    expect(wrapper.find('.account-card__group').text()).toContain('默认分组');
  });

  it('hides group section when account has no groupId', () => {
    wrapper = mountCard();
    expect(wrapper.find('.account-card__group').exists()).toBe(false);
  });

  it('shows fingerprint binding tag when fingerprintId is set', () => {
    wrapper = mountCard({ fingerprintId: 'fp-1' });
    const bindings = wrapper.find('.account-card__bindings');
    expect(bindings.exists()).toBe(true);
    expect(bindings.text()).toContain('指纹已绑定');
  });

  it('shows proxy binding tag when proxyId is set', () => {
    wrapper = mountCard({ proxyId: 'px-1' });
    const bindings = wrapper.find('.account-card__bindings');
    expect(bindings.exists()).toBe(true);
    expect(bindings.text()).toContain('代理已绑定');
  });

  it('hides bindings section when no bindings', () => {
    wrapper = mountCard();
    expect(wrapper.find('.account-card__bindings').exists()).toBe(false);
  });

  // ── CSS classes ──

  it('applies expired class when status is expired', () => {
    wrapper = mountCard({ status: 'expired' });
    expect(wrapper.find('.account-card').classes()).toContain('account-card--expired');
  });

  it('applies selected class when selected prop is true', () => {
    wrapper = mountCard({}, true);
    expect(wrapper.find('.account-card').classes()).toContain('account-card--selected');
  });

  it('does not apply selected class when selected prop is false', () => {
    wrapper = mountCard({}, false);
    expect(wrapper.find('.account-card').classes()).not.toContain('account-card--selected');
  });

  // ── Events ──

  it('emits toggleSelect on card click', async () => {
    wrapper = mountCard();
    await wrapper.find('.account-card').trigger('click');
    expect(wrapper.emitted('toggleSelect')).toBeTruthy();
    expect(wrapper.emitted('toggleSelect')![0]).toEqual(['acc-1']);
  });

  it('emits detail when detail button clicked', async () => {
    wrapper = mountCard();
    const actions = wrapper.find('.account-card__actions');
    const buttons = actions.findAll('[data-testid="el-btn"]');
    await buttons[0].trigger('click');
    expect(wrapper.emitted('detail')).toBeTruthy();
    expect(wrapper.emitted('detail')![0]).toEqual(['acc-1']);
  });

  it('renders lastLogin time', () => {
    wrapper = mountCard({ lastLogin: '2026-05-19 10:00' });
    expect(wrapper.find('.account-card__time').text()).toBe('2026-05-19 10:00');
  });

  it('renders "未登录" when lastLogin is empty', () => {
    wrapper = mountCard({ lastLogin: undefined });
    expect(wrapper.find('.account-card__time').text()).toBe('未登录');
  });
});
