-- publish_tasks: 去掉 content_id 的 FOREIGN KEY 约束
-- 原因: 前端发布视频时 content_id 存的是 materials.id（素材ID），
--        而 FK 引用的是 contents(id)（内容ID），两张表互不相干导致约束失败
-- 创建日期: 2026-05-28

BEGIN TRANSACTION;

-- 1. 创建新表（去掉 content_id 的 FK，保留 group_id 的 FK）
CREATE TABLE IF NOT EXISTS publish_tasks_new (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  group_id TEXT,
  platform TEXT NOT NULL,
  account_id TEXT,
  proxy_id TEXT,
  fingerprint_id TEXT,
  scheduled_at TEXT,
  publish_mode TEXT NOT NULL DEFAULT 'client',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  topic_tags TEXT DEFAULT '[]',
  cover_url TEXT,
  cover_ratio TEXT,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  source TEXT DEFAULT 'plan',
  source_id TEXT,
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
);

-- 2. 复制数据
INSERT INTO publish_tasks_new SELECT * FROM publish_tasks;

-- 3. 替换旧表
DROP TABLE publish_tasks;
ALTER TABLE publish_tasks_new RENAME TO publish_tasks;

-- 4. 重建索引
CREATE INDEX IF NOT EXISTS idx_pt_content_id ON publish_tasks(content_id);
CREATE INDEX IF NOT EXISTS idx_pt_source ON publish_tasks(source);
CREATE INDEX IF NOT EXISTS idx_pt_completed_at ON publish_tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_pt_status ON publish_tasks(status);
CREATE INDEX IF NOT EXISTS idx_pt_platform ON publish_tasks(platform);
CREATE INDEX IF NOT EXISTS idx_pt_account_id ON publish_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_pt_scheduled_at ON publish_tasks(scheduled_at);

COMMIT;
