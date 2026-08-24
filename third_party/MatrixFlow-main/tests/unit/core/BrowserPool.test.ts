import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserPool } from '@electron/core/BrowserPool';
import { EventBus } from '@electron/core/EventBus';
import { BrowserPoolEvent, ContextState, DEFAULT_POOL_CONFIG } from '@electron/core/types/browser';
import type { ManagedContext, PooledBrowser } from '@electron/core/types/browser';

const mockContextClose = vi.fn(() => Promise.resolve());
const mockBrowserClose = vi.fn(() => Promise.resolve());
const mockNewContext = vi.fn(() => Promise.resolve({ close: mockContextClose }));

vi.mock('@electron/core/BrowserFactory', () => {
  return {
    BrowserFactory: vi.fn().mockImplementation(() => ({
      createBrowser: vi.fn(() =>
        Promise.resolve({
          newContext: mockNewContext,
          close: mockBrowserClose,
        })
      ),
      updateConfig: vi.fn(),
      getMode: vi.fn(() => 'embedded'),
    })),
  };
});

vi.mock('@electron/core/BrowserContext', () => ({
  BrowserContext: vi.fn().mockImplementation((managed: ManagedContext) => ({
    accountId: managed.accountId,
    state: managed.state,
    raw: managed.context,
    lastActiveAt: managed.lastActiveAt,
    newPage: vi.fn(),
    pages: vi.fn(() => Promise.resolve([])),
    closePage: vi.fn(),
    addCookies: vi.fn(),
    cookies: vi.fn(),
    clearCookies: vi.fn(),
    touch: vi.fn(),
    isIdle: vi.fn(),
    isActive: vi.fn(() => managed.state === 'active'),
  })),
}));

