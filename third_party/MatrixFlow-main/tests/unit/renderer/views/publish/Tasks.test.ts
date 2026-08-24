import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import Tasks from '@/renderer/views/publish/Tasks.vue';
import { createMatrixflowMock } from '../../../../mocks/window-matrixflow';
import type { MatrixflowMock } from '../../../../mocks/window-matrixflow';
import type { Task } from '@/renderer/stores/task';

vi.mock('element-plus', () => ({
  ElMessage: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}));

function makeTasks(limit: number, offset: number): Task[] {
  return Array.from({ length: limit }, (_, index) => {
    const number = offset + index + 1;
    return {
      id: `task-${number}`,
      type: 'publish',
      accountId: `account-${number}`,
      accountName: `账号${number}`,
      contentId: `content-${number}`,
      contentTitle: `内容${number}`,
      title: `内容${number}`,
      platform: 'channels',
      status: 'completed',
      progress: 100,
      retryCount: 0,
      createdAt: `2026-06-${String((number % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      updatedAt: `2026-06-${String((number % 28) + 1).padStart(2, '0')}T10:01:00Z`,
    };
  });
}

const stubs = {
  TaskFilterBar: {
    template: '<button data-testid="filter-change" @click="$emit(\'change\')">筛选</button>',
    emits: ['change'],
  },
  TaskTable: {
    template: '<div data-testid="task-table">{{ groupTotal }}</div>',
    props: ['groupTotal'],
  },
  TaskDetailDrawer: {
    template: '<div />',
    props: ['modelValue', 'group'],
  },
  TaskBatchBar: {
    template: '<div />',
  },
  'el-pagination': {
    template: `
      <div data-testid="pagination">
        <button data-testid="page-2" @click="$emit('current-change', 2)">第2页</button>
        <button data-testid="size-10" @click="$emit('size-change', 10)">每页10条</button>
      </div>
    `,
    props: ['currentPage', 'pageSize', 'total', 'pageSizes', 'layout', 'background', 'small'],
    emits: ['current-change', 'size-change'],
  },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size'],
    emits: ['click'],
  },
  'el-icon': {
    template: '<span><slot /></span>',
    props: ['size'],
  },
  'el-empty': {
    template: '<div><slot /></div>',
    props: ['description'],
  },
  RouterLink: {
    template: '<a><slot /></a>',
    props: ['to'],
  },
};

describe('publish/Tasks pagination', () => {
  let mock: MatrixflowMock;

  beforeEach(() => {
    window.localStorage.clear();
    mock = createMatrixflowMock();
    Object.defineProperty(window, 'matrixflow', {
      configurable: true,
      value: mock,
    });
    mock.publish.listTasks.mockImplementation(async (filter) => {
      const limit = filter?.limit ?? 20;
      const offset = filter?.offset ?? 0;
      return {
        items: makeTasks(limit, offset),
        total: 40,
        taskTotal: 40,
        statusBreakdown: { completed: 40 },
      };
    });
  });

  afterEach(() => {
    delete (window as Window & { matrixflow?: unknown }).matrixflow;
  });

  async function mountView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/publish/tasks', component: Tasks }],
    });
    await router.push('/publish/tasks');
    await router.isReady();

    const wrapper = mount(Tasks, {
      global: {
        plugins: [createPinia(), router],
        stubs,
      },
    });
    await flushPromises();
    return wrapper;
  }

  it('uses the selected page size and resets pagination when filters change', async () => {
    const wrapper = await mountView();

    expect(mock.publish.listTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      groupByContent: true,
      limit: 20,
      offset: 0,
    }));

    (wrapper.get('[data-testid="size-10"]').element as HTMLButtonElement).click();
    await flushPromises();
    expect(mock.publish.listTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      groupByContent: true,
      limit: 10,
      offset: 0,
    }));
    expect(window.localStorage.getItem('matrixflow.publishTasks.pageSize')).toBe('10');

    (wrapper.get('[data-testid="page-2"]').element as HTMLButtonElement).click();
    await flushPromises();
    expect(mock.publish.listTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      limit: 10,
      offset: 10,
    }));

    (wrapper.get('[data-testid="filter-change"]').element as HTMLButtonElement).click();
    await flushPromises();
    expect(mock.publish.listTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      limit: 10,
      offset: 0,
    }));
  });

  it('shows only the grouped content count in pagination and has no export action', async () => {
    mock.publish.listTasks.mockResolvedValue({
      items: makeTasks(9, 0),
      total: 9,
      taskTotal: 40,
      statusBreakdown: { completed: 40 },
    });

    const wrapper = await mountView();

    expect(wrapper.get('.page-tasks__pagination-info').text()).toBe('共 9 个发布内容');
    expect(wrapper.get('[data-testid="task-table"]').text()).toBe('9');
    expect(wrapper.text()).not.toContain('导出');
  });
});
