CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  cookie_path TEXT NOT NULL,
  cookie_valid INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  last_publish TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_video_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  cover_path TEXT,
  video_path TEXT NOT NULL,
  duration INTEGER,
  size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  publish_mode TEXT NOT NULL DEFAULT 'immediate',
  scheduled_at TEXT,
  published_at TEXT,
  publish_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publish_records (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  platform_video_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  collect_count INTEGER NOT NULL DEFAULT 0,
  fetch_time TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_videos_account_id ON videos(account_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_scheduled_at ON videos(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_records_video_id ON publish_records(video_id);
CREATE INDEX IF NOT EXISTS idx_publish_records_status ON publish_records(status);
CREATE INDEX IF NOT EXISTS idx_stats_video_id ON stats(video_id);
CREATE INDEX IF NOT EXISTS idx_stats_fetch_time ON stats(fetch_time);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks(scheduled_at);