describe('BrowserPool', () => {
  let pool: BrowserPool;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockContextClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
    mockNewContext.mockResolvedValue({ close: mockContextClose });
    (BrowserPool as any).instance = null;
    pool = BrowserPool.getInstance({
      maxActiveContexts: 3,
      maxContextsPerBrowser: 2,
      idleTimeoutMs: 60_000,
      memoryCheckIntervalMs: 1_000,
    });
  });

  afterEach(() => {
    pool.shutdown();
    (BrowserPool as any).instance = null;
    vi.useRealTimers();
  });

  describe('getInstance', () => {
    it('返回单例实例', () => {
      const a = BrowserPool.getInstance();
      const b = BrowserPool.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('初始化成功', async () => {
      await pool.initialize();
      expect(pool.getStats()).toBeDefined();
    });

    it('重复初始化不会报错', async () => {
      await pool.initialize();
      await expect(pool.initialize()).resolves.toBeUndefined();
    });

    it('启动内存监控定时器', async () => {
      await pool.initialize();
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(BrowserPoolEvent.MEMORY_HIGH, handler);

      vi.advanceTimersByTime(1_000);

      unsub();
    });

    it('启动空闲回收定时器', async () => {
      await pool.initialize();
      // Reap timer runs every 30s
      vi.advanceTimersByTime(30_000);
      // Should not throw
    });
  });

  describe('acquireContext', () => {
    it('未初始化时抛出异常', async () => {
      await expect(pool.acquireContext('acc1')).rejects.toThrow('BrowserPool not initialized');
    });

    it('关闭中时抛出异常', async () => {
      await pool.initialize();
      pool.shutdown();
      // After shutdown, shuttingDown is false but initialized is false
      // Need to test during shutdown phase
      (BrowserPool as any).instance = null;
      pool = BrowserPool.getInstance();
      await pool.initialize();
      // Manually set shuttingDown
      (pool as any).shuttingDown = true;
      await expect(pool.acquireContext('acc1')).rejects.toThrow('BrowserPool is shutting down');
    });

    it('获取上下文成功', async () => {
      await pool.initialize();
      const ctx = await pool.acquireContext('acc1');

      expect(ctx).toBeDefined();
      expect(ctx.accountId).toBe('acc1');
    });

    it('重复获取同一账号返回复用上下文', async () => {
      await pool.initialize();
      const ctx1 = await pool.acquireContext('acc1');
      const ctx2 = await pool.acquireContext('acc1');

      // Same underlying context (reused)
      const stats = pool.getStats();
      expect(stats.accountBindings).toBe(1);
    });

    it('发出 CONTEXT_ACQUIRED 事件', async () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(BrowserPoolEvent.CONTEXT_ACQUIRED, handler);

      await pool.initialize();
      await pool.acquireContext('acc1');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc1' }));
      unsub();
    });

    it('创建新 Browser 实例当所有 Browser 已满', async () => {
      await pool.initialize();
      // maxContextsPerBrowser = 2
      await pool.acquireContext('acc1');
      await pool.acquireContext('acc2');
      await pool.acquireContext('acc3');

      const stats = pool.getStats();
      expect(stats.totalBrowsers).toBeGreaterThanOrEqual(2);
    });

    it('超出 maxActiveContexts 时逐出最旧空闲上下文', async () => {
      await pool.initialize();
      // maxActiveContexts = 3
      const ctx1 = await pool.acquireContext('acc1');
      await pool.acquireContext('acc2');
      await pool.acquireContext('acc3');

      // Release acc1 to make it idle
      pool.releaseContext('acc1');

      // Now acquire a 4th — should evict idle acc1
      await pool.acquireContext('acc4');

      const stats = pool.getStats();
      expect(stats.activeContexts).toBe(3);
    });

    it('发出 BROWSER_CREATED 事件当创建新浏览器', async () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(BrowserPoolEvent.BROWSER_CREATED, handler);

      await pool.initialize();
      await pool.acquireContext('acc1');

      expect(handler).toHaveBeenCalled();
      unsub();
    });
  });

  describe('releaseContext', () => {
    it('释放已获取的上下文', async () => {
      await pool.initialize();
      await pool.acquireContext('acc1');

      pool.releaseContext('acc1');

      const stats = pool.getStats();
      expect(stats.idleContexts).toBe(1);
      expect(stats.activeContexts).toBe(0);
    });

    it('多次释放递减 refCount', async () => {
      await pool.initialize();
      await pool.acquireContext('acc1');
      await pool.acquireContext('acc1');

      pool.releaseContext('acc1');
      const stats1 = pool.getStats();
      expect(stats1.activeContexts).toBe(1);

      pool.releaseContext('acc1');
      const stats2 = pool.getStats();
      expect(stats2.idleContexts).toBe(1);
    });

    it('释放未知 accountId 不报错', () => {
      expect(() => pool.releaseContext('nonexistent')).not.toThrow();
    });

    it('发出 CONTEXT_RELEASED 事件', async () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(BrowserPoolEvent.CONTEXT_RELEASED, handler);

      await pool.initialize();
      await pool.acquireContext('acc1');
      pool.releaseContext('acc1');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc1' }));
      unsub();
    });
  });

  describe('getStats', () => {
    it('初始状态正确', async () => {
      await pool.initialize();
      const stats = pool.getStats();

      expect(stats.totalBrowsers).toBe(0);
      expect(stats.activeContexts).toBe(0);
      expect(stats.idleContexts).toBe(0);
      expect(stats.accountBindings).toBe(0);
    });

    it('获取上下文后统计正确', async () => {
      await pool.initialize();
      await pool.acquireContext('acc1');
      await pool.acquireContext('acc2');

      const stats = pool.getStats();
      expect(stats.activeContexts).toBe(2);
      expect(stats.accountBindings).toBe(2);
      expect(stats.totalBrowsers).toBeGreaterThanOrEqual(1);
    });

    it('释放后 idle 递增', async () => {
      await pool.initialize();
      await pool.acquireContext('acc1');
      pool.releaseContext('acc1');

      const stats = pool.getStats();
      expect(stats.idleContexts).toBe(1);
      expect(stats.activeContexts).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('关闭所有浏览器和上下文', async () => {
      await pool.initialize();
      await pool.acquireContext('acc1');
      await pool.acquireContext('acc2');

      await pool.shutdown();

      const stats = pool.getStats();
      expect(stats.totalBrowsers).toBe(0);
      expect(stats.activeContexts).toBe(0);
      expect(stats.idleContexts).toBe(0);
      expect(stats.accountBindings).toBe(0);
    });

    it('清除所有映射', async () => {
      await pool.initialize();
      await pool.acquireContext('acc1');

      await pool.shutdown();

      const stats = pool.getStats();
      expect(stats.accountBindings).toBe(0);
    });

    it('停止内存监控和回收定时器', async () => {
      await pool.initialize();
      await pool.shutdown();

      expect((pool as any).memoryTimer).toBeNull();
      expect((pool as any).reapTimer).toBeNull();
    });

    it('重复 shutdown 不报错', async () => {
      await pool.initialize();
      await pool.shutdown();
      await expect(pool.shutdown()).resolves.toBeUndefined();
    });

    it('发出 BROWSER_CLOSED 事件', async () => {
      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(BrowserPoolEvent.BROWSER_CLOSED, handler);

      await pool.initialize();
      await pool.acquireContext('acc1');
      await pool.shutdown();

      expect(handler).toHaveBeenCalled();
      unsub();
    });
  });

  describe('idle reaping', () => {
    it('空闲超时的上下文被回收', async () => {
      // Use a short idleTimeoutMs
      (BrowserPool as any).instance = null;
      pool = BrowserPool.getInstance({
        maxActiveContexts: 10,
        maxContextsPerBrowser: 10,
        idleTimeoutMs: 1000,
        memoryCheckIntervalMs: 60_000,
      });

      await pool.initialize();
      await pool.acquireContext('acc1');
      pool.releaseContext('acc1');

      const statsBefore = pool.getStats();
      expect(statsBefore.idleContexts).toBe(1);

      // Advance past idle timeout (30s reaper interval + idleTimeoutMs)
      vi.advanceTimersByTime(35_000);

      const statsAfter = pool.getStats();
      expect(statsAfter.idleContexts).toBe(0);

      await pool.shutdown();
    });
  });

  describe('memory monitoring', () => {
    it('内存超过水位时发出 MEMORY_HIGH 事件', async () => {
      (BrowserPool as any).instance = null;
      pool = BrowserPool.getInstance({
        maxActiveContexts: 10,
        maxContextsPerBrowser: 10,
        memoryWatermarkPercent: 0,
        memoryCheckIntervalMs: 1_000,
      });

      const eventBus = EventBus.getInstance();
      const handler = vi.fn();
      const unsub = eventBus.on(BrowserPoolEvent.MEMORY_HIGH, handler);

      await pool.initialize();
      vi.advanceTimersByTime(1_000);

      expect(handler).toHaveBeenCalled();

      unsub();
      await pool.shutdown();
    });
  });

  describe('setMode', () => {
    it('更新 BrowserFactory 配置', async () => {
      await pool.initialize();
      expect(() => pool.setMode('external_chrome')).not.toThrow();
    });
  });
});
