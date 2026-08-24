/**
 * 发布管理服务类型定义
 *
 * 涵盖双路径发布（服务端/客户端）、发布任务、状态追踪、规则应用及事件。
 */

import type { PublishResult as PlatformPublishResult } from '../../platform/base/types';
import type { PublishTask as DbPublishTask } from '../../data/types';

export type PublishMode = 'server' | 'client';
export type PublishTaskStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';
export type PublishVisibility = 'public' | 'private' | 'friends' | 'followers';

export interface PublishRequest {
  contentId: string;
  platform: string;
  accountId: string;
  scheduledAt?: Date;
  publishMode: PublishMode;
  title?: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  source?: string;
  headless?: boolean;
  metadata: {
    title?: string;
    description?: string;
    tags?: string[];
    visibility?: PublishVisibility;
    coverUrl?: string;
    location?: string;
    declaration?: string;
    scheduleMode?: 'immediate' | 'scheduled';
    scheduledAt?: string;
    allowComment?: boolean;
    allowShare?: boolean;
    allowSameFrame?: boolean;
    allowDownload?: boolean;
    showInCity?: boolean;
    debugSteps?: boolean;
    dryRun?: boolean;
    autoExecute?: boolean;
  };
}

export interface BatchPublishRequest {
  contentId: string;
  groupIds: string[];
  scheduledAt?: Date;
  publishMode: PublishMode;
  dryRun?: boolean;
  prePublishCheck?: boolean;
}

// ─── 发布任务 ────────────────────────────────────────────────

export interface PublishTask {
  id: string;
  contentId: string;
  platform: string;
  accountId: string;
  scheduledAt?: Date;
  publishMode: PublishMode;
  status: PublishTaskStatus;
  result?: PublishResult;
  retryCount: number;
  maxRetries: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  source?: string;
  accountName?: string;
}

// ─── 发布结果 ────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  videoId?: string;
  publishUrl?: string;
  error?: string;
  publishedAt?: Date;
}

// ─── 发布任务状态（含子项进度） ────────────────────────────────

export interface PublishTaskStatusDetail {
  taskId: string;
  status: PublishTaskStatus;
  publishMode: PublishMode;
  scheduledAt?: Date;
  result?: PublishResult;
  items: PublishTaskItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishTaskItem {
  itemId: string;
  accountId: string;
  platform: string;
  status: string;
  videoId?: string;
  publishUrl?: string;
  error?: string;
}

// ─── 事件名 ──────────────────────────────────────────────────

export enum PublishEvent {
  TASK_CREATED = 'publish:task-created',
  TASK_SCHEDULED = 'publish:task-scheduled',
  TASK_STARTED = 'publish:task-started',
  TASK_UPLOADING = 'publish:task-uploading',
  TASK_PUBLISHING = 'publish:task-publishing',
  TASK_AUDIT = 'publish:task-audit',
  TASK_UPDATED = 'publish:task-updated',
  TASK_COMPLETED = 'publish:task-completed',
  TASK_FAILED = 'publish:task-failed',
  TASK_CANCELLED = 'publish:task-cancelled',
  ITEM_STARTED = 'publish:item-started',
  ITEM_COMPLETED = 'publish:item-completed',
  ITEM_FAILED = 'publish:item-failed',
  RULES_APPLIED = 'publish:rules-applied',
}

// ─── 事件载荷 ────────────────────────────────────────────────

export interface TaskCreatedPayload {
  taskId: string;
  contentId: string;
  platform: string;
  accountId: string;
  publishMode: PublishMode;
}

export interface TaskScheduledPayload {
  taskId: string;
  scheduledAt: Date;
}

export interface TaskStartedPayload {
  taskId: string;
  publishMode: PublishMode;
}

export interface TaskCompletedPayload {
  taskId: string;
  result: PublishResult;
}

export interface TaskFailedPayload {
  taskId: string;
  error: string;
  retryCount: number;
  maxRetries: number;
}

export interface TaskCancelledPayload {
  taskId: string;
}

export interface ItemStartedPayload {
  taskId: string;
  itemId: string;
  accountId: string;
  platform: string;
}

export interface ItemCompletedPayload {
  taskId: string;
  itemId: string;
  videoId?: string;
  publishUrl?: string;
}

export interface ItemFailedPayload {
  taskId: string;
  itemId: string;
  error: string;
}

export interface RulesAppliedPayload {
  taskId: string;
  groupId: string;
  rulesCount: number;
}

// ─── 任务过滤 ────────────────────────────────────────────────

export interface TaskFilter {
  status?: PublishTaskStatus[];
  platform?: string[];
  planId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /** 任务列表按内容聚合展示时，分页单位使用内容而不是任务明细。 */
  groupByContent?: boolean;
}

export interface TaskListResult {
  items: PublishTask[];
  /** 当前分页口径下的总数：按内容分页时为内容数，否则为任务数。 */
  total: number;
  /** 筛选条件下的任务明细总数。 */
  taskTotal?: number;
  statusBreakdown?: Record<string, number>;
}

// ─── 服务接口 ────────────────────────────────────────────────

export interface IPublishService {
  // 发布任务创建
  createPublishTask(request: PublishRequest): Promise<PublishTask>;
  createBatchPublishTask(request: BatchPublishRequest): Promise<PublishTask[]>;

  // 发布调度
  schedulePublish(taskId: string, scheduledAt: Date): Promise<void>;
  executeNow(taskId: string, options?: { finalOnFailure?: boolean }): Promise<PublishResult>;
  cancelPublish(taskId: string): Promise<void>;

  // 双路径发布
  publishToServer(taskId: string): Promise<PublishResult>;
  publishFromClient(taskId: string): Promise<PublishResult>;

  // 状态追踪
  getTaskStatus(taskId: string): Promise<PublishTaskStatusDetail>;
  getAccountTasks(accountId: string): Promise<PublishTask[]>;
  getContentTasks(contentId: string): Promise<PublishTask[]>;

  // 发布规则应用
  applyGroupRules(taskId: string, groupId: string): Promise<void>;

  // 预检和历史
  preCheckAccounts(request: BatchPublishRequest): Promise<{ healthy: string[]; unhealthy: string[] }>;
  getPublishHistory(filters: { platform?: string; accountId?: string; startDate?: string; endDate?: string }): Promise<PublishTask[]>;

  // 任务列表与操作
  listTasks(filter: TaskFilter): Promise<TaskListResult>;
  retryTask(taskId: string): Promise<PublishResult>;
  batchRetry(taskIds: string[]): Promise<{ taskId: string; result: PublishResult }[]>;
  batchCancel(taskIds: string[]): Promise<{ taskId: string; success: boolean; error?: string }[]>;
}
