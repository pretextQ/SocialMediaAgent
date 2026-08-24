import { BaseRepository } from './BaseRepository';
import type { Account } from '../types';

export class AccountRepository extends BaseRepository<Account> {
  constructor() {
    super('accounts');
  }

  async findByPlatform(platform: string): Promise<Account[]> {
    return this.findWhere({ platform } as Partial<Account>);
  }

  async findActive(): Promise<Account[]> {
    return this.findWhere({ status: 'active' } as Partial<Account>);
  }

  async updateLoginTime(id: string): Promise<Account> {
    return this.update(id, { last_login: new Date().toISOString() } as Partial<Account>);
  }

  async updatePublishTime(id: string): Promise<Account> {
    return this.update(id, { last_publish: new Date().toISOString() } as Partial<Account>);
  }

  async setCookieValid(id: string, valid: boolean): Promise<Account> {
    return this.update(id, { cookie_valid: valid ? 1 : 0 } as Partial<Account>);
  }

  async deactivate(id: string): Promise<Account> {
    return this.update(id, { status: 'inactive' } as Partial<Account>);
  }
}

export const accountRepo = new AccountRepository();
