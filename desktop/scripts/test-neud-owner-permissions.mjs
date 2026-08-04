import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const OWNER_EMAIL = "trevorneuenswander@gmail.com";
const ADMIN_EMAIL = "trevor@hildrethmedia.com";

test("identity reconciliation links Supabase UUIDs and canonical roles", () => {
  const reconciliation = read("desktop/src/services/user-identity-reconciliation-service.ts");
  const repository = read("desktop/src/repositories/local-users-repository.ts");
  assert.match(reconciliation, /resolveByAuthUserId/);
  assert.match(reconciliation, /supabaseUserId/);
  assert.match(reconciliation, /resolveCanonicalPlatformRole/);
  assert.match(reconciliation, /DEFAULT_OWNER_EMAIL/);
  assert.match(reconciliation, /HILDRETH_ADMIN_EMAIL/);
  assert.match(repository, /supabase_user_id/);
});

test("owner identity sync migration repairs stale owner assignments once", () => {
  const migration = read("desktop/src/services/owner-identity-sync-migration.ts");
  const main = read("desktop/src/main.ts");
  assert.match(migration, /neud\.ownerIdentitySyncMigration_v1/);
  assert.match(migration, /demoteStaleOwners/);
  assert.match(migration, /Hildreth Media Group/);
  assert.match(main, /runOwnerIdentitySyncMigration/);
});

test("authorization resolves local users by Supabase UUID before id-only lookup", () => {
  const authz = read("desktop/src/services/access-authorization-service.ts");
  assert.match(authz, /resolveByAuthUserId/);
});

test("runtime auth cache maps Supabase admin to non-global user role", () => {
  const signIn = read("src/lib/auth/client-sign-in.ts");
  const mapping = read("src/lib/auth/supabase-role-mapping.ts");
  assert.match(signIn, /mapSupabaseProfileRoleToAuthCacheRole/);
  assert.match(mapping, /=== "owner" \? "owner" : "user"/);
});

test("legacy default owner emails are not promoted during access migration", () => {
  const migration = read("desktop/src/services/access-data-migration.ts");
  assert.match(migration, /\?\? "user"/);
  assert.doesNotMatch(migration, /\?\? "owner"/);
});

test("project meta and create project use effective access service", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /isPlatformAdmin: this\.isPlatformAdmin\(\)/);
  assert.match(localData, /canCreateProject: this\.canCreateProject\(\)/);
  assert.match(localData, /if \(!this\.canCreateProject\(\)\)/);
});

test("sign-out clears auth cache and local session binding", () => {
  const signOut = read("src/lib/auth/client-sign-in.ts");
  const ipc = read("desktop/src/ipc/auth.ts");
  const session = read("desktop/src/auth/local-session-token.ts");
  assert.match(signOut, /api\.auth\.clear/);
  assert.match(ipc, /onSessionCleared/);
  assert.match(session, /clearSessionBinding/);
});

test("supabase migration reconciles owner and admin profile roles", () => {
  const sql = read("supabase/migrations/004_owner_role_reconciliation.sql");
  assert.match(sql, new RegExp(OWNER_EMAIL.replace(".", "\\.")));
  assert.match(sql, new RegExp(ADMIN_EMAIL.replace(".", "\\.")));
  assert.match(sql, /SET role = 'owner'/);
  assert.match(sql, /SET role = 'admin'/);
});

test("legacy owner email lists remain migration-only and do not grant runtime owner", () => {
  const reconciliation = read("desktop/src/services/user-identity-reconciliation-service.ts");
  assert.match(reconciliation, /isHildrethAdminEmail/);
  assert.match(reconciliation, /return "user"/);
  assert.doesNotMatch(reconciliation, /email === DEFAULT_OWNER_EMAIL[\s\S]*auth\.isPlatformAdmin/);
});

test("identity diagnostics avoid exposing auth secrets", () => {
  const reconciliation = read("desktop/src/services/user-identity-reconciliation-service.ts");
  assert.match(reconciliation, /getIdentityDiagnostics/);
  assert.doesNotMatch(reconciliation, /password/);
  assert.doesNotMatch(reconciliation, /refresh_token/);
  assert.doesNotMatch(reconciliation, /service-role/);
});
