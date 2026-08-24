import type { Account, PublishTask, FingerprintTemplate } from '@electron/data/types';
import type { ITask } from '@electron/core/types/task';

export function createMockAccount(overrides?: Partial<Account>): Account {
  return {
    id: 'account_001',
    platform: 'douyin',
    nickname: '测试账号',
    avatar_url: null,
    cookie_path: '/tmp/cookies/account_001.json',
    cookie_valid: 1,
    last_login: new Date().toISOString(),
    last_publish: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockTask(overrides?: Partial<ITask>): ITask {
  return {
    id: 'task_001',
    type: 'publish',
    platform: 'douyin',
    accountId: 'account_001',
    priority: 5,
    payload: { contentId: 'content_001' },
    status: 'queued',
    createdAt: new Date().toISOString(),
    scheduledAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

export function createMockPublishTask(overrides?: Partial<PublishTask>): PublishTask {
  return {
    id: 'pub_task_001',
    content_id: 'content_001',
    group_id: 'group_001',
    platform: 'douyin',
    account_id: 'account_001',
    proxy_id: null,
    fingerprint_id: null,
    scheduled_at: null,
    publish_mode: 'client_direct',
    status: 'pending',
    result: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockFingerprintTemplate(overrides?: Partial<FingerprintTemplate>): FingerprintTemplate {
  return {
    id: 'fp_001',
    name: '默认模板',
    seed: 123456789,
    platform: 'windows',
    platform_version: null,
    brand: 'Chrome',
    brand_version: null,
    hardware_concurrency: 8,
    gpu_vendor: 'Intel Inc.',
    gpu_renderer: 'Intel Iris OpenGL Engine',
    disable_non_proxied_udp: 1,
    lang: 'zh-CN',
    accept_lang: 'zh-CN,en-US',
    timezone: 'Asia/Shanghai',
    custom_params: '[]',
    user_agent: null,
    screen_width: 1920,
    screen_height: 1080,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
