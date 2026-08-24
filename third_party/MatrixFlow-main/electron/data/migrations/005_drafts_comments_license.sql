-- 005_drafts_comments_license.sql

-- 草稿表：添加 status 列
-- 注意：drafts 表已在 002 中创建，SQLite ALTER TABLE 不支持 CHECK 约束
ALTER TABLE drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts(updated_at);

-- 评论模板表
CREATE TABLE IF NOT EXISTS comment_templates (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  trigger_condition TEXT NOT NULL DEFAULT 'after_publish' CHECK(trigger_condition IN ('after_publish', 'threshold')),
  threshold TEXT,
  delay INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comment_templates_platform ON comment_templates(platform);

-- 评论任务表
CREATE TABLE IF NOT EXISTS comment_tasks (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  video_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (template_id) REFERENCES comment_templates(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_comment_tasks_status ON comment_tasks(status);
CREATE INDEX IF NOT EXISTS idx_comment_tasks_created ON comment_tasks(created_at);

-- 许可证表
CREATE TABLE IF NOT EXISTS license (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('starter', 'pro', 'enterprise')),
  devices INTEGER NOT NULL DEFAULT 1,
  activated_devices TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  features TEXT NOT NULL DEFAULT '{}'
);

-- 多开面板会话表（用于持久化）
CREATE TABLE IF NOT EXISTS panel_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  nickname TEXT,
  position_x INTEGER NOT NULL,
  position_y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_panel_sessions_account ON panel_sessions(account_id);
