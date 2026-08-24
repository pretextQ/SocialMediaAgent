import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  installMatrixflowMock,
  removeMatrixflowMock,
} from '../../../mocks/window-matrixflow';
import { useCommentStore } from '@/renderer/stores/comment';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';

let mock: MatrixflowMock;

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    platform: 'douyin',
    name: 'Test Template',
    content: 'Great video!',
    triggerCondition: 'after_publish' as const,
    delay: 60,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    templateId: 'tpl-1',
    accountId: 'acc-1',
    platform: 'douyin',
    videoId: 'vid-1',
    status: 'pending' as const,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('comment store', () => {
  describe('initial state', () => {
    it('starts with empty templates', () => {
      const store = useCommentStore();
      expect(store.templates).toEqual([]);
    });

    it('starts with empty tasks', () => {
      const store = useCommentStore();
      expect(store.tasks).toEqual([]);
    });

    it('starts with loading=false', () => {
      const store = useCommentStore();
      expect(store.loading).toBe(false);
    });
  });

  describe('loadTemplates', () => {
    it('loads templates from IPC and stores them', async () => {
      const templates = [makeTemplate()];
      mock.comment.template.list.mockResolvedValue({
        success: true,
        data: templates,
      });

      const store = useCommentStore();
      await store.loadTemplates();

      expect(store.templates).toEqual(templates);
      expect(mock.comment.template.list).toHaveBeenCalledWith(undefined);
    });

    it('passes platform filter to IPC', async () => {
      mock.comment.template.list.mockResolvedValue({
        success: true,
        data: [],
      });

      const store = useCommentStore();
      await store.loadTemplates('douyin');

      expect(mock.comment.template.list).toHaveBeenCalledWith('douyin');
    });

    it('sets loading during request and clears after', async () => {
      let loadingDuringRequest = false;
      mock.comment.template.list.mockImplementation(async () => {
        loadingDuringRequest = true;
        return { success: true, data: [] };
      });

      const store = useCommentStore();
      expect(store.loading).toBe(false);

      const promise = store.loadTemplates();
      expect(store.loading).toBe(true);
      await promise;

      await promise;
      expect(store.loading).toBe(false);
    });

    it('clears loading even when result is not successful', async () => {
      mock.comment.template.list.mockResolvedValue({
        success: false,
        error: 'IPC error',
      });

      const store = useCommentStore();
      await store.loadTemplates();

      expect(store.loading).toBe(false);
      expect(store.templates).toEqual([]);
    });

    it('clears loading even when IPC throws', async () => {
      mock.comment.template.list.mockRejectedValue(new Error('network'));

      const store = useCommentStore();
      await expect(store.loadTemplates()).rejects.toThrow('network');
      expect(store.loading).toBe(false);
    });

    it('does not update templates when result has no data', async () => {
      mock.comment.template.list.mockResolvedValue({ success: true });

      const store = useCommentStore();
      await store.loadTemplates();

      expect(store.templates).toEqual([]);
    });
  });

  describe('createTemplate', () => {
    it('creates template and appends to list', async () => {
      const newTemplate = makeTemplate();
      const inputData = {
        platform: 'douyin',
        name: 'Test Template',
        content: 'Great video!',
        triggerCondition: 'after_publish' as const,
        delay: 60,
      };

      mock.comment.template.create.mockResolvedValue({
        success: true,
        data: newTemplate,
      });

      const store = useCommentStore();
      const result = await store.createTemplate(inputData);

      expect(result).toEqual(newTemplate);
      expect(store.templates).toHaveLength(1);
      expect(store.templates[0]).toEqual(newTemplate);
      expect(mock.comment.template.create).toHaveBeenCalledWith(inputData);
    });

    it('returns null when IPC result is not successful', async () => {
      mock.comment.template.create.mockResolvedValue({
        success: false,
        error: 'validation failed',
      });

      const store = useCommentStore();
      const result = await store.createTemplate({
        platform: 'douyin',
        name: '',
        content: '',
        triggerCondition: 'after_publish',
      });

      expect(result).toBeNull();
      expect(store.templates).toHaveLength(0);
    });

    it('returns null when result has no data', async () => {
      mock.comment.template.create.mockResolvedValue({ success: true });

      const store = useCommentStore();
      const result = await store.createTemplate({
        platform: 'douyin',
        name: 'Test',
        content: 'Hello',
        triggerCondition: 'after_publish',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    it('updates template in list when found', async () => {
      const original = makeTemplate();
      const updated = makeTemplate({ name: 'Updated', updatedAt: new Date() });

      mock.comment.template.list.mockResolvedValue({
        success: true,
        data: [original],
      });
      mock.comment.template.update.mockResolvedValue({
        success: true,
        data: updated,
      });

      const store = useCommentStore();
      await store.loadTemplates();
      const result = await store.updateTemplate('tpl-1', { name: 'Updated' });

      expect(result).toEqual(updated);
      expect(store.templates[0].name).toBe('Updated');
      expect(mock.comment.template.update).toHaveBeenCalledWith('tpl-1', {
        name: 'Updated',
      });
    });

    it('returns updated data even if id not in local list', async () => {
      const updated = makeTemplate({ id: 'tpl-999' });
      mock.comment.template.update.mockResolvedValue({
        success: true,
        data: updated,
      });

      const store = useCommentStore();
      const result = await store.updateTemplate('tpl-999', {
        name: 'Updated',
      });

      expect(result).toEqual(updated);
      expect(store.templates).toHaveLength(0);
    });

    it('returns null when IPC result is not successful', async () => {
      mock.comment.template.update.mockResolvedValue({
        success: false,
        error: 'not found',
      });

      const store = useCommentStore();
      const result = await store.updateTemplate('tpl-1', { name: 'X' });

      expect(result).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('removes template from list on success', async () => {
      const tpl = makeTemplate();
      mock.comment.template.list.mockResolvedValue({
        success: true,
        data: [tpl],
      });
      mock.comment.template.delete.mockResolvedValue({ success: true });

      const store = useCommentStore();
      await store.loadTemplates();
      expect(store.templates).toHaveLength(1);

      const result = await store.deleteTemplate('tpl-1');
      expect(result).toBe(true);
      expect(store.templates).toHaveLength(0);
      expect(mock.comment.template.delete).toHaveBeenCalledWith('tpl-1');
    });

    it('returns false when IPC result is not successful', async () => {
      mock.comment.template.delete.mockResolvedValue({
        success: false,
        error: 'not found',
      });

      const store = useCommentStore();
      const result = await store.deleteTemplate('tpl-1');

      expect(result).toBe(false);
    });

    it('does not remove template when IPC fails', async () => {
      const tpl = makeTemplate();
      mock.comment.template.list.mockResolvedValue({
        success: true,
        data: [tpl],
      });
      mock.comment.template.delete.mockResolvedValue({ success: false });

      const store = useCommentStore();
      await store.loadTemplates();
      await store.deleteTemplate('tpl-1');

      expect(store.templates).toHaveLength(1);
    });
  });

  describe('loadTasks', () => {
    it('loads tasks from IPC', async () => {
      const tasks = [makeTask()];
      mock.comment.task.list.mockResolvedValue({
        success: true,
        data: tasks,
      });

      const store = useCommentStore();
      await store.loadTasks();

      expect(store.tasks).toEqual(tasks);
      expect(mock.comment.task.list).toHaveBeenCalled();
    });

    it('does not update tasks when result has no data', async () => {
      mock.comment.task.list.mockResolvedValue({ success: true });

      const store = useCommentStore();
      await store.loadTasks();

      expect(store.tasks).toEqual([]);
    });

    it('does not update tasks when result is not successful', async () => {
      mock.comment.task.list.mockResolvedValue({
        success: false,
        error: 'failed',
      });

      const store = useCommentStore();
      await store.loadTasks();

      expect(store.tasks).toEqual([]);
    });
  });

  describe('scheduleComment', () => {
    it('schedules comment and appends task', async () => {
      const task = makeTask();
      mock.comment.schedule.mockResolvedValue({
        success: true,
        data: task,
      });

      const store = useCommentStore();
      const result = await store.scheduleComment(
        'tpl-1',
        'acc-1',
        'vid-1'
      );

      expect(result).toEqual(task);
      expect(store.tasks).toHaveLength(1);
      expect(mock.comment.schedule).toHaveBeenCalledWith(
        'tpl-1',
        'acc-1',
        'vid-1'
      );
    });

    it('returns null when IPC result is not successful', async () => {
      mock.comment.schedule.mockResolvedValue({
        success: false,
        error: 'schedule failed',
      });

      const store = useCommentStore();
      const result = await store.scheduleComment(
        'tpl-1',
        'acc-1',
        'vid-1'
      );

      expect(result).toBeNull();
      expect(store.tasks).toHaveLength(0);
    });

    it('returns null when result has no data', async () => {
      mock.comment.schedule.mockResolvedValue({ success: true });

      const store = useCommentStore();
      const result = await store.scheduleComment(
        'tpl-1',
        'acc-1',
        'vid-1'
      );

      expect(result).toBeNull();
    });
  });

  describe('executeTask', () => {
    it('marks task as completed on success', async () => {
      const task = makeTask();
      mock.comment.task.list.mockResolvedValue({
        success: true,
        data: [task],
      });
      mock.comment.execute.mockResolvedValue({ success: true });

      const store = useCommentStore();
      await store.loadTasks();
      const result = await store.executeTask('task-1');

      expect(result).toBe(true);
      expect(store.tasks[0].status).toBe('completed');
      expect(store.tasks[0].completedAt).toBeInstanceOf(Date);
      expect(mock.comment.execute).toHaveBeenCalledWith('task-1');
    });

    it('returns false when IPC result is not successful', async () => {
      mock.comment.execute.mockResolvedValue({
        success: false,
        error: 'execution failed',
      });

      const store = useCommentStore();
      const result = await store.executeTask('task-1');

      expect(result).toBe(false);
    });

    it('returns true even if task not found locally', async () => {
      mock.comment.execute.mockResolvedValue({ success: true });

      const store = useCommentStore();
      const result = await store.executeTask('nonexistent');

      expect(result).toBe(true);
    });
  });

  describe('error paths', () => {
    it('loadTemplates handles IPC rejection', async () => {
      mock.comment.template.list.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(store.loadTemplates()).rejects.toThrow('IPC failure');
      expect(store.loading).toBe(false);
    });

    it('createTemplate handles IPC rejection', async () => {
      mock.comment.template.create.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(
        store.createTemplate({
          platform: 'douyin',
          name: 'Test',
          content: 'Hello',
          triggerCondition: 'after_publish',
        })
      ).rejects.toThrow('IPC failure');
    });

    it('updateTemplate handles IPC rejection', async () => {
      mock.comment.template.update.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(
        store.updateTemplate('tpl-1', { name: 'X' })
      ).rejects.toThrow('IPC failure');
    });

    it('deleteTemplate handles IPC rejection', async () => {
      mock.comment.template.delete.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(store.deleteTemplate('tpl-1')).rejects.toThrow(
        'IPC failure'
      );
    });

    it('loadTasks handles IPC rejection', async () => {
      mock.comment.task.list.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(store.loadTasks()).rejects.toThrow('IPC failure');
    });

    it('scheduleComment handles IPC rejection', async () => {
      mock.comment.schedule.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(
        store.scheduleComment('tpl-1', 'acc-1', 'vid-1')
      ).rejects.toThrow('IPC failure');
    });

    it('executeTask handles IPC rejection', async () => {
      mock.comment.execute.mockRejectedValue(new Error('IPC failure'));

      const store = useCommentStore();
      await expect(store.executeTask('task-1')).rejects.toThrow(
        'IPC failure'
      );
    });
  });

  describe('window.matrixflow undefined', () => {
    it('loadTemplates throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useCommentStore();
      await expect(store.loadTemplates()).rejects.toThrow();
    });

    it('createTemplate throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useCommentStore();
      await expect(
        store.createTemplate({
          platform: 'douyin',
          name: 'T',
          content: 'C',
          triggerCondition: 'after_publish',
        })
      ).rejects.toThrow();
    });

    it('loadTasks throws when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      const store = useCommentStore();
      await expect(store.loadTasks()).rejects.toThrow();
    });
  });

  describe('template CRUD with platform filtering', () => {
    it('filters templates by platform on load', async () => {
      const douyinTemplates = [makeTemplate({ platform: 'douyin' })];
      const xhsTemplates = [
        makeTemplate({ id: 'tpl-2', platform: 'xiaohongshu' }),
      ];

      mock.comment.template.list
        .mockResolvedValueOnce({ success: true, data: douyinTemplates })
        .mockResolvedValueOnce({ success: true, data: xhsTemplates });

      const store = useCommentStore();
      await store.loadTemplates('douyin');
      expect(store.templates).toEqual(douyinTemplates);
      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].platform).toBe('douyin');

      await store.loadTemplates('xiaohongshu');
      expect(store.templates).toEqual(xhsTemplates);
      expect(store.templates[0].platform).toBe('xiaohongshu');
    });

    it('full CRUD cycle: create, update, delete', async () => {
      const store = useCommentStore();

      const created = makeTemplate();
      mock.comment.template.create.mockResolvedValue({
        success: true,
        data: created,
      });
      await store.createTemplate({
        platform: 'douyin',
        name: 'Test Template',
        content: 'Great video!',
        triggerCondition: 'after_publish',
        delay: 60,
      });
      expect(store.templates).toHaveLength(1);

      const updated = makeTemplate({ name: 'Updated Name' });
      mock.comment.template.update.mockResolvedValue({
        success: true,
        data: updated,
      });
      await store.updateTemplate('tpl-1', { name: 'Updated Name' });
      expect(store.templates[0].name).toBe('Updated Name');

      mock.comment.template.delete.mockResolvedValue({ success: true });
      await store.deleteTemplate('tpl-1');
      expect(store.templates).toHaveLength(0);
    });

    it('handles threshold trigger condition templates', async () => {
      const thresholdTemplate = makeTemplate({
        triggerCondition: 'threshold',
        threshold: { metric: 'views', value: 1000 },
      });
      mock.comment.template.list.mockResolvedValue({
        success: true,
        data: [thresholdTemplate],
      });

      const store = useCommentStore();
      await store.loadTemplates();

      expect(store.templates[0].triggerCondition).toBe('threshold');
      expect(store.templates[0].threshold).toEqual({
        metric: 'views',
        value: 1000,
      });
    });
  });
});
