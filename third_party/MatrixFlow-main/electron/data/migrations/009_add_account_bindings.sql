ALTER TABLE accounts ADD COLUMN fingerprint_id TEXT;
ALTER TABLE accounts ADD COLUMN proxy_id TEXT;
ALTER TABLE accounts ADD COLUMN browser_mode TEXT DEFAULT 'embedded';
