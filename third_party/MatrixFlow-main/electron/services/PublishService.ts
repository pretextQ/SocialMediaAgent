import { randomUUID } from 'crypto';
import { Logger } from '../core/Logger';
import { EventBus } from '../core/EventBus';
import { TaskScheduler } from '../core/TaskScheduler';
import { PlatformRegistry } from '../platform/base/PlatformRegistry';
import { accountService } from './AccountService';
import { materialService } from './MaterialService';
import { publishTaskRepo } from '../data/repositories/PublishTaskRepository';
import { taskItemRepo } from '../data/repositories/TaskItemRepository';
import { groupPublishRuleRepo } from '../data/repositories/GroupPublishRuleRepository';
import { accountRepo } from '../data/repositories/AccountRepository';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import type { PlatformAdapter } from '../platform/base/interfaces';
import type {
  UploadContext,
  PublishContext,
  ScheduleContext,
} from '../platform/base/types';
import type { PublishTask as DbPublishTask, TaskItem as DbTaskItem, Account as DbAccount } from '../data/types';
import type {
  IPublishService,
  PublishRequest,
  BatchPublishRequest,
  PublishTask,
  PublishResult,
  PublishTaskStatus,
  PublishTaskStatusDetail,
  PublishTaskItem,
  PublishMode,
  TaskCreatedPayload,
  TaskScheduledPayload,
  TaskStartedPayload,
  TaskCompletedPayload,
  TaskFailedPayload,
  TaskCancelledPayload,
  ItemStartedPayload,
  ItemCompletedPayload,
  ItemFailedPayload,
  RulesAppliedPayload,
  TaskFilter,
  TaskListResult,
} from './types/publish';
import { PublishEvent } from './types/publish';
import type { PublishEvent as BusPublishEvent } from '../core/types/eventbus';
import type { TaskStatus } from '../core/types/task';
import { toPlatformError, type PlatformId } from '../platform/base/PlatformError';
import { watchdog } from './Watchdog';
import { shouldPreserveStandaloneBrowserAfterFailure } from './publish-browser-policy';

const logger = new Logger('PublishService');

const DEFAULT_MAX_RETRIES = 3;
const SCHEDULE_AHEAD_THRESHOLD_MS = 60_000;

function nowISO(): string {
  return new Date().toISOString();
}

function normalizeLocalFilePath(value?: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.replace(/^local-file:\/\//, '');
}

function parseTaskTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
  }
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
  } catch {
    return [];
  }
}

function mergeTags(baseTags: string[], presetTags?: string[]): string[] {
  if (baseTags.length === 0) return [];
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...baseTags, ...(presetTags ?? [])]) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

const PLATFORM_PRE_PUBLISH_RULES: Record<string, { titleMinLen?: number; titleMinLenMsg?: string }> = {
  channels: { titleMinLen: 6, titleMinLenMsg: '视频号标题至少需要6个字符' },
};

function prePublishValidate(platform: string, title: string): string | null {
  const rules = PLATFORM_PRE_PUBLISH_RULES[platform];
  if (!rules) return null;

  const trimmed = title.trim();
  if (rules.titleMinLen && trimmed.length > 0 && trimmed.length < rules.titleMinLen) {
    return `${rules.titleMinLenMsg}（当前${trimmed.length}个字符）`;
  }
  return null;
}

function buildUploadContextFromTask(
  dbTask: DbPublishTask,
  accountId: string,
  videoPath: string,
  taskMeta: Record<string, unknown>,
  browserRuntime: Partial<UploadContext>,
): UploadContext {
  const contentId = dbTask.content_id;
  const headless = taskMeta.headless === true;
  const taskTitle = (dbTask as any).title || `video_${contentId.slice(0, 8)}`;
  const taskDescription = (dbTask as any).description || undefined;
  const taskTags = parseTaskTags((dbTask as any).tags);
  const presetTags = browserRuntime.tags;

  const uploadContext: UploadContext = {
    accountId,
    videoPath,
    title: taskTitle,
    description: taskDescription,
    coverPath: normalizeLocalFilePath((dbTask as any).cover_url || taskMeta.coverUrl),
    location: taskMeta.location as string | undefined,
    visibility: taskMeta.visibility as UploadContext['visibility'],
    declaration: taskMeta.declaration as string | undefined,
    scheduleMode: taskMeta.scheduleMode as UploadContext['scheduleMode'],
    scheduledAt: dbTask.scheduled_at || taskMeta.scheduledAt as string | undefined,
    allowComment: taskMeta.allowComment as boolean | undefined,
    allowShare: taskMeta.allowShare as boolean | undefined,
    allowSameFrame: taskMeta.allowSameFrame as boolean | undefined,
    allowDownload: taskMeta.allowDownload as boolean | undefined,
    showInCity: taskMeta.showInCity as boolean | undefined,
    headless,
    slowMo: headless ? 0 : 200,
    debugSteps: process.env.NODE_ENV !== 'production' && taskMeta.debugSteps === true,
    ...browserRuntime,
    tags: mergeTags(taskTags, presetTags),
  };

  const taskExplicitFields: Array<keyof UploadContext> = [
    'visibility',
    'declaration',
    'location',
    'allowComment',
    'allowShare',
    'allowSameFrame',
    'allowDownload',
    'showInCity',
  ];
  for (const key of taskExplicitFields) {
    if (taskMeta[key as string] !== undefined) {
      (uploadContext as any)[key] = taskMeta[key as string];
    }
  }

  if (dbTask.platform === 'kuaishou') {
    return {
      ...uploadContext,
      declaration: uploadContext.declaration ?? '',
      visibility: uploadContext.visibility ?? 'public',
      allowComment: uploadContext.allowComment ?? true,
      allowSameFrame: uploadContext.allowSameFrame ?? false,
      allowDownload: uploadContext.allowDownload ?? false,
      showInCity: uploadContext.showInCity ?? true,
    };
  }

  if (dbTask.platform === 'douyin') {
    return {
      ...uploadContext,
      declaration: uploadContext.declaration ?? 'none',
      visibility: uploadContext.visibility ?? 'public',
      scheduleMode: uploadContext.scheduleMode ?? 'immediate',
      allowComment: uploadContext.allowComment ?? true,
      allowDownload: uploadContext.allowDownload ?? true,
    };
  }

  return uploadContext;
}

