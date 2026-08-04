ALTER TABLE displays ADD COLUMN display_width INTEGER NOT NULL DEFAULT 1920;
ALTER TABLE displays ADD COLUMN display_height INTEGER NOT NULL DEFAULT 1080;

UPDATE displays
SET display_width = 1920, display_height = 1080
WHERE display_width IS NULL OR display_height IS NULL;
