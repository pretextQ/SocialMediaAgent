import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TaskFilterBar from '@/renderer/components/publish/TaskFilterBar.vue';
import { useTaskStore } from '@/renderer/stores/task';

const stubs = {
  'el-select': {
    template: '<div><slot /></div>',
    props: ['modelValue', 'placeholder', 'clearable', 'multiple', 'collapseTags', 'collapseTagsLimit'],
  },
  'el-option': {
    template: '<span />',
    props: ['label', 'value'],
  },
  'el-date-picker': {
    template: '<div data-testid="date-picker" />',
    props: [
      'modelValue', 'type', 'startPlaceholder', 'endPlaceholder', 'rangeSeparator',
      'format', 'valueFormat', 'unlinkPanels',
    ],
  },
  'el-input': {
    template: '<div><slot name="prefix" /></div>',
    props: ['modelValue', 'placeholder', 'clearable'],
  },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    props: ['type'],
    emits: ['click'],
  },
  'el-icon': {
    template: '<span><slot /></span>',
  },
  Search: {
    template: '<span />',
  },
};

describe('TaskFilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets all filters and notifies the task page to return to page one', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useTaskStore();
    store.filter.status = ['failed'];
    store.filter.platform = ['channels'];
    store.filter.planId = 'plan-1';
    store.filter.dateFrom = '2026-06-01';
    store.filter.dateTo = '2026-06-06';
    store.filter.search = '翰字墨迹';
    store.filter.offset = 20;

    const wrapper = mount(TaskFilterBar, {
      props: {
        plans: [{ id: 'plan-1', name: '计划一' }],
      },
      global: {
        plugins: [pinia],
        stubs,
      },
    });

    const resetButton = wrapper.findAll('button').find((button) => button.text() === '重置');
    expect(resetButton).toBeDefined();
    await resetButton!.trigger('click');

    expect(store.filter).toMatchObject({
      status: [],
      platform: [],
      planId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: undefined,
      offset: 0,
    });
    expect(wrapper.emitted('change')).toHaveLength(1);
  });
});
