ALTER TABLE local_users ADD COLUMN supabase_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_local_users_supabase_user_id
  ON local_users (supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;
