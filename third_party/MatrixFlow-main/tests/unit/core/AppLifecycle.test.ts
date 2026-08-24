import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppLifecycle } from '@electron/core/AppLifecycle';
import { ConfigManager } from '@electron/core/ConfigManager';
import { EventBus } from '@electron/core/EventBus';

describe('AppLifecycle', () => {
  let lifecycle: AppLifecycle;
  let mockConfig: { initialize: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let mockEventBus: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockConfig = {
      initialize: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockEventBus = {
      emit: vi.fn(),
    };

    lifecycle = new AppLifecycle(
      mockConfig as unknown as ConfigManager,
      mockEventBus as unknown as EventBus,
    );
  });

  describe('constructor', () => {
    it('should not be initialized after construction', () => {
      expect(lifecycle.isInitialized()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should call config.initialize and emit app:initialized', async () => {
      await lifecycle.initialize();

      expect(mockConfig.initialize).toHaveBeenCalledOnce();
      expect(mockEventBus.emit).toHaveBeenCalledWith('app:initialized');
      expect(lifecycle.isInitialized()).toBe(true);
    });

    it('should only initialize once', async () => {
      await lifecycle.initialize();
      await lifecycle.initialize();

      expect(mockConfig.initialize).toHaveBeenCalledOnce();
      expect(mockEventBus.emit).toHaveBeenCalledOnce();
    });
  });

  describe('shutdown', () => {
    it('should emit app:shutdown and save config', async () => {
      await lifecycle.initialize();
      await lifecycle.shutdown();

      expect(mockEventBus.emit).toHaveBeenCalledWith('app:shutdown');
      expect(mockConfig.save).toHaveBeenCalledOnce();
      expect(lifecycle.isInitialized()).toBe(false);
    });

    it('should allow re-initialization after shutdown', async () => {
      await lifecycle.initialize();
      await lifecycle.shutdown();

      expect(lifecycle.isInitialized()).toBe(false);

      await lifecycle.initialize();

      expect(lifecycle.isInitialized()).toBe(true);
      expect(mockConfig.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('isInitialized', () => {
    it('returns false before initialization', () => {
      expect(lifecycle.isInitialized()).toBe(false);
    });

    it('returns true after initialization', async () => {
      await lifecycle.initialize();
      expect(lifecycle.isInitialized()).toBe(true);
    });

    it('returns false after shutdown', async () => {
      await lifecycle.initialize();
      await lifecycle.shutdown();
      expect(lifecycle.isInitialized()).toBe(false);
    });
  });

  describe('getInstance', () => {
    beforeEach(() => {
      (AppLifecycle as unknown as { instance: unknown }).instance = undefined;
    });

    it('should return a singleton instance', () => {
      const a = AppLifecycle.getInstance();
      const b = AppLifecycle.getInstance();
      expect(a).toBe(b);
    });

    it('should be an AppLifecycle instance', () => {
      const instance = AppLifecycle.getInstance();
      expect(instance).toBeInstanceOf(AppLifecycle);
    });
  });
});
