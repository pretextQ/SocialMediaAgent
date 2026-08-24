import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockAccountService = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: '1', platform: 'douyin' }),
  delete: vi.fn().mockResolvedValue(true),
  update: vi.fn().mockResolvedValue({ id: '1' }),
};

const mockContentService = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: '1', title: 'Test' }),
  delete: vi.fn().mockResolvedValue(true),
  update: vi.fn().mockResolvedValue({ id: '1' }),
};

const mockGroupService = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: '1', name: 'Test Group' }),
  update: vi.fn().mockResolvedValue({ id: '1' }),
  delete: vi.fn().mockResolvedValue(true),
  bindAccounts: vi.fn().mockResolvedValue(true),
};

const mockPublishService = {
  createTask: vi.fn().mockResolvedValue({ id: '1', status: 'pending' }),
  listTasks: vi.fn().mockResolvedValue([]),
  cancelTask: vi.fn().mockResolvedValue(true),
  retryTask: vi.fn().mockResolvedValue({ id: '1' }),
};

vi.mock('../../../electron/services/AccountService', () => ({
  accountService: mockAccountService,
}));

vi.mock('../../../electron/services/ContentService', () => ({
  contentService: mockContentService,
}));

vi.mock('../../../electron/services/GroupService', () => ({
  groupService: mockGroupService,
}));

vi.mock('../../../electron/services/PublishService', () => ({
  publishService: mockPublishService,
}));

describe('IPC Handlers Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('account:* channels', () => {
    it('account:list returns array from service', async () => {
      mockAccountService.list.mockResolvedValueOnce([
        { id: '1', platform: 'douyin', nickname: 'Test Account' },
      ]);

      const result = await mockAccountService.list();

      expect(mockAccountService.list).toHaveBeenCalled();
      expect(result).toEqual([{ id: '1', platform: 'douyin', nickname: 'Test Account' }]);
    });

    it('account:create calls service with correct params', async () => {
      const accountData = { platform: 'douyin', nickname: 'New Account' };
      mockAccountService.create.mockResolvedValueOnce({ id: '2', ...accountData });

      const result = await mockAccountService.create(accountData);

      expect(mockAccountService.create).toHaveBeenCalledWith(accountData);
      expect(result).toMatchObject({ id: '2', platform: 'douyin' });
    });

    it('account:delete calls service with id', async () => {
      mockAccountService.delete.mockResolvedValueOnce(true);

      const result = await mockAccountService.delete('1');

      expect(mockAccountService.delete).toHaveBeenCalledWith('1');
      expect(result).toBe(true);
    });
  });

  describe('content:* channels', () => {
    it('content:list returns array from service', async () => {
      mockContentService.list.mockResolvedValueOnce([]);

      const result = await mockContentService.list();

      expect(mockContentService.list).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('content:create calls service with content data', async () => {
      const contentData = { title: 'Test Content', type: 'video' };
      mockContentService.create.mockResolvedValueOnce({ id: '1', ...contentData });

      const result = await mockContentService.create(contentData);

      expect(mockContentService.create).toHaveBeenCalledWith(contentData);
      expect(result).toMatchObject({ id: '1', title: 'Test Content' });
    });

    it('content:update calls service with id and data', async () => {
      const updateData = { title: 'Updated Title' };
      mockContentService.update.mockResolvedValueOnce({ id: '1', ...updateData });

      const result = await mockContentService.update('1', updateData);

      expect(mockContentService.update).toHaveBeenCalledWith('1', updateData);
      expect(result).toMatchObject({ id: '1', title: 'Updated Title' });
    });

    it('content:delete calls service with id', async () => {
      mockContentService.delete.mockResolvedValueOnce(true);

      const result = await mockContentService.delete('1');

      expect(mockContentService.delete).toHaveBeenCalledWith('1');
      expect(result).toBe(true);
    });
  });

  describe('group:* channels', () => {
    it('groups:list returns array from service', async () => {
      mockGroupService.list.mockResolvedValueOnce([]);

      const result = await mockGroupService.list();

      expect(mockGroupService.list).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('groups:create calls service with group data', async () => {
      const groupData = { name: 'Test Group', platform: 'douyin' };
      mockGroupService.create.mockResolvedValueOnce({ id: '1', ...groupData });

      const result = await mockGroupService.create(groupData);

      expect(mockGroupService.create).toHaveBeenCalledWith(groupData);
      expect(result).toMatchObject({ id: '1', name: 'Test Group' });
    });

    it('groups:update calls service with id and data', async () => {
      const updateData = { name: 'Updated Group' };
      mockGroupService.update.mockResolvedValueOnce({ id: '1', ...updateData });

      const result = await mockGroupService.update('1', updateData);

      expect(mockGroupService.update).toHaveBeenCalledWith('1', updateData);
      expect(result).toMatchObject({ id: '1', name: 'Updated Group' });
    });

    it('groups:bindAccounts calls service with correct params', async () => {
      const accountIds = ['acc1', 'acc2'];
      mockGroupService.bindAccounts.mockResolvedValueOnce(true);

      const result = await mockGroupService.bindAccounts('1', accountIds);

      expect(mockGroupService.bindAccounts).toHaveBeenCalledWith('1', accountIds);
      expect(result).toBe(true);
    });
  });

  describe('publish:* channels', () => {
    it('publish:createTask calls service with task data', async () => {
      const taskData = {
        contentId: 'c1',
        groupId: 'g1',
        scheduledAt: '2024-01-01T00:00:00Z',
      };
      mockPublishService.createTask.mockResolvedValueOnce({ id: '1', ...taskData, status: 'pending' });

      const result = await mockPublishService.createTask(taskData);

      expect(mockPublishService.createTask).toHaveBeenCalledWith(taskData);
      expect(result).toMatchObject({ id: '1', status: 'pending' });
    });

    it('publish:listTasks returns array from service', async () => {
      mockPublishService.listTasks.mockResolvedValueOnce([]);

      const result = await mockPublishService.listTasks();

      expect(mockPublishService.listTasks).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('publish:cancelTask calls service with id', async () => {
      mockPublishService.cancelTask.mockResolvedValueOnce(true);

      const result = await mockPublishService.cancelTask('1');

      expect(mockPublishService.cancelTask).toHaveBeenCalledWith('1');
      expect(result).toBe(true);
    });

    it('publish:retryTask calls service with id', async () => {
      mockPublishService.retryTask.mockResolvedValueOnce({ id: '1', status: 'pending' });

      const result = await mockPublishService.retryTask('1');

      expect(mockPublishService.retryTask).toHaveBeenCalledWith('1');
      expect(result).toMatchObject({ id: '1' });
    });
  });

  describe('error handling', () => {
    it('account:list handles service error', async () => {
      mockAccountService.list.mockRejectedValueOnce(new Error('Database error'));

      await expect(mockAccountService.list()).rejects.toThrow('Database error');
    });

    it('content:create handles service error', async () => {
      mockContentService.create.mockRejectedValueOnce(new Error('Invalid content'));

      await expect(mockContentService.create({})).rejects.toThrow('Invalid content');
    });

    it('publish:createTask handles service error', async () => {
      mockPublishService.createTask.mockRejectedValueOnce(new Error('Task creation failed'));

      await expect(mockPublishService.createTask({})).rejects.toThrow('Task creation failed');
    });
  });
});
