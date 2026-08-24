-- ============================================================
-- MatrixFlow Schema Expansion - 12 New Tables
-- Preserves existing tables from 001_init.sql:
--   accounts, videos, publish_records, stats, tasks
-- ============================================================

-- ----------------------------------------------------------
-- 1. groups - 分组表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#409EFF',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
-- 2. group_publish_rules - 分组发布规则表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_publish_rules (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  publish_interval_min INTEGER NOT NULL DEFAULT 30,
  daily_limit INTEGER NOT NULL DEFAULT 10,
  time_slots TEXT DEFAULT '[]',
  publish_mode TEXT NOT NULL DEFAULT 'client',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 3. fingerprint_templates - 指纹模板表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS fingerprint_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_agent TEXT,
  screen_width INTEGER DEFAULT 1920,
  screen_height INTEGER DEFAULT 1080,
  language TEXT DEFAULT 'zh-CN',
  platform TEXT DEFAULT 'Win32',
  webgl_vendor TEXT,
  webgl_renderer TEXT,
  extra_config TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
-- 4. proxies - 代理表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS proxies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'http',
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_check_at TEXT,
  last_check_result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
-- 5. platform_configs - 平台配置表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_configs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, config_key)
);

-- ----------------------------------------------------------
-- 6. contents - 内容表（统一素材管理）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS contents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'video',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration INTEGER,
  size INTEGER,
  tags TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
-- 7. publish_tasks - 发布任务表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS publish_tasks (
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
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------
-- 8. task_items - 任务项表（一个发布任务可拆分到多个账号）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  platform_video_id TEXT,
  publish_url TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES publish_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 9. drafts - 草稿表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  content_id TEXT,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  cover_path TEXT,
  extra_data TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------
-- 10. video_stats - 视频统计表（增强版 stats）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_stats (
  id TEXT PRIMARY KEY,
  task_item_id TEXT,
  platform TEXT NOT NULL,
  platform_video_id TEXT NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  collect_count INTEGER NOT NULL DEFAULT 0,
  fetch_time TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_item_id) REFERENCES task_items(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 11. monitor_plans - 监控计划表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitor_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'video',
  target_id TEXT NOT NULL,
  interval_min INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
-- 12. comment_templates - 评论模板表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  platform TEXT DEFAULT '',
  usage_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 索引
-- ============================================================

-- groups
CREATE INDEX IF NOT EXISTS idx_groups_sort_order ON groups(sort_order);

-- group_publish_rules
CREATE INDEX IF NOT EXISTS idx_gpr_group_id ON group_publish_rules(group_id);
CREATE INDEX IF NOT EXISTS idx_gpr_platform ON group_publish_rules(platform);

-- fingerprint_templates
CREATE INDEX IF NOT EXISTS idx_fingerprint_name ON fingerprint_templates(name);

-- proxies
CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
CREATE INDEX IF NOT EXISTS idx_proxies_protocol ON proxies(protocol);

-- platform_configs
CREATE INDEX IF NOT EXISTS idx_pc_platform ON platform_configs(platform);

-- contents
CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at);

-- publish_tasks
CREATE INDEX IF NOT EXISTS idx_pt_content_id ON publish_tasks(content_id);
CREATE INDEX IF NOT EXISTS idx_pt_group_id ON publish_tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_pt_platform ON publish_tasks(platform);
CREATE INDEX IF NOT EXISTS idx_pt_status ON publish_tasks(status);
CREATE INDEX IF NOT EXISTS idx_pt_scheduled_at ON publish_tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_pt_account_id ON publish_tasks(account_id);

-- task_items
CREATE INDEX IF NOT EXISTS idx_ti_task_id ON task_items(task_id);
CREATE INDEX IF NOT EXISTS idx_ti_account_id ON task_items(account_id);
CREATE INDEX IF NOT EXISTS idx_ti_status ON task_items(status);

-- drafts
CREATE INDEX IF NOT EXISTS idx_drafts_platform ON drafts(platform);
CREATE INDEX IF NOT EXISTS idx_drafts_content_id ON drafts(content_id);

-- video_stats
CREATE INDEX IF NOT EXISTS idx_vs_platform_video_id ON video_stats(platform_video_id);
CREATE INDEX IF NOT EXISTS idx_vs_fetch_time ON video_stats(fetch_time);
CREATE INDEX IF NOT EXISTS idx_vs_task_item_id ON video_stats(task_item_id);

-- monitor_plans
CREATE INDEX IF NOT EXISTS idx_mp_platform ON monitor_plans(platform);
CREATE INDEX IF NOT EXISTS idx_mp_enabled ON monitor_plans(enabled);
CREATE INDEX IF NOT EXISTS idx_mp_next_run_at ON monitor_plans(next_run_at);

-- comment_templates
CREATE INDEX IF NOT EXISTS idx_ct_category ON comment_templates(category);
CREATE INDEX IF NOT EXISTS idx_ct_platform ON comment_templates(platform);
CREATE INDEX IF NOT EXISTS idx_ct_enabled ON comment_templates(enabled);
