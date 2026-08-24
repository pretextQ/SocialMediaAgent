-- v006: Add cover_ratio column to videos and drafts
ALTER TABLE videos ADD COLUMN cover_ratio TEXT;
ALTER TABLE drafts ADD COLUMN cover_ratio TEXT;
