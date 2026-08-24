-- 草稿表重建 — 视频配置快照型
-- 创建日期: 2026-05-26
-- Story: Story 7 — 草稿管理
-- 旧 drafts 表（002_expand_schema.sql 创建）为文章型草稿，无保留数据

DROP TABLE IF EXISTS drafts;

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  title TEXT,
  material_id TEXT NOT NULL REFERENCES materials(id),
  status TEXT NOT NULL DEFAULT 'editing',
  snapshot_json TEXT NOT NULL,
  source_draft_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_material ON drafts(material_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts(updated_at);
