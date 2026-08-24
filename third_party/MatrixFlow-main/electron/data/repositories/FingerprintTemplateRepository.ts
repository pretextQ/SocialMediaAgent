import { BaseRepository } from './BaseRepository';
import type { FingerprintTemplate } from '../types';

export class FingerprintTemplateRepository extends BaseRepository<FingerprintTemplate> {
  constructor() {
    super('fingerprint_templates');
  }

  async findByName(name: string): Promise<FingerprintTemplate | undefined> {
    return this.findOneWhere({ name } as Partial<FingerprintTemplate>);
  }
}

export const fingerprintTemplateRepo = new FingerprintTemplateRepository();
