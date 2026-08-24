import { getDatabase, runAsync, runInTransactionAsync } from '../Database';
import type { PaginationOptions, PaginatedResult } from '../types';
import type BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class BaseRepository<T extends Record<string, any>> {
  constructor(
    protected tableName: string,
    protected primaryKey: string = 'id'
  ) {}

  protected generateId(): string {
    return randomUUID();
  }

  async findById(id: string): Promise<T | undefined> {
    return runAsync((db: BetterSqlite3.Database) => {
      const stmt = db.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`);
      return stmt.get(id) as T | undefined;
    });
  }

  async findAll(options?: PaginationOptions): Promise<PaginatedResult<T>> {
    return runAsync((db: BetterSqlite3.Database) => {
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 50;
      const offset = (page - 1) * pageSize;
      const orderBy = options?.orderBy ?? this.primaryKey;
      const orderDir = options?.orderDir ?? 'DESC';

      const countRow = db.prepare(`SELECT COUNT(*) as total FROM ${this.tableName}`).get() as { total: number };
      const rows = db
        .prepare(`SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`)
        .all(pageSize, offset) as T[];

      return { data: rows, total: countRow.total, page, pageSize };
    });
  }

  async findWhere(conditions: Partial<T>): Promise<T[]> {
    return runAsync((db: BetterSqlite3.Database) => {
      const keys = Object.keys(conditions).filter((k) => conditions[k] !== undefined);
      if (keys.length === 0) {
        return db.prepare(`SELECT * FROM ${this.tableName}`).all() as T[];
      }
      const clause = keys.map((k) => `${k} = @${k}`).join(' AND ');
      return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${clause}`).all(conditions) as T[];
    });
  }

  async findOneWhere(conditions: Partial<T>): Promise<T | undefined> {
    return runAsync((db: BetterSqlite3.Database) => {
      const keys = Object.keys(conditions).filter((k) => conditions[k] !== undefined);
      if (keys.length === 0) return undefined;
      const clause = keys.map((k) => `${k} = @${k}`).join(' AND ');
      return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${clause} LIMIT 1`).get(conditions) as T | undefined;
    });
  }

  async insert(data: Omit<T, 'created_at' | 'updated_at'>): Promise<T> {
    return runInTransactionAsync((db: BetterSqlite3.Database) => {
      const keys = Object.keys(data);
      const placeholders = keys.map((k) => `@${k}`).join(', ');
      const columns = keys.join(', ');

      db.prepare(`INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`).run(data);

      const id = (data as any)[this.primaryKey];
      return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`).get(id) as T;
    });
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return runInTransactionAsync((db: BetterSqlite3.Database) => {
      const keys = Object.keys(data);
      const setClause = keys.map((k) => `${k} = @${k}`).join(', ');

      const params = { ...data, [this.primaryKey]: id };
      db.prepare(`UPDATE ${this.tableName} SET ${setClause}, updated_at = datetime('now') WHERE ${this.primaryKey} = @${this.primaryKey}`).run(params);

      return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`).get(id) as T;
    });
  }

  async deleteById(id: string): Promise<boolean> {
    return runAsync((db: BetterSqlite3.Database) => {
      const result = db.prepare(`DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`).run(id);
      return result.changes > 0;
    });
  }

  async deleteWhere(conditions: Partial<T>): Promise<number> {
    return runAsync((db: BetterSqlite3.Database) => {
      const keys = Object.keys(conditions).filter((k) => conditions[k] !== undefined);
      if (keys.length === 0) return 0;
      const clause = keys.map((k) => `${k} = @${k}`).join(' AND ');
      const result = db.prepare(`DELETE FROM ${this.tableName} WHERE ${clause}`).run(conditions);
      return result.changes;
    });
  }

  async count(conditions?: Partial<T>): Promise<number> {
    return runAsync((db: BetterSqlite3.Database) => {
      if (!conditions || Object.keys(conditions).length === 0) {
        const row = db.prepare(`SELECT COUNT(*) as total FROM ${this.tableName}`).get() as { total: number };
        return row.total;
      }
      const keys = Object.keys(conditions).filter((k) => conditions[k] !== undefined);
      const clause = keys.map((k) => `${k} = @${k}`).join(' AND ');
      const row = db.prepare(`SELECT COUNT(*) as total FROM ${this.tableName} WHERE ${clause}`).get(conditions) as { total: number };
      return row.total;
    });
  }

  async exists(id: string): Promise<boolean> {
    return runAsync((db: BetterSqlite3.Database) => {
      const row = db.prepare(`SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = ? LIMIT 1`).get(id);
      return !!row;
    });
  }
}