export class PublishService implements IPublishService {
  private static instance: PublishService;
  private eventBus: EventBus;
  private taskScheduler: TaskScheduler;
  private initialized = false;
  private executingTasks = new Set<string>();
  private stuckTaskMonitorTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly TASK_TIMEOUT_MS = 30 * 60 * 1000;
  private static readonly STUCK_CHECK_INTERVAL_MS = 60 * 1000;

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.taskScheduler = TaskScheduler.getInstance();
  }

  static getInstance(): PublishService {
    if (!PublishService.instance) {
      PublishService.instance = new PublishService();
    }
    return PublishService.instance;
  }

  initialize(): void {
    if (this.initialized) return;

    this.taskScheduler.onTaskExecute = async (task) => {
      if (task.type !== 'publish') return { success: false, error: '非发布任务' };
      const publishTaskId = task.payload as string;
      try {
        const result = await this.executeNow(publishTaskId);
        return { success: result.success, error: result.error };
      } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    };

    this.initialized = true;
    this.recoverStaleRunningTasks().catch((err) => {
      logger.error(`启动时恢复残留任务失败: ${err}`);
    });
    this.startStuckTaskMonitor();
    watchdog.start();
    logger.info('发布管理服务已初始化');
  }

  // ─── 任务创建 ─────────────────────────────────────────────

  async createPublishTask(request: PublishRequest): Promise<PublishTask> {
    const preCheckError = prePublishValidate(
      request.platform,
      (request.title ?? request.metadata?.title ?? '') as string,
    );
    if (preCheckError) {
      throw new Error(preCheckError);
    }

    const adapter = this.requireAdapter(request.platform);

    await this.validateCookieForAccount(request.accountId);

    if (request.platform === 'xiaohongshu' && request.scheduledAt) {
      logger.warn(`小红书不支持定时发布，自动清空定时字段: accountId=${request.accountId}`);
      request.scheduledAt = undefined;
    }

    const taskId = randomUUID();
    const now = nowISO();
    const status: PublishTaskStatus = request.scheduledAt ? 'scheduled' : 'pending';

    const dbRow = {
      id: taskId,
      content_id: request.contentId,
      group_id: null,
      platform: request.platform,
      account_id: request.accountId,
      proxy_id: null,
      fingerprint_id: null,
      scheduled_at: request.scheduledAt ? request.scheduledAt.toISOString() : null,
      publish_mode: request.publishMode,
      status,
      result: null,
      error_message: null,
      retry_count: 0,
      max_retries: DEFAULT_MAX_RETRIES,
      created_at: now,
      updated_at: now,
      title: request.title ?? request.metadata.title ?? '',
      description: request.description ?? request.metadata.description ?? '',
      tags: JSON.stringify(request.tags ?? request.metadata.tags ?? []),
      cover_url: request.coverUrl || null,
      source: request.source ?? 'client',
      metadata: JSON.stringify({ ...request.metadata, headless: request.headless ?? false }),
    };

    await publishTaskRepo.insert(dbRow);

    const task = this.dbRowToTask(dbRow as unknown as DbPublishTask);

    if (request.scheduledAt) {
      this.taskScheduler.scheduleAt(
        {
          id: taskId,
          type: 'publish',
          platform: request.platform,
          accountId: request.accountId,
          priority: 5,
          payload: taskId,
          status: 'pending',
          createdAt: now,
          scheduledAt: request.scheduledAt.toISOString(),
          retryCount: 0,
          maxRetries: DEFAULT_MAX_RETRIES,
        },
        request.scheduledAt,
      );
    }

    const payload: TaskCreatedPayload = {
      taskId,
      contentId: request.contentId,
      platform: request.platform,
      accountId: request.accountId,
      publishMode: request.publishMode,
    };
    this.eventBus.emit(PublishEvent.TASK_CREATED, payload);

    logger.info(
      `发布任务创建: taskId=${taskId} platform=${request.platform} mode=${request.publishMode}`
        + (request.scheduledAt ? ` scheduledAt=${request.scheduledAt.toISOString()}` : ' immediate'),
    );

    return task;
  }

  async createBatchPublishTask(request: BatchPublishRequest): Promise<PublishTask[]> {
    const tasks: PublishTask[] = [];

    for (const groupId of request.groupIds) {
      let accountsInGroup = await accountRepo.findWhere({ status: 'active' } as Partial<DbAccount>);

      const groupRules = await groupPublishRuleRepo.findEnabledByGroup(groupId);
      const platformAccounts = new Map<string, string[]>();

      for (const rule of groupRules) {
        const accountIds = accountsInGroup
          .filter((a) => a.platform === rule.platform)
          .map((a) => a.id);
        platformAccounts.set(rule.platform, accountIds);
      }

      if (request.prePublishCheck) {
        const unhealthyAccounts: string[] = [];
        for (const account of accountsInGroup) {
          const isValid = await accountService.validateCookie(account.id);
          if (!isValid) {
            unhealthyAccounts.push(account.id);
          }
        }
        accountsInGroup = accountsInGroup.filter((a) => !unhealthyAccounts.includes(a.id));
      }

      for (const [platform, accountIds] of platformAccounts) {
        for (const accountId of accountIds) {
          if (!accountsInGroup.find((a) => a.id === accountId)) continue;

          const task = await this.createPublishTask({
            contentId: request.contentId,
            platform,
            accountId,
            scheduledAt: request.scheduledAt,
            publishMode: request.publishMode,
            metadata: { dryRun: request.dryRun },
          });
          tasks.push(task);
        }
      }
    }

    logger.info(`批量发布任务创建完成: count=${tasks.length} groupIds=${request.groupIds.join(',')}`);
    return tasks;
  }

  // ─── 发布调度 ─────────────────────────────────────────────

  async schedulePublish(taskId: string, scheduledAt: Date): Promise<void> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);
    if (dbTask.status === 'running' || dbTask.status === 'completed') {
      throw new Error(`任务状态不允许调度: ${dbTask.status}`);
    }

    await publishTaskRepo.update(taskId, {
      scheduled_at: scheduledAt.toISOString(),
      status: 'scheduled',
    } as Partial<DbPublishTask>);

    this.taskScheduler.scheduleAt(
      {
        id: taskId,
        type: 'publish',
        platform: dbTask.platform,
        accountId: dbTask.account_id ?? '',
        priority: 5,
        payload: taskId,
        status: 'pending',
        createdAt: dbTask.created_at,
        scheduledAt: scheduledAt.toISOString(),
        retryCount: dbTask.retry_count,
        maxRetries: dbTask.max_retries,
      },
      scheduledAt,
    );

    const payload: TaskScheduledPayload = { taskId, scheduledAt };
    this.eventBus.emit(PublishEvent.TASK_SCHEDULED, payload);

    logger.info(`发布任务已调度: taskId=${taskId} scheduledAt=${scheduledAt.toISOString()}`);
  }

  async executeNow(taskId: string, options: { finalOnFailure?: boolean } = {}): Promise<PublishResult> {
    if (this.executingTasks.has(taskId)) {
      logger.warn(`任务已在执行中，跳过: taskId=${taskId}`);
      return { success: false, error: '任务已在执行中' };
    }

    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);
    if (dbTask.status === 'completed') throw new Error(`任务已完成: ${taskId}`);

    this.executingTasks.add(taskId);

    const startedAt = nowISO();
    await publishTaskRepo.update(taskId, {
      status: 'running',
      started_at: startedAt,
    } as Partial<DbPublishTask>);

    const startedPayload: TaskStartedPayload = {
      taskId,
      publishMode: dbTask.publish_mode as PublishMode,
    };
    this.eventBus.emit(PublishEvent.TASK_STARTED, startedPayload);

    logger.info(`立即执行发布任务: taskId=${taskId} mode=${dbTask.publish_mode}`);

    try {
      const result = dbTask.publish_mode === 'server'
        ? await this.publishToServer(taskId)
        : await this.publishFromClient(taskId);

      if (result.success) {
        await publishTaskRepo.markCompleted(taskId, JSON.stringify(result));
        await this.closeStandaloneBrowserAfterPublish(dbTask.account_id ?? '', 'completed');
        this.eventBus.emit(PublishEvent.TASK_COMPLETED, { taskId, result } as TaskCompletedPayload);
      } else {
        const failMsg = result.error ?? '未知错误';
        const isAuthError = /登录已过期|请重新登录|Cookie 已失效|需要重新登录|登录页/.test(failMsg);
        if (isAuthError && dbTask.account_id) {
          try {
            await accountService.updateStatus(dbTask.account_id, 'expired');
            logger.info(`[executeNow] 检测到认证失败，已将账号标记为expired: accountId=${dbTask.account_id}`);
          } catch (statusErr) {
            logger.warn(`[executeNow] 更新账号状态失败: ${statusErr}`);
          }
        }
        if (shouldPreserveStandaloneBrowserAfterFailure(dbTask.platform, failMsg)) {
          logger.warn(`发布失败后保留独立浏览器现场: accountId=${dbTask.account_id ?? ''} error=${failMsg}`);
        } else {
          await this.closeStandaloneBrowserAfterPublish(dbTask.account_id ?? '', 'failed');
        }
        await this.handleTaskFailure(taskId, failMsg, dbTask.retry_count, dbTask.max_retries, options);
      }

      return result;
    } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[executeNow] 任务执行异常: taskId=${taskId} error=${errMsg}`);
      if (err instanceof Error && err.stack) {
        logger.error(`[executeNow] stack: ${err.stack}`);
      }

      if (platformErr.category === 'AuthError' && dbTask.account_id) {
        try {
          await accountService.updateStatus(dbTask.account_id, 'expired');
          logger.info(`[executeNow] AuthError: 已将账号标记为expired: accountId=${dbTask.account_id}`);
        } catch (statusErr) {
          logger.warn(`[executeNow] 更新账号状态失败: ${statusErr}`);
        }
      }

      if (shouldPreserveStandaloneBrowserAfterFailure(dbTask.platform, errMsg)) {
        logger.warn(`发布异常后保留独立浏览器现场: accountId=${dbTask.account_id ?? ''} error=${errMsg}`);
      } else {
        await this.closeStandaloneBrowserAfterPublish(dbTask.account_id ?? '', 'failed');
      }
      await this.handleTaskFailure(taskId, errMsg, dbTask.retry_count, dbTask.max_retries, options);
      return { success: false, error: errMsg };
    } finally {
      this.executingTasks.delete(taskId);
    }
  }

  async updateTask(taskId: string, data: Partial<{ scheduledAt: Date; status: string }>): Promise<void> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);

    const updateData: Partial<DbPublishTask> = {};
    if (data.scheduledAt) {
      updateData.scheduled_at = data.scheduledAt.toISOString();
    }
    if (data.status) {
      updateData.status = data.status;
    }

    await publishTaskRepo.update(taskId, updateData);
    this.eventBus.emit(PublishEvent.TASK_UPDATED, { taskId, changes: data });
    logger.info(`发布任务已更新: taskId=${taskId}`);
  }

  async cancelPublish(taskId: string): Promise<void> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);
    if (dbTask.status === 'completed') throw new Error(`任务已完成，无法取消: ${taskId}`);
    if (dbTask.status === 'running') throw new Error(`任务正在执行，无法取消: ${taskId}`);

    this.taskScheduler.cancel(taskId);

    await publishTaskRepo.update(taskId, { status: 'cancelled' } as Partial<DbPublishTask>);

    const payload: TaskCancelledPayload = { taskId };
    this.eventBus.emit(PublishEvent.TASK_CANCELLED, payload);

    logger.info(`发布任务已取消: taskId=${taskId}`);
  }

  async deleteTask(taskId: string): Promise<void> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);
    if (dbTask.status === 'running') throw new Error(`任务正在执行，无法删除: ${taskId}`);

    this.taskScheduler.cancel(taskId);
    await publishTaskRepo.deleteById(taskId);
    logger.info(`发布任务已删除: taskId=${taskId}`);
  }

  // ─── 服务端发布 ───────────────────────────────────────────

  async publishToServer(taskId: string): Promise<PublishResult> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);

    const adapter = this.requireAdapter(dbTask.platform);
    const accountId = dbTask.account_id ?? '';
    const contentId = dbTask.content_id;

    logger.info(`服务端发布开始: taskId=${taskId} platform=${dbTask.platform} accountId=${accountId}`);

    await this.validateCookieForAccount(accountId);

    const items = await taskItemRepo.findByTaskId(taskId);
    if (items.length === 0) {
      const itemId = randomUUID();
      await taskItemRepo.insert({
        id: itemId,
        task_id: taskId,
        account_id: accountId,
        platform: dbTask.platform,
        status: 'pending',
        platform_video_id: null,
        publish_url: null,
        error_message: null,
        started_at: null,
        completed_at: null,
      } as Omit<DbTaskItem, 'created_at' | 'updated_at'>);
    }

    const allItems = await taskItemRepo.findByTaskId(taskId);
    const targetItem = allItems[0];

    await taskItemRepo.markStarted(targetItem.id);
    this.emitItemStarted(taskId, targetItem.id, accountId, dbTask.platform);

    try {
      const material = await materialService.getMaterial(contentId);
      const videoPath = material?.filePath || contentId;
      let taskMeta: Record<string, unknown> = {};
      try { taskMeta = JSON.parse((dbTask as any).metadata || '{}'); } catch {}
      const browserRuntime = this.getAccountBrowserRuntime(accountId);
      const uploadCtx = buildUploadContextFromTask(dbTask, accountId, videoPath, taskMeta, browserRuntime);

      this.markStatus(taskId, 'uploading');
      const uploadResult = await adapter.uploadVideo(uploadCtx);
      if (!uploadResult.success) {
        await taskItemRepo.markFailed(targetItem.id, uploadResult.message);
        this.emitItemFailed(taskId, targetItem.id, uploadResult.message);
        return { success: false, error: `上传失败: ${uploadResult.message}` };
      }

      this.markStatus(taskId, 'publishing');

      if (dbTask.scheduled_at && adapter.schedule) {
        const scheduleCtx: ScheduleContext = {
          accountId,
          videoId: uploadResult.videoId ?? '',
          title: uploadCtx.title,
          scheduledTime: new Date(dbTask.scheduled_at),
        };
        const scheduleResult = await adapter.schedule(scheduleCtx);
        if (!scheduleResult.success) {
          logger.warn(`平台定时发布失败，回退到本地调度: ${scheduleResult.message}`);
        } else {
          logger.info(`平台定时发布设置成功: taskId=${taskId} scheduledTime=${scheduleResult.scheduledTime?.toISOString()}`);
        }
      } else if (dbTask.scheduled_at) {
        logger.info(`平台不支持定时发布 API，使用本地 TaskScheduler 调度`);
      }

      this.markStatus(taskId, 'audit');

      const publishCtx: PublishContext = {
        accountId,
        videoId: uploadResult.videoId ?? '',
        title: uploadCtx.title,
      };
      const publishRes = await adapter.publish(publishCtx);

      if (publishRes.success) {
        await taskItemRepo.markCompleted(
          targetItem.id,
          uploadResult.videoId ?? '',
          publishRes.publishUrl ?? '',
        );
        this.emitItemCompleted(taskId, targetItem.id, uploadResult.videoId, publishRes.publishUrl);

        logger.info(`服务端发布成功: taskId=${taskId} videoId=${uploadResult.videoId}`);

        return {
          success: true,
          videoId: uploadResult.videoId,
          publishUrl: publishRes.publishUrl,
          publishedAt: new Date(),
        };
      }

      await taskItemRepo.markFailed(targetItem.id, publishRes.message);
      this.emitItemFailed(taskId, targetItem.id, publishRes.message);
      return { success: false, error: `发布失败: ${publishRes.message}` };
    } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      await taskItemRepo.markFailed(targetItem.id, errMsg);
      this.emitItemFailed(taskId, targetItem.id, errMsg);
      return { success: false, error: errMsg };
    }
  }

  // ─── 客户端发布 ───────────────────────────────────────────

  async publishFromClient(taskId: string): Promise<PublishResult> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);

    const adapter = this.requireAdapter(dbTask.platform);
    const accountId = dbTask.account_id ?? '';
    const contentId = dbTask.content_id;

    logger.info(`客户端发布开始: taskId=${taskId} platform=${dbTask.platform} accountId=${accountId}`);

    const preCheckError = prePublishValidate(dbTask.platform, (dbTask as any).title || '');
    if (preCheckError) {
      logger.error(`[publishFromClient] 前置校验失败: ${preCheckError}`);
      try {
        const items = await taskItemRepo.findByTaskId(taskId);
        if (items.length > 0) {
          await taskItemRepo.markFailed(items[0].id, preCheckError);
          this.emitItemFailed(taskId, items[0].id, preCheckError);
        }
      } catch {}
      return { success: false, error: preCheckError };
    }

    await this.validateCookieForAccount(accountId);

    let targetItem: DbTaskItem;
    try {
      const items = await taskItemRepo.findByTaskId(taskId);
      if (items.length === 0) {
        const itemId = randomUUID();
        await taskItemRepo.insert({
          id: itemId,
          task_id: taskId,
          account_id: accountId,
          platform: dbTask.platform,
          status: 'pending',
          platform_video_id: null,
          publish_url: null,
          error_message: null,
          started_at: null,
          completed_at: null,
        } as Omit<DbTaskItem, 'created_at' | 'updated_at'>);
      }

      const allItems = await taskItemRepo.findByTaskId(taskId);
      targetItem = allItems[0];

      await taskItemRepo.markStarted(targetItem.id);
      this.emitItemStarted(taskId, targetItem.id, accountId, dbTask.platform);
    } catch (itemErr) {
      const platformErr = toPlatformError(itemErr);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
      const errMsg = itemErr instanceof Error ? itemErr.message : String(itemErr);
      logger.error(`[publishFromClient] taskItem 初始化失败: ${errMsg}`);
      return { success: false, error: `任务项初始化失败: ${errMsg}` };
    }

    try {
      const material = await materialService.getMaterial(contentId);
      const videoPath = material?.filePath || contentId;
      let taskMeta: Record<string, unknown> = {};
      try { taskMeta = JSON.parse((dbTask as any).metadata || '{}'); } catch {}
      const browserRuntime = this.getAccountBrowserRuntime(accountId);
      const uploadCtx = buildUploadContextFromTask(dbTask, accountId, videoPath, taskMeta, browserRuntime);

      logger.info(`[publishFromClient] 开始上传: videoPath=${videoPath} headless=${uploadCtx.headless} slowMo=${uploadCtx.slowMo}`);

      this.markStatus(taskId, 'uploading');
      const uploadResult = await adapter.uploadVideo(uploadCtx);
      if (!uploadResult.success) {
        await taskItemRepo.markFailed(targetItem.id, uploadResult.message);
        this.emitItemFailed(taskId, targetItem.id, uploadResult.message);
        return { success: false, error: `上传失败: ${uploadResult.message}` };
      }

      this.markStatus(taskId, 'publishing');

      let finalVideoId = uploadResult.videoId;
      let finalPublishUrl = '';

      if (adapter.publish) {
        try {
          const ctx: PublishContext = {
            accountId,
            videoId: uploadResult.videoId ?? '',
            title: uploadCtx.title,
          };
          this.markStatus(taskId, 'audit');
          const res = await adapter.publish(ctx);
          if (res.success) {
            finalPublishUrl = res.publishUrl || '';
            finalVideoId = res.videoId || finalVideoId;
          }
        } catch {}
      }

      await taskItemRepo.markCompleted(
        targetItem.id,
        finalVideoId ?? '',
        finalPublishUrl,
      );
      this.emitItemCompleted(taskId, targetItem.id, finalVideoId, finalPublishUrl);

      logger.info(`客户端发布成功: taskId=${taskId} videoId=${finalVideoId}`);

      return {
        success: true,
        videoId: finalVideoId,
        publishUrl: finalPublishUrl,
        publishedAt: new Date(),
      };
    } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[publishFromClient] 上传异常: ${errMsg}`);
      if (err instanceof Error && err.stack) {
        logger.error(`[publishFromClient] stack: ${err.stack}`);
      }
      await taskItemRepo.markFailed(targetItem.id, errMsg);
      this.emitItemFailed(taskId, targetItem.id, errMsg);
      return { success: false, error: errMsg };
    }
  }

  // ─── 状态追踪 ─────────────────────────────────────────────

  async getTaskStatus(taskId: string): Promise<PublishTaskStatusDetail> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);

    const dbItems = await taskItemRepo.findByTaskId(taskId);
    const items: PublishTaskItem[] = dbItems.map((item) => ({
      itemId: item.id,
      accountId: item.account_id,
      platform: item.platform,
      status: item.status,
      videoId: item.platform_video_id ?? undefined,
      publishUrl: item.publish_url ?? undefined,
      error: item.error_message ?? undefined,
    }));

    let result: PublishResult | undefined;
    if (dbTask.result) {
      try {
        result = JSON.parse(dbTask.result);
      } catch { /* ignore */ }
    }

    return {
      taskId: dbTask.id,
      status: dbTask.status as PublishTaskStatus,
      publishMode: dbTask.publish_mode as PublishMode,
      scheduledAt: dbTask.scheduled_at ? new Date(dbTask.scheduled_at) : undefined,
      result,
      items,
      createdAt: new Date(dbTask.created_at),
      updatedAt: new Date(dbTask.updated_at),
    };
  }

  async getAccountTasks(accountId: string): Promise<PublishTask[]> {
    const dbTasks = await publishTaskRepo.findWhere({
      account_id: accountId,
    } as Partial<DbPublishTask>);

    return dbTasks.map((t) => this.dbRowToTask(t));
  }

  async getContentTasks(contentId: string): Promise<PublishTask[]> {
    const dbTasks = await publishTaskRepo.findByContentId(contentId);
    return dbTasks.map((t) => this.dbRowToTask(t));
  }

  // ─── 发布规则应用 ─────────────────────────────────────────

  async applyGroupRules(taskId: string, groupId: string): Promise<void> {
    const dbTask = await publishTaskRepo.findById(taskId);
    if (!dbTask) throw new Error(`发布任务不存在: ${taskId}`);

    const rules = await groupPublishRuleRepo.findEnabledByGroup(groupId);
    if (rules.length === 0) {
      logger.warn(`分组无启用规则: groupId=${groupId}`);
      return;
    }

    for (const rule of rules) {
      if (rule.publish_mode) {
        await publishTaskRepo.update(taskId, {
          publish_mode: rule.publish_mode,
        } as Partial<DbPublishTask>);
      }

      if (rule.publish_interval_min > 0) {
        const earliestSlot = new Date(Date.now() + rule.publish_interval_min * 60_000);
        const currentScheduled = dbTask.scheduled_at ? new Date(dbTask.scheduled_at) : null;

        if (!currentScheduled || currentScheduled < earliestSlot) {
          await publishTaskRepo.update(taskId, {
            scheduled_at: earliestSlot.toISOString(),
          } as Partial<DbPublishTask>);
        }
      }
    }

    await publishTaskRepo.update(taskId, {
      group_id: groupId,
    } as Partial<DbPublishTask>);

    const payload: RulesAppliedPayload = { taskId, groupId, rulesCount: rules.length };
    this.eventBus.emit(PublishEvent.RULES_APPLIED, payload);

    logger.info(`发布规则已应用: taskId=${taskId} groupId=${groupId} rulesCount=${rules.length}`);
  }

  // ─── 内部方法 ─────────────────────────────────────────────

  private async handleTaskFailure(
    taskId: string,
    error: string,
    _currentRetryCount: number,
    maxRetries: number,
    _options: { finalOnFailure?: boolean } = {},
  ): Promise<void> {
    const updatedTask = await publishTaskRepo.markFinalFailed(taskId, error);
    const newRetryCount = updatedTask.retry_count;

    const payload: TaskFailedPayload = {
      taskId,
      error,
      retryCount: newRetryCount,
      maxRetries,
    };
    this.eventBus.emit(PublishEvent.TASK_FAILED, payload);

    logger.error(`发布任务失败，不自动重试: taskId=${taskId} retry=${newRetryCount}/${maxRetries} error=${error}`);
  }

  private async closeStandaloneBrowserAfterPublish(accountId: string, outcome: 'completed' | 'failed'): Promise<void> {
    if (!accountId) return;
    try {
      const { browserManager } = await import('./embedded-browser/browser-manager');
      if (browserManager.hasStandaloneTab(accountId)) {
        await browserManager.closeTab(accountId);
        logger.info(`发布${outcome === 'completed' ? '完成' : '失败'}后已关闭独立发布浏览器: accountId=${accountId}`);
      }
    } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
      logger.warn(`关闭发布${outcome === 'completed' ? '完成' : '失败'}独立浏览器失败: accountId=${accountId} error=${err}`);
    }
  }

  private getAccountBrowserRuntime(accountId: string): Partial<UploadContext> {
    if (!isDatabaseAvailable()) return {};

    const db = getDatabase();
    const row = db.prepare(`
      SELECT browser_mode, fingerprint_id, cookie_path, platform
      FROM accounts
      WHERE id = ?
    `).get(accountId) as { browser_mode?: string | null; fingerprint_id?: string | null; cookie_path?: string | null; platform?: string | null } | undefined;

    let chromePath: string | null = null;
    try {
      const cfg = db.prepare('SELECT value FROM platform_configs WHERE key = ?').get('chromePath') as { value?: string } | undefined;
      if (cfg?.value) {
        try { chromePath = JSON.parse(cfg.value); } catch { chromePath = cfg.value; }
      }
    } catch {
      chromePath = null;
    }

    const runtime: Partial<UploadContext> = {
      browserMode: (row?.browser_mode as UploadContext['browserMode']) || 'embedded',
      fingerprintId: row?.fingerprint_id || null,
      chromePath,
      cookiePath: row?.cookie_path || null,
    };

    if (row?.platform) {
      const presetRow = db.prepare(`
        SELECT default_topics, platform_options, enabled
        FROM account_publish_presets
        WHERE account_id = ? AND platform = ?
      `).get(accountId, row.platform) as
        | { default_topics?: string | null; platform_options?: string | null; enabled?: number | null }
        | undefined;

      if (presetRow && Number(presetRow.enabled) === 1) {
        if (presetRow.default_topics) {
          try {
            const parsed = JSON.parse(presetRow.default_topics);
            if (Array.isArray(parsed)) {
              const topics = parsed.filter((t): t is string => typeof t === 'string' && t.length > 0);
              if (topics.length > 0) {
                runtime.tags = topics;
              }
            }
          } catch (e) {
            logger.warn(`解析 account_publish_presets.default_topics 失败: accountId=${accountId}`);
          }
        }

        if (presetRow.platform_options) {
          try {
            const opts = JSON.parse(presetRow.platform_options);
            if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
              this.applyPresetOptions(runtime, opts as Record<string, unknown>);
            }
          } catch (e) {
            logger.warn(`解析 account_publish_presets.platform_options 失败: accountId=${accountId}`);
          }
        }
      }
    }

    return runtime;
  }

  private applyPresetOptions(runtime: Partial<UploadContext>, opts: Record<string, unknown>): void {
    const knownKeys: Array<keyof UploadContext> = [
      'declaration',
      'visibility',
      'allowDownload',
      'allowSameFrame',
      'showInCity',
      'location',
    ];
    for (const key of knownKeys) {
      if (key in opts && opts[key] !== undefined) {
        (runtime as any)[key] = opts[key];
      }
    }
  }

  private async validateCookieForAccount(accountId: string): Promise<void> {
    const account = await accountRepo.findById(accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);
    logger.info(`[validateCookie] accountId=${accountId} platform=${account.platform} cookie_valid=${account.cookie_valid}`);

    const valid = await accountService.validateCookie(accountId);
    if (!valid) {
      throw new Error(`账号登录状态已失效，请重新登录: ${accountId}`);
    }
  }

  private requireAdapter(platform: string): PlatformAdapter {
    const adapter = PlatformRegistry.getAdapter(platform);
    if (!adapter) {
      throw new Error(
        `不支持的平台: ${platform}，可用: ${PlatformRegistry.getSupportedPlatforms().join(', ')}`,
      );
    }
    return adapter;
  }

  private dbRowToTask(row: DbPublishTask): PublishTask {
    let result: PublishResult | undefined;
    if (row.result) {
      try { result = JSON.parse(row.result); } catch { /* ignore */ }
    }

    const extra = row as any;

    let tags: string[] = [];
    if (extra.tags) {
      try { tags = JSON.parse(extra.tags); } catch { /* ignore */ }
    }

    return {
      id: row.id,
      contentId: row.content_id,
      platform: row.platform,
      accountId: row.account_id ?? '',
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
      publishMode: row.publish_mode as PublishMode,
      status: row.status as PublishTaskStatus,
      result,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      error: row.error_message ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      type: 'publish',
      title: extra.title || undefined,
      description: extra.description || undefined,
      tags,
      coverUrl: extra.cover_url || undefined,
      startedAt: extra.started_at ? new Date(extra.started_at) : undefined,
      completedAt: extra.completed_at ? new Date(extra.completed_at) : undefined,
      durationMs: extra.duration_ms || undefined,
      source: extra.source || undefined,
      accountName: extra.account_name || undefined,
    };
  }

  private emitItemStarted(taskId: string, itemId: string, accountId: string, platform: string): void {
    const payload: ItemStartedPayload = { taskId, itemId, accountId, platform };
    this.eventBus.emit(PublishEvent.ITEM_STARTED, payload);
  }

  private emitItemCompleted(taskId: string, itemId: string, videoId?: string, publishUrl?: string): void {
    const payload: ItemCompletedPayload = { taskId, itemId, videoId, publishUrl };
    this.eventBus.emit(PublishEvent.ITEM_COMPLETED, payload);
  }

  private emitItemFailed(taskId: string, itemId: string, error: string): void {
    const payload: ItemFailedPayload = { taskId, itemId, error };
    this.eventBus.emit(PublishEvent.ITEM_FAILED, payload);
  }

  private markStatus(taskId: string, status: TaskStatus, error?: string): void {
    const now = nowISO();
    publishTaskRepo.update(taskId, { status: status as any, updated_at: now }).catch((err) => {
      logger.warn(`markStatus 更新失败: taskId=${taskId} status=${status} error=${err}`);
    });

    const eventMap: Record<string, PublishEvent> = {
      uploading: PublishEvent.ITEM_STARTED,
      publishing: PublishEvent.TASK_PUBLISHING,
      audit: PublishEvent.TASK_AUDIT,
    };

    const eventType = eventMap[status];
    if (eventType) {
      this.eventBus.emit(eventType, { taskId, status, error } as any);
    }

    logger.info(`任务状态标记: taskId=${taskId} status=${status}`);
  }

  async preCheckAccounts(request: BatchPublishRequest): Promise<{ healthy: string[]; unhealthy: string[] }> {
    const healthy: string[] = [];
    const unhealthy: string[] = [];

    for (const groupId of request.groupIds) {
      const accountsInGroup = await accountRepo.findWhere({ status: 'active' } as Partial<DbAccount>);
      const groupRules = await groupPublishRuleRepo.findEnabledByGroup(groupId);

      for (const rule of groupRules) {
        const accounts = accountsInGroup.filter((a) => a.platform === rule.platform);
        for (const account of accounts) {
          const isValid = await accountService.validateCookie(account.id);
          if (isValid) {
            healthy.push(account.id);
          } else {
            unhealthy.push(account.id);
          }
        }
      }
    }

    return { healthy: [...new Set(healthy)], unhealthy: [...new Set(unhealthy)] };
  }

  async getPublishHistory(filters: { platform?: string; accountId?: string; startDate?: string; endDate?: string }): Promise<PublishTask[]> {
    const conditions: Partial<DbPublishTask> = {};
    if (filters.platform) conditions.platform = filters.platform;
    if (filters.accountId) conditions.account_id = filters.accountId;

    let tasks = await publishTaskRepo.findWhere(conditions);

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      tasks = tasks.filter((t) => new Date(t.created_at) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      tasks = tasks.filter((t) => new Date(t.created_at) <= end);
    }

    return tasks.map((t) => this.dbRowToTask(t));
  }

  async listTasks(filter: TaskFilter): Promise<TaskListResult> {
    if (!isDatabaseAvailable()) {
      logger.warn('[listTasks] 数据库不可用');
      return { items: [], total: 0, taskTotal: 0 };
    }

    const db = getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];
    const fromClause = 'FROM publish_tasks pt LEFT JOIN accounts a ON pt.account_id = a.id';

    if (filter.status && filter.status.length > 0) {
      conditions.push(`pt.status IN (${filter.status.map(() => '?').join(',')})`);
      params.push(...filter.status);
    }
    if (filter.platform && filter.platform.length > 0) {
      conditions.push(`pt.platform IN (${filter.platform.map(() => '?').join(',')})`);
      params.push(...filter.platform);
    }
    if (filter.planId) {
      conditions.push('pt.content_id = ?');
      params.push(filter.planId);
    }
    if (filter.dateFrom) {
      conditions.push('date(pt.created_at) >= date(?)');
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      conditions.push('date(pt.created_at) <= date(?)');
      params.push(filter.dateTo);
    }
    if (filter.search) {
      conditions.push(
        '(pt.content_id LIKE ? OR pt.title LIKE ? OR pt.description LIKE ? ' +
        'OR pt.error_message LIKE ? OR a.nickname LIKE ?)'
      );
      const like = `%${filter.search}%`;
      params.push(like, like, like, like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const groupExpression = `
      CASE
        WHEN pt.content_id IS NULL OR pt.content_id = '' THEN 'task:' || pt.id
        ELSE 'content:' || pt.content_id
      END
    `.trim();

    const taskCountRow = db.prepare(
      `SELECT COUNT(*) as total ${fromClause} ${whereClause}`
    ).get(...params) as { total: number };

    const statusRows = db.prepare(
      `SELECT pt.status, COUNT(*) as count ${fromClause} ${whereClause} GROUP BY pt.status`
    ).all(...params) as { status: string; count: number }[];
    const statusBreakdown: Record<string, number> = {};
    for (const r of statusRows) {
      statusBreakdown[r.status] = r.count;
    }

    let rows: (DbPublishTask & { account_name?: string })[] = [];
    let total = taskCountRow.total;

    if (filter.groupByContent) {
      const groupCountRow = db.prepare(`
        SELECT COUNT(*) as total
        FROM (
          SELECT ${groupExpression} as content_key
          ${fromClause}
          ${whereClause}
          GROUP BY content_key
        )
      `).get(...params) as { total: number };
      total = groupCountRow.total;

      const groupRows = db.prepare(`
        SELECT
          ${groupExpression} as content_key,
          MAX(COALESCE(julianday(pt.created_at), 0)) as latest_created_sort,
          MAX(pt.rowid) as latest_rowid
        ${fromClause}
        ${whereClause}
        GROUP BY content_key
        ORDER BY latest_created_sort DESC, latest_rowid DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as { content_key: string }[];
      const contentKeys = groupRows.map((row) => row.content_key);

      if (contentKeys.length > 0) {
        const keyPlaceholders = contentKeys.map(() => '?').join(',');
        rows = db.prepare(`
          SELECT pt.*, a.nickname as account_name
          ${fromClause}
          ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} ${groupExpression} IN (${keyPlaceholders})
          ORDER BY
            CASE ${groupExpression}
              ${contentKeys.map((_, index) => `WHEN ? THEN ${index}`).join(' ')}
              ELSE ${contentKeys.length}
            END,
            COALESCE(julianday(pt.created_at), 0) DESC,
            pt.rowid DESC
        `).all(...params, ...contentKeys, ...contentKeys) as (DbPublishTask & { account_name?: string })[];
      }
    } else {
      rows = db.prepare(`
        SELECT pt.*, a.nickname as account_name
        ${fromClause}
        ${whereClause}
        ORDER BY COALESCE(julianday(pt.created_at), 0) DESC, pt.rowid DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as (DbPublishTask & { account_name?: string })[];
    }

    const items = rows.map((row) => this.dbRowToTask(row as DbPublishTask));
    return {
      items,
      total,
      taskTotal: taskCountRow.total,
      statusBreakdown,
    };
  }

  async retryTask(taskId: string): Promise<PublishResult> {
    return this.executeNow(taskId, { finalOnFailure: true });
  }

  /**
   * 重新发布：基于已有任务创建全新任务条目
   * - 读取原任务的 contentId、accountId、platform 等参数
   * - 创建新任务（新的 taskId，状态 pending）
   * - 不自动执行，仅创建任务条目
   */
  async republishTask(taskId: string): Promise<PublishTask> {
    const originalTask = await publishTaskRepo.findById(taskId);
    if (!originalTask) throw new Error(`发布任务不存在: ${taskId}`);

    const now = nowISO();
    const newTaskId = randomUUID();

    // 解析原任务的 metadata
    let metadata: Record<string, unknown> = {};
    if ((originalTask as any).metadata) {
      try {
        metadata = JSON.parse((originalTask as any).metadata);
      } catch { /* ignore */ }
    }

    // 解析原任务的 tags
    let tags: string[] = [];
    if ((originalTask as any).tags) {
      try {
        tags = JSON.parse((originalTask as any).tags);
      } catch { /* ignore */ }
    }

    const publishMode = (originalTask.publish_mode || 'client') as PublishMode;
    const accountId = (originalTask as any).account_id || originalTask.account_id || '';

    const dbRow = {
      id: newTaskId,
      content_id: originalTask.content_id,
      group_id: (originalTask as any).group_id || null,
      platform: originalTask.platform,
      account_id: accountId,
      proxy_id: null,
      fingerprint_id: null,
      scheduled_at: null,                    // 重新发布不自动定时，由用户手动设置
      publish_mode: publishMode,
      status: 'pending' as PublishTaskStatus,
      result: null,
      error_message: null,
      retry_count: 0,
      max_retries: originalTask.max_retries || 3,
      created_at: now,
      updated_at: now,
      title: (originalTask as any).title || '',
      description: (originalTask as any).description || '',
      tags: JSON.stringify(tags),
      cover_url: (originalTask as any).cover_url || null,
      source: 'republish',                    // 标记为重新发布来源
      metadata: JSON.stringify({ ...metadata, republishFrom: taskId }),
    };

    await publishTaskRepo.insert(dbRow);

    const newTask = this.dbRowToTask(dbRow as unknown as DbPublishTask);

    logger.info(`重新发布任务已创建: newTaskId=${newTaskId} from=${taskId} platform=${originalTask.platform}`);

    const payload: TaskCreatedPayload = {
      taskId: newTaskId,
      contentId: originalTask.content_id,
      platform: originalTask.platform,
      accountId,
      publishMode,
    };
    this.eventBus.emit(PublishEvent.TASK_CREATED, payload);

    return newTask;
  }

  async batchRetry(taskIds: string[]): Promise<{ taskId: string; result: PublishResult }[]> {
    const CONCURRENT_LIMIT = 5;
    const results: { taskId: string; result: PublishResult }[] = [];

    for (let i = 0; i < taskIds.length; i += CONCURRENT_LIMIT) {
      const batch = taskIds.slice(i, i + CONCURRENT_LIMIT);
      const batchResults = await Promise.all(
        batch.map(async (taskId) => {
          try {
            const result = await this.retryTask(taskId);
            return { taskId, result };
          } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
            return { taskId, result: { success: false, error: err instanceof Error ? err.message : String(err) } };
          }
        }),
      );
      results.push(...batchResults);
    }

    return results;
  }

  async batchCancel(taskIds: string[]): Promise<{ taskId: string; success: boolean; error?: string }[]> {
    return Promise.all(
      taskIds.map(async (taskId) => {
        try {
          await this.cancelPublish(taskId);
          return { taskId, success: true };
        } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
          return { taskId, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

  async batchDelete(taskIds: string[]): Promise<{ taskId: string; success: boolean; error?: string }[]> {
    return Promise.all(
      taskIds.map(async (taskId) => {
        try {
          await this.deleteTask(taskId);
          return { taskId, success: true };
        } catch (err) {
      const platformErr = toPlatformError(err);
      logger.warn(`PlatformError: ${platformErr.category} retryable=${platformErr.retryable}`);
          return { taskId, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

  // ─── 超时任务监控 ─────────────────────────────────────────

  private startStuckTaskMonitor(): void {
    if (this.stuckTaskMonitorTimer) return;

    this.stuckTaskMonitorTimer = setInterval(() => {
      this.forceFailStuckTasks().catch((err) => {
        logger.error(`超时任务扫描失败: ${err}`);
      });
    }, PublishService.STUCK_CHECK_INTERVAL_MS);

    logger.info(`超时任务监控已启动 (阈值=${PublishService.TASK_TIMEOUT_MS / 1000}s, 检查间隔=${PublishService.STUCK_CHECK_INTERVAL_MS / 1000}s)`);
  }

  stopStuckTaskMonitor(): void {
    if (this.stuckTaskMonitorTimer) {
      clearInterval(this.stuckTaskMonitorTimer);
      this.stuckTaskMonitorTimer = null;
      logger.info('超时任务监控已停止');
    }
  }

  private async recoverStaleRunningTasks(): Promise<void> {
    const runningPage = await publishTaskRepo.findByStatus('running', { pageSize: 200 });
    if (runningPage.total === 0) return;

    logger.info(`发现 ${runningPage.total} 个 running 状态任务，执行恢复...`);

    for (const task of runningPage.data) {
      const startedAt = (task as any).started_at as string | undefined;

      if (!startedAt) {
        logger.warn(`running 任务缺少 started_at，强制失败: taskId=${task.id}`);
        await publishTaskRepo.markFinalFailed(task.id, '应用重启，任务状态已失效');
        const errMsg = '应用重启，任务状态已失效';
        this.eventBus.emit(PublishEvent.TASK_FAILED, {
          taskId: task.id,
          error: errMsg,
          retryCount: task.retry_count,
          maxRetries: task.max_retries,
        } as TaskFailedPayload);
        this.broadcastTaskFailed(task.id, errMsg);
        continue;
      }

      const elapsed = Date.now() - new Date(startedAt).getTime();
      if (elapsed >= PublishService.TASK_TIMEOUT_MS) {
        const errMsg = `任务执行超时 (${Math.round(elapsed / 60000)}分钟)，已强制终止`;
        logger.warn(`重启后发现超时任务 (${Math.round(elapsed / 60000)}分钟)，强制失败: taskId=${task.id}`);
        await publishTaskRepo.markFinalFailed(task.id, errMsg);
        this.eventBus.emit(PublishEvent.TASK_FAILED, {
          taskId: task.id,
          error: errMsg,
          retryCount: task.retry_count,
          maxRetries: task.max_retries,
        } as TaskFailedPayload);
        this.broadcastTaskFailed(task.id, errMsg);
      }
    }

    logger.info('残留任务恢复完成');
  }

  private async forceFailStuckTasks(): Promise<number> {
    const runningPage = await publishTaskRepo.findByStatus('running', { pageSize: 200 });
    if (runningPage.total === 0) return 0;

    const now = Date.now();
    let failedCount = 0;

    for (const task of runningPage.data) {
      const startedAt = (task as any).started_at as string | undefined;
      if (!startedAt) {
        logger.warn(`running 任务缺少 started_at，强制失败: taskId=${task.id}`);
        this.executingTasks.delete(task.id);
        this.taskScheduler.cancel(task.id);
        const errMsg = '任务状态异常（缺少启动时间），已强制终止';
        await publishTaskRepo.markFinalFailed(task.id, errMsg);
        this.eventBus.emit(PublishEvent.TASK_FAILED, {
          taskId: task.id,
          error: errMsg,
          retryCount: task.retry_count,
          maxRetries: task.max_retries,
        } as TaskFailedPayload);
        this.broadcastTaskFailed(task.id, errMsg);
        failedCount++;
        continue;
      }

      const elapsed = now - new Date(startedAt).getTime();
      if (elapsed < PublishService.TASK_TIMEOUT_MS) continue;

      logger.warn(`任务执行超时 (${Math.round(elapsed / 1000)}s)，强制失败: taskId=${task.id} title=${(task as any).title || ''}`);

      this.executingTasks.delete(task.id);
      this.taskScheduler.cancel(task.id);

      const errMsg = `任务执行超时 (${Math.round(elapsed / 60000)}分钟)，已强制终止`;
      await publishTaskRepo.markFinalFailed(task.id, errMsg);

      this.eventBus.emit(PublishEvent.TASK_FAILED, {
        taskId: task.id,
        error: errMsg,
        retryCount: task.retry_count,
        maxRetries: task.max_retries,
      } as TaskFailedPayload);
      this.broadcastTaskFailed(task.id, errMsg);

      failedCount++;
    }

    if (failedCount > 0) {
      logger.info(`超时任务扫描完成: 强制失败 ${failedCount} 个任务`);
    }

    return failedCount;
  }

  private broadcastTaskFailed(taskId: string, error: string): void {
    const busEvent: BusPublishEvent = {
      type: 'task_failed',
      taskId,
      platform: '',
      accountId: '',
      message: error,
      timestamp: Date.now(),
    };
    this.eventBus.broadcast(busEvent);
  }
}

export const publishService = PublishService.getInstance();
