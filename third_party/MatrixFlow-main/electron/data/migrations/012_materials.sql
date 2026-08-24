-- 素材管理表
-- 创建日期: 2026-05-22
-- Story: 素材管理功能

-- 素材分组表
CREATE TABLE IF NOT EXISTS material_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 素材表
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('image', 'video', 'article')),
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  platform TEXT,
  group_id TEXT,
  metadata TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'deleted')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (group_id) REFERENCES material_groups(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
CREATE INDEX IF NOT EXISTS idx_materials_group ON materials(group_id);
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
CREATE INDEX IF NOT EXISTS idx_materials_created ON materials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_group_type ON materials(group_id, type);
