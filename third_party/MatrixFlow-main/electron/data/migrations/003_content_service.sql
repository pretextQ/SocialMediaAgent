-- ContentService 扩展：添加文件哈希列（去重）
ALTER TABLE contents ADD COLUMN file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_contents_file_hash ON contents(file_hash);
