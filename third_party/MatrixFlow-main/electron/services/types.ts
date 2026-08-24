// ============================================================
// 账号模块服务类型定义
// ============================================================

import type { BrowserContext, Browser } from 'patchright';

// ============================================================
// 平台类型
// ============================================================

export type Platform = 'douyin' | 'kuaishou' | 'bilibili' | 'xiaohongshu' | 'channels';

// ============================================================
// 浏览器配置
// ============================================================

export type BrowserType = 'embedded' | 'chrome' | 'fingerprint';

export interface BrowserConfig {
  type: BrowserType;
  executablePath?: string;  // 外置 Chrome 路径
  fingerprintId?: string;   // 指纹浏览器配置 ID
  headless?: boolean;
}

// ============================================================
// 平台 Cookie 配置
// ============================================================

export interface PlatformCookieConfig {
  domains: string[];
  requiredCookies: string[];
  loginUrl: string;
  maxTopics?: number;
}

export const PLATFORM_COOKIE_CONFIGS: Record<Platform, PlatformCookieConfig> = {
  douyin: {
    domains: ['.douyin.com'],
    requiredCookies: ['sessionid'],
    loginUrl: 'https://creator.douyin.com/',
  },
  kuaishou: {
    domains: ['.kuaishou.com'],
    requiredCookies: ['kuaishou.web.cp.api_ph', 'kuaishou.web.cp.api_st'],
    loginUrl: 'https://cp.kuaishou.com/article/publish/video',
  },
  bilibili: {
    domains: ['.bilibili.com'],
    requiredCookies: ['SESSDATA'],
    loginUrl: 'https://member.bilibili.com/platform/home',
  },
  xiaohongshu: {
    domains: ['.xiaohongshu.com', '.xhscdn.com'],
    requiredCookies: ['a1', 'customer-sso-sid'],
    loginUrl: 'https://creator.xiaohongshu.com/login',
  },
  channels: {
    domains: ['channels.weixin.qq.com'],
    requiredCookies: ['sessionid', 'wxuin'],
    loginUrl: 'https://channels.weixin.qq.com/platform',
    maxTopics: 10,
  },
};

// ============================================================
// 登录状态
// ============================================================

export type LoginStatus = 
  | 'pending'      // 待登录
  | 'logging_in'   // 登录中
  | 'detecting'    // 检测中
  | 'online'       // 在线
  | 'offline'      // 离线
  | 'failed'       // 登录失败
  | 'timeout'      // 超时
  | 'cancelled';   // 已取消

// ============================================================
// 登录结果
// ============================================================

export interface LoginResult {
  success: boolean;
  status: LoginStatus;
  accountId?: string;
  platform?: Platform;
  storagePath?: string;
  error?: string;
}

// ============================================================
// 浏览器启动器接口
// ============================================================

export interface IBrowserLauncher {
  /**
   * 获取浏览器类型
   */
  getBrowserType(): BrowserType;
  
  /**
   * 启动浏览器
   */
  launch(config: BrowserConfig, accountId: string): Promise<BrowserContext>;
  
  /**
   * 关闭浏览器
   */
  close(): Promise<void>;
  
  /**
   * 获取浏览器实例
   */
  getBrowser(): Browser | null;
  
  /**
   * 获取上下文实例
   */
  getContext(): BrowserContext | null;
}

// ============================================================
// 登录检测器接口
// ============================================================

export interface ILoginDetector {
  /**
   * 等待登录完成
   */
  waitForLogin(
    context: BrowserContext,
    platform: Platform,
    timeout: number
  ): Promise<boolean>;
  
  /**
   * 取消检测
   */
  cancel(): void;
}

// ============================================================
// 会话管理器接口
// ============================================================

export interface ISessionManager {
  /**
   * 保存会话
   * @returns 存储路径
   */
  save(
    context: BrowserContext,
    accountId: string,
    platform: Platform
  ): Promise<string>;
  
  /**
   * 加载会话
   */
  load(accountId: string): Promise<Record<string, unknown> | null>;
  
  /**
   * 验证会话有效性
   */
  validate(accountId: string): Promise<boolean>;
  
  /**
   * 删除会话
   */
  remove(accountId: string): Promise<void>;
}

// ============================================================
// IPC 事件类型
// ============================================================

export interface LoginStartPayload {
  platform: Platform;
  browserConfig: BrowserConfig;
  existingAccountId?: string;  // 覆盖登录时使用
}

export interface LoginSuccessPayload {
  accountId: string;
  platform: Platform;
  storagePath: string;
}

export interface LoginFailedPayload {
  error: string;
  reason: string;
  platform?: Platform;
}

export interface LoginTimeoutPayload {
  platform: Platform;
}

export interface LoginCancelledPayload {
  accountId?: string;
  reason: string;
}

export interface NetworkSlowPayload {
  currentInterval: number;
  consecutiveFailures: number;
}

// ============================================================
// 存储一致性
// ============================================================

export interface ConsistencyCheck {
  layer: 'storageState' | 'profile' | 'database';
  exists: boolean;
}

export interface ConsistencyResult {
  consistent: boolean;
  details: ConsistencyCheck[];
  repairAction?: 'relogin' | 'rebuild_db' | 'cleanup_and_relogin';
}

// ============================================================
// 登录锁
// ============================================================

export interface LoginLock {
  platform: Platform;
  acquiredAt: number;
}

export type DuplicateLoginAction = 'proceed' | 'overwrite' | 'cancel';

export interface DuplicateLoginDecision {
  action: DuplicateLoginAction;
  targetAccountId?: string;
}
