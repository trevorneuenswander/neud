-- Output routes may target a single display or a pinned display stack.
-- display_id remains for backward compatibility and must never store stack ids.
ALTER TABLE output_routes ADD COLUMN source_type TEXT NOT NULL DEFAULT 'display';
ALTER TABLE output_routes ADD COLUMN source_id TEXT NOT NULL DEFAULT '';

UPDATE output_routes
SET source_type = 'display',
    source_id = display_id
WHERE source_id = '' OR source_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_output_routes_source ON output_routes (source_type, source_id);
