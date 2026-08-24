-- 发布任务表字段扩展
-- 创建日期: 2026-05-26
-- Story: Story 5/6/7 — 任务管理/视频发布/草稿管理

ALTER TABLE publish_tasks ADD COLUMN title TEXT DEFAULT '';
ALTER TABLE publish_tasks ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE publish_tasks ADD COLUMN tags TEXT DEFAULT '[]';
ALTER TABLE publish_tasks ADD COLUMN topic_tags TEXT DEFAULT '[]';
ALTER TABLE publish_tasks ADD COLUMN cover_url TEXT;
ALTER TABLE publish_tasks ADD COLUMN cover_ratio TEXT;
ALTER TABLE publish_tasks ADD COLUMN started_at TEXT;
ALTER TABLE publish_tasks ADD COLUMN completed_at TEXT;
ALTER TABLE publish_tasks ADD COLUMN duration_ms INTEGER;
ALTER TABLE publish_tasks ADD COLUMN error_code TEXT;
ALTER TABLE publish_tasks ADD COLUMN source TEXT DEFAULT 'plan';
ALTER TABLE publish_tasks ADD COLUMN source_id TEXT;
ALTER TABLE publish_tasks ADD COLUMN metadata TEXT DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_pt_source ON publish_tasks(source);
CREATE INDEX IF NOT EXISTS idx_pt_completed_at ON publish_tasks(completed_at);
