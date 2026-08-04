ALTER TABLE local_users ADD COLUMN supabase_account_available INTEGER NOT NULL DEFAULT 1;
ALTER TABLE local_users ADD COLUMN last_supabase_sync_at TEXT;
