-- ============================================================
-- Fingerprint Template v2 - Patchright Native Parameters
-- 对齐设计文档 MatrixFlow-指纹模板设计.md
-- ============================================================

-- 备份旧数据到临时表
CREATE TABLE IF NOT EXISTS fingerprint_templates_backup AS SELECT * FROM fingerprint_templates;

-- 删除旧表重建（SQLite 不支持 ALTER COLUMN）
DROP TABLE IF EXISTS fingerprint_templates;

-- 重新创建指纹模板表（v2 结构）
CREATE TABLE IF NOT EXISTS fingerprint_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  
  -- 指纹种子（核心参数，启用后大部分指纹功能生效）
  seed INTEGER,
  
  -- 操作系统配置
  platform TEXT DEFAULT 'windows',  -- windows, linux, macos
  platform_version TEXT,             -- 系统版本，不填使用默认
  
  -- 浏览器品牌配置
  brand TEXT DEFAULT 'Chrome',       -- Chrome, Edge, Opera, Vivaldi
  brand_version TEXT,                -- 浏览器版本，不填使用默认
  
  -- 硬件特征
  hardware_concurrency INTEGER,      -- CPU 核心数，不填由种子随机生成
  gpu_vendor TEXT,                   -- GPU 供应商（如 Intel Inc., NVIDIA Corporation）
  gpu_renderer TEXT,                 -- GPU 渲染器（如 NVIDIA GeForce GTX 1060）
  
  -- 网络配置
  disable_non_proxied_udp INTEGER DEFAULT 1,  -- WebRTC 策略，建议开启保护真实 IP
  
  -- 环境配置
  lang TEXT DEFAULT 'zh-CN',         -- 语言
  accept_lang TEXT DEFAULT 'zh-CN,en-US',  -- 接受语言
  timezone TEXT DEFAULT 'Asia/Shanghai',    -- 时区
  
  -- 扩展能力
  custom_params TEXT DEFAULT '[]',   -- JSON: 自定义命令行参数数组
  
  -- 兼容旧字段（迁移过渡期保留，后续版本可删除）
  user_agent TEXT,                   -- 废弃：UA 由 brand + brand_version 自动生成
  screen_width INTEGER DEFAULT 1920,
  screen_height INTEGER DEFAULT 1080,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 从备份恢复数据（字段映射）
INSERT OR IGNORE INTO fingerprint_templates (
  id, name, seed, platform, brand, gpu_vendor, gpu_renderer,
  lang, timezone, user_agent, screen_width, screen_height,
  created_at, updated_at
)
SELECT 
  id, 
  name, 
  NULL,  -- seed: 新字段，旧数据无值
  CASE 
    WHEN platform = 'Win32' THEN 'windows'
    WHEN platform = 'Linux' THEN 'linux'
    WHEN platform = 'MacOS' THEN 'macos'
    ELSE 'windows'
  END as platform,
  'Chrome' as brand,  -- 默认 Chrome
  webgl_vendor as gpu_vendor,
  webgl_renderer as gpu_renderer,
  language as lang,
  'Asia/Shanghai' as timezone,
  user_agent,
  screen_width,
  screen_height,
  created_at,
  updated_at
FROM fingerprint_templates_backup;

-- 清理备份表
DROP TABLE IF EXISTS fingerprint_templates_backup;

-- 重建索引
DROP INDEX IF EXISTS idx_fingerprint_name;
CREATE INDEX IF NOT EXISTS idx_fingerprint_name ON fingerprint_templates(name);
CREATE INDEX IF NOT EXISTS idx_fingerprint_platform ON fingerprint_templates(platform);
CREATE INDEX IF NOT EXISTS idx_fingerprint_brand ON fingerprint_templates(brand);
