import { BaseRepository } from './BaseRepository';
import { runAsync } from '../Database';
import type { MonitorPlan } from '../types';

export class MonitorPlanRepository extends BaseRepository<MonitorPlan> {
  constructor() {
    super('monitor_plans');
  }

  async findEnabled(): Promise<MonitorPlan[]> {
    return this.findWhere({ enabled: 1 } as Partial<MonitorPlan>);
  }

  async findDueNow(): Promise<MonitorPlan[]> {
    return runAsync((db) => {
      const now = new Date().toISOString();
      return db
        .prepare("SELECT * FROM monitor_plans WHERE enabled = 1 AND next_run_at <= ? AND status = 'active'")
        .all(now) as MonitorPlan[];
    });
  }

  async updateLastRun(id: string, intervalMin: number): Promise<MonitorPlan> {
    const now = new Date();
    const nextRun = new Date(now.getTime() + intervalMin * 60 * 1000);
    return this.update(id, {
      last_run_at: now.toISOString(),
      next_run_at: nextRun.toISOString(),
    } as Partial<MonitorPlan>);
  }

  async enable(id: string): Promise<MonitorPlan> {
    return this.update(id, { enabled: 1 } as Partial<MonitorPlan>);
  }

  async disable(id: string): Promise<MonitorPlan> {
    return this.update(id, { enabled: 0 } as Partial<MonitorPlan>);
  }
}

export const monitorPlanRepo = new MonitorPlanRepository();
