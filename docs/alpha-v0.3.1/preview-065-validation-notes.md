# Migration 065 — Preview validation notes

Preview project: `qiilpmtfurhtczizduwz` (NEUD Alpha Preview)  
Organization: NEUD (`cdhdwiwlkjgkkfsjchhu`)  
Isolation: `qiilpmtfurhtczizduwz` ≠ production `abtvefbwnismoqweokqu`

## SQL artifacts

| File | Role |
|---|---|
| `065_team_admin_last_admin_guard.DRAFT.sql` | Applied and tested on Preview |
| `preview-bootstrap-access-control.sql` | Minimal access surface for Preview (full migration chain blocked by duplicate `004` + function return-type conflicts) |
| `preview-seed-synthetic-access.sql` | Synthetic users/teams (no production PII) |

## Production readiness

Preview validated. **Production application of 065 is NOT authorized** until explicit Owner approval.

Known draft fix vs earlier checksum: remove nonexistent `profiles.is_active` reference (production profiles have no such column; see migration 042).
