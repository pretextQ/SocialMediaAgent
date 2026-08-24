PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS accounts_new (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  cookie_path TEXT NOT NULL,
  cookie_valid INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  last_publish TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  group_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO accounts_new (id, platform, nickname, avatar_url, cookie_path, cookie_valid, last_login, last_publish, status, created_at, updated_at)
SELECT id, platform, nickname, avatar_url, cookie_path, cookie_valid, last_login, last_publish, status, created_at, updated_at FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;
CREATE INDEX IF NOT EXISTS idx_accounts_group ON accounts(group_id);

PRAGMA foreign_keys=on;