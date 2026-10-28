-- Prevent orphan recovery from recreating intentionally deleted video displays.
-- Idempotency: schema_migrations tracks version 046; the runner also tolerates
-- a duplicate-column error if this column was added outside the migration table.
ALTER TABLE display_media_assets
  ADD COLUMN orphan_recovery_suppressed INTEGER NOT NULL DEFAULT 0;
