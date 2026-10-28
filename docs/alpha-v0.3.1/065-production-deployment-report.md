# Migration 065 — Production deployment record

| Field | Value |
|---|---|
| Applied at | 2026-10-27 (local) |
| Project | `abtvefbwnismoqweokqu` (neud production) |
| Preview project | `qiilpmtfurhtczizduwz` (NEUD Alpha Preview) |
| Validated SQL (exact bytes) | `supabase/migrations/065_team_admin_last_admin_guard.sql` |
| Draft mirror (identical checksum) | `docs/alpha-v0.3.1/065_team_admin_last_admin_guard.DRAFT.sql` |
| SHA-256 | `a5024b9129f9dbc0c35bec8708692792283feb9adcd09ab5d4b7e631fcb49778` |
| Method | Scoped `supabase db query` transaction (`begin` … `commit`); **not** `db push` |
| Migration history at apply time | **Not** recorded in `supabase_migrations.schema_migrations` |
| History after repair | `supabase migration repair 065 --status applied --linked` recorded version `065` / `team_admin_last_admin_guard` (no SQL re-exec) |
| Rollback artifact | Agent store `prod-065-rollback/ROLLBACK_065.sql` (pre-deploy defs) |

## Migration-history reconciliation

Production remote history uses timestamp versions for earlier migrations, while this repo’s local files use numeric prefixes (`001`…`065`). Migration 065 was applied manually because an unrestricted `db push` would risk unrelated pending migration behavior.

Safe reconciliation:

1. Keep `supabase/migrations/065_team_admin_last_admin_guard.sql` as the canonical source (checksum above).
2. Mark local version `065` as already applied on production with:

   ```bash
   supabase migration repair 065 --status applied --linked
   ```

   Run only against `abtvefbwnismoqweokqu`. This inserts a history row; it does **not** re-execute SQL.
3. Never re-run the 065 SQL against production unless intentionally updating the RPC bodies.
4. Do not replay migrations `001`–`064` against production.

## Result

Production last-Team-Admin protection is live and Preview-validated. Owner macOS validation A–G passed. Included in the Alpha v0.3.1 release commit.
