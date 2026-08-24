import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataService } from '@electron/services/DataService';

const mockDb = vi.hoisted(() => ({
  exec: vi.fn(),
  prepare: vi.fn(),
  transaction: vi.fn((fn: Function) => fn()),
}));

const eventBusEmit = vi.hoisted(() => vi.fn());

let dbAvailable = true;

vi.mock('@electron/core/Logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

vi.mock('@electron/core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emit: eventBusEmit,
      on: vi.fn(),
      off: vi.fn(),
    }),
  },
}));

vi.mock('@electron/data/Database', () => ({
  initDatabase: vi.fn(() => mockDb),
  closeDatabase: vi.fn(),
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
  runInTransaction: vi.fn((fn: Function) => fn()),
}));

vi.mock('@electron/data/repositories/AccountRepository', () => ({
  accountRepo: {
    findById: vi.fn(),
    findByPlatform: vi.fn().mockResolvedValue([]),
    findActive: vi.fn().mockResolvedValue([]),
    findWhere: vi.fn().mockResolvedValue([]),
    findOrdered: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    deleteById: vi.fn().mockResolvedValue(true),
    findByType: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    search: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findPendingScheduled: vi.fn().mockResolvedValue([]),
    findByTaskId: vi.fn().mockResolvedValue([]),
    createBatch: vi.fn().mockResolvedValue([]),
    findByGroupId: vi.fn().mockResolvedValue([]),
    findEnabledByGroup: vi.fn().mockResolvedValue([]),
    findByCategory: vi.fn().mockResolvedValue([]),
    getRandomEnabled: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue({}),
    getStatsHistory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findEnabled: vi.fn().mockResolvedValue([]),
    findDueNow: vi.fn().mockResolvedValue([]),
    findByContentId: vi.fn().mockResolvedValue([]),
  },
  AccountRepository: class {},
}));

function resetSingleton(): void {
  (DataService as unknown as { instance: DataService | null }).instance = null;
}

function stmt(get?: unknown, all?: unknown[], run?: unknown) {
  return { get: vi.fn(() => get), all: vi.fn(() => all ?? []), run: vi.fn(() => run) };
}

describe('DataService', () => {
  let service: DataService;

  beforeEach(() => {
    resetSingleton();
    vi.clearAllMocks();
    dbAvailable = true;
    mockDb.prepare.mockReturnValue(stmt());
    service = DataService.getInstance();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const a = DataService.getInstance();
      const b = DataService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('calls initDatabase and sets initialized', () => {
      service.initialize();
      expect(service.isAvailable()).toBe(true);
    });

    it('is idempotent', () => {
      service.initialize();
      service.initialize();
      expect(service.isAvailable()).toBe(true);
    });

    it('isAvailable returns false when not initialized', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('isAvailable returns false when db unavailable', () => {
      service.initialize();
      dbAvailable = false;
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('close', () => {
    it('clears initialized state', () => {
      service.initialize();
      service.close();
      expect(service.isAvailable()).toBe(false);
    });
  });
});