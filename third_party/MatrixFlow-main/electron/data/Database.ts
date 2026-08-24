import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { Logger } from '../core/Logger';

const logger = new Logger('Database');

type BetterSqlite3Database = import('better-sqlite3').Database;

let db: BetterSqlite3Database | null = null;
let dbAvailable = false;

export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'data');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, 'matrixflow.db');
}

export function initDatabase(): BetterSqlite3Database | null {
  if (db) {
    return db;
  }

  try {
    const Database = require('better-sqlite3');
    const dbPath = getDatabasePath();
    db = new Database(dbPath) as BetterSqlite3Database;

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    logger.info(`数据库已初始化: ${dbPath}`);
    dbAvailable = true;

    runMigrations(db);
    return db;
  } catch (error) {
    logger.warn('数据库初始化失败，使用内存模式:', error);
    dbAvailable = false;
    return null;
  }
}

function runMigrations(database: BetterSqlite3Database): void {
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    logger.warn('迁移目录不存在，跳过迁移');
    return;
  }

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const appliedMigrations = database
      .prepare('SELECT name FROM migrations')
      .all() as { name: string }[];

    const appliedSet = new Set(appliedMigrations.map((m) => m.name));

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (appliedSet.has(file)) {
        continue;
      }

      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      try {
        database.exec(sql);
        database.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
        logger.info(`迁移已应用: ${file}`);
      } catch (error) {
        logger.error(`迁移失败: ${file}`, error);
        throw error;
      }
    }
  } catch (error) {
    logger.error('迁移执行失败:', error);
  }

  fixSchema(database);
}

function fixSchema(database: BetterSqlite3Database): void {
  try {
    const columns = database
      .prepare("PRAGMA table_info(comment_templates)")
      .all() as { name: string }[];
    const columnNames = new Set(columns.map((c) => c.name));

    const missingColumns: string[] = [];
    if (!columnNames.has('trigger_condition')) {
      missingColumns.push(
        "ALTER TABLE comment_templates ADD COLUMN trigger_condition TEXT NOT NULL DEFAULT 'after_publish'"
      );
    }
    if (!columnNames.has('threshold')) {
      missingColumns.push('ALTER TABLE comment_templates ADD COLUMN threshold TEXT');
    }
    if (!columnNames.has('delay')) {
      missingColumns.push('ALTER TABLE comment_templates ADD COLUMN delay INTEGER');
    }

    for (const sql of missingColumns) {
      database.exec(sql);
    }

    if (missingColumns.length > 0) {
      logger.info(`Schema fix: added ${missingColumns.length} missing column(s) to comment_templates`);
    }
  } catch (error) {
    logger.warn('Schema fix check failed:', error);
  }

  try {
    const columns = database
      .prepare("PRAGMA table_info(accounts)")
      .all() as { name: string }[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('last_cookie_check')) {
      database.exec('ALTER TABLE accounts ADD COLUMN last_cookie_check TEXT');
      logger.info('Schema fix: added last_cookie_check to accounts');
    }

    database
      .prepare("UPDATE accounts SET platform = 'channels' WHERE platform = 'weixin_video'")
      .run();
  } catch (error) {
    logger.warn('Account schema fix check failed:', error);
  }
}

export function getDatabase(): BetterSqlite3Database {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return db;
}

export function isDatabaseAvailable(): boolean {
  return dbAvailable;
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.close();
      logger.info('数据库已关闭');
    } catch {
      // ignore close errors
    }
    db = null;
  }
}

export function runInTransaction<T>(fn: (db: BetterSqlite3Database) => T): T {
  const database = getDatabase();
  return database.transaction(fn)(database);
}

export async function runAsync<T>(fn: (db: BetterSqlite3Database) => T): Promise<T> {
  return Promise.resolve().then(() => fn(getDatabase()));
}

export async function runInTransactionAsync<T>(fn: (db: BetterSqlite3Database) => T): Promise<T> {
  return Promise.resolve().then(() => runInTransaction(fn));
}

function getBackupDir(): string {
  const backupDir = path.join(app.getPath('userData'), 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function generateBackupFilename(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `backup-${ts}.db`;
}

export interface BackupInfo {
  id: string;
  name: string;
  size: number;
  createdAt: string;
}

export function createBackup(): BackupInfo {
  const database = getDatabase();
  const backupDir = getBackupDir();
  const filename = generateBackupFilename();
  const backupPath = path.join(backupDir, filename);

  database.backup(backupPath);

  const stat = fs.statSync(backupPath);
  const id = path.basename(filename, '.db');

  logger.info(`备份已创建: ${filename}`);
  return { id, name: filename, size: stat.size, createdAt: stat.birthtime.toISOString() };
}

export function listBackups(): BackupInfo[] {
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.db'));

  const backups: BackupInfo[] = files.map((f) => {
    const filePath = path.join(backupDir, f);
    const stat = fs.statSync(filePath);
    return {
      id: path.basename(f, '.db'),
      name: f,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    };
  });

  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return backups;
}

export function restoreBackup(backupId: string): void {
  const backupDir = getBackupDir();
  const backupFile = `${backupId}.db`;
  const backupPath = path.join(backupDir, backupFile);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupFile}`);
  }

  const dbPath = getDatabasePath();

  closeDatabase();

  fs.copyFileSync(backupPath, dbPath);

  initDatabase();
  logger.info(`已从备份恢复: ${backupFile}`);
}

export function deleteBackup(backupId: string): void {
  const backupDir = getBackupDir();
  const backupFile = `${backupId}.db`;
  const backupPath = path.join(backupDir, backupFile);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupFile}`);
  }

  fs.unlinkSync(backupPath);
  logger.info(`备份已删除: ${backupFile}`);
}

export function clearData(type: 'logs' | 'cache' | 'all'): void {
  const userDataPath = app.getPath('userData');

  if (type === 'logs') {
    const logsDir = path.join(userDataPath, 'logs');
    if (fs.existsSync(logsDir)) {
      for (const file of fs.readdirSync(logsDir)) {
        fs.unlinkSync(path.join(logsDir, file));
      }
    }
    logger.info('日志已清理');
    return;
  }

  if (type === 'cache') {
    const cacheDir = path.join(userDataPath, 'cache');
    if (fs.existsSync(cacheDir)) {
      for (const file of fs.readdirSync(cacheDir)) {
        const p = path.join(cacheDir, file);
        if (fs.statSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true });
        } else {
          fs.unlinkSync(p);
        }
      }
    }
    logger.info('缓存已清理');
    return;
  }

  if (type === 'all') {
    const database = getDatabase();
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sqlite_sequence', 'migrations')")
      .all() as { name: string }[];

    for (const { name } of tables) {
      database.exec(`DELETE FROM ${name}`);
    }
    database.exec('VACUUM');
    logger.info('所有数据已清空');
  }
}
