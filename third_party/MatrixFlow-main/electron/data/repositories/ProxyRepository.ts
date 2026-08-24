import { BaseRepository } from './BaseRepository';
import type { Proxy } from '../types';

export class ProxyRepository extends BaseRepository<Proxy> {
  constructor() {
    super('proxies');
  }

  async findActive(): Promise<Proxy[]> {
    return this.findWhere({ status: 'active' } as Partial<Proxy>);
  }

  async findByProtocol(protocol: string): Promise<Proxy[]> {
    return this.findWhere({ protocol } as Partial<Proxy>);
  }

  async updateCheckResult(id: string, result: string): Promise<Proxy> {
    return this.update(id, {
      last_check_at: new Date().toISOString(),
      last_check_result: result,
    } as Partial<Proxy>);
  }

  async deactivate(id: string): Promise<Proxy> {
    return this.update(id, { status: 'inactive' } as Partial<Proxy>);
  }
}

export const proxyRepo = new ProxyRepository();
