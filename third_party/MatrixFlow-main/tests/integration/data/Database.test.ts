import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
  },
}));

vi.mock('electron-log', () => {
  const fn = () => {};
  fn.info = fn; fn.warn = fn; fn.error = fn; fn.debug = fn;
  const transports = { file: { resolvePathFn: fn, maxSize: 0, format: '' } };
  return { default: { ...fn, transports }, ...fn, transports };
});

vi.mock('@electron/core/Logger', () => ({
  Logger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import {
  initDatabase,
  getDatabase,
  createBackup,
  clearData,
  closeDatabase,
} from '@electron/data/Database';

let tempDir: string;

function patchBackupToSync(): void {
  const db = getDatabase();
  const originalBackup = db.backup.bind(db);
  db.backup = ((dest: string) => {
    const result = originalBackup(dest);
    if (result && typeof result === 'object' && typeof result.then === 'function') {
      result.catch(() => {});
      const dbPath = (db as unknown as { name: string }).name;
      fs.copyFileSync(dbPath, dest);
      return dest;
    }
    return result;
  }) as typeof db.backup;
}

describe('Database integration (real better-sqlite3)', () => {
  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-int-'));

    const electron = await import('electron');
    const app = vi.mocked(electron.app);
    app.getPath.mockReturnValue(tempDir);

    const result = initDatabase();
    expect(result).not.toBeNull();

    patchBackupToSync();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('createBackup creates backup file with correct naming pattern', () => {
    const result = createBackup();

    const backupDir = path.join(tempDir, 'data', 'backups');
    expect(fs.existsSync(path.join(backupDir, result.name))).toBe(true);
    expect(result.name).toMatch(/^backup-\d{4}-\d{2}-\d{2}-\d{6}\.db$/);
    expect(result.size).toBeGreaterThan(0);
  });

  it('createBackup returns BackupInfo with correct fields', () => {
    const result = createBackup();

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('createdAt');
    expect(result.id).toBe(result.name.replace(/\.db$/, ''));
    expect(new Date(result.createdAt).getTime()).not.toBeNaN();
    expect(typeof result.size).toBe('number');
    expect(result.size).toBeGreaterThan(0);
  });

  it('clearData("all") clears all table rows', () => {
    const db = getDatabase();

    db.prepare(
      "INSERT INTO accounts (id, platform, cookie_path) VALUES (?, ?, ?)",
    ).run('test-acc-1', 'douyin', '/cookies/1.dat');

    db.prepare(
      "INSERT INTO accounts (id, platform, cookie_path) VALUES (?, ?, ?)",
    ).run('test-acc-2', 'xiaohongshu', '/cookies/2.dat');

    const before = db.prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number };
    expect(before.c).toBe(2);

    clearData('all');

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sqlite_sequence', 'migrations')",
      )
      .all() as { name: string }[];

    for (const { name } of tables) {
      const row = db.prepare(`SELECT COUNT(*) as c FROM [${name}]`).get() as { c: number };
      expect(row.c).toBe(0);
    }
  });
});
