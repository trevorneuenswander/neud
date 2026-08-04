import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("directory sync uses authenticated user session and RPC retrieval", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  const cloud = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(sync, /AuthenticatedCloudCoordinator/);
  assert.match(sync, /await this\.cloud\.getClient\(\)/);
  assert.match(sync, /supabase\.rpc\("get_authorized_users_directory"\)/);
  assert.match(sync, /supabase\.rpc\("get_accessible_project_users_directory"\)/);
  assert.doesNotMatch(sync, /auth\.admin\.listUsers/);
  assert.match(cloud, /getClient/);
});

test("desktop user sync does not create a service-role client", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  const preload = read("desktop/src/preload.ts");
  const api = read("desktop/src/services/local-api-server.ts");
  assert.doesNotMatch(sync, /createClient/);
  assert.doesNotMatch(sync, /serviceRole/);
  assert.doesNotMatch(sync, /SERVICE_ROLE/);
  assert.doesNotMatch(preload, /serviceRole/);
  assert.doesNotMatch(preload, /SERVICE_ROLE/);
  assert.doesNotMatch(api, /serviceRole/);
});

test("owner and admin authorization follows RPC policy", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(sync, /this\.auth\.isPlatformAdmin\(\)/);
  assert.match(sync, /get_authorized_users_directory/);
  assert.match(sync, /get_accessible_project_users_directory/);
});

test("sync results persist to local directory cache", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  const repository = read("desktop/src/repositories/local-users-repository.ts");
  assert.match(sync, /applySupabaseSync/);
  assert.match(sync, /USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY/);
  assert.match(repository, /getBySupabaseUserId/);
  assert.match(repository, /listByEmail/);
});

test("stale-only synchronization behavior is preserved", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(sync, /isStale\(\)/);
  assert.match(sync, /USER_DIRECTORY_SYNC_STALE_MS/);
  assert.match(localData, /syncUserDirectory\("users-page"\)/);
  assert.match(localData, /isStale\(\)/);
});

test("reconnect-only authentication validation does not trigger directory sync", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const shouldSyncBlock =
    localData.match(/const shouldSyncDirectory =[\s\S]*?;/)?.[0] ?? "";
  assert.match(localData, /shouldSyncDirectory/);
  assert.match(localData, /reason: "reconnect"/);
  assert.doesNotMatch(shouldSyncBlock, /reconnect/);
});

test("startup login and manual refresh paths can trigger sync appropriately", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(localData, /void this\.userDirectorySync\.syncNow\(/);
  assert.match(sync, /syncNow\([\s\S]*"startup"/);
  assert.match(sync, /"login"/);
  assert.match(sync, /"manual"/);
});

test("missing session fails safely during directory sync", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(sync, /Authentication required/);
  assert.match(sync, /Cloud session required/);
  assert.match(sync, /!this\.auth\.isAccessAllowed\(\)/);
  assert.match(sync, /!this\.cloud\.hasCloudSession\(\)/);
});

test("RPC failure does not erase valid existing local cache", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(sync, /Offline — showing cached users/);
  assert.match(sync, /cached users shown/);
  assert.match(sync, /isNetworkError/);
  assert.doesNotMatch(sync, /DELETE FROM local_users/);
});

test("sync matches Supabase UUID first and falls back to one email match", () => {
  const repository = read("desktop/src/repositories/local-users-repository.ts");
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(repository, /getBySupabaseUserId/);
  assert.match(repository, /listByEmail/);
  assert.match(sync, /emailMatches\.length > 1/);
  assert.match(sync, /applySupabaseSync/);
});

test("newly synced users are created without elevated access", () => {
  const repository = read("desktop/src/repositories/local-users-repository.ts");
  assert.match(repository, /platform_role, supabase_user_id, is_active[\s\S]*'user'/);
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(sync, /repairCanonicalAccounts/);
});

test("sync scheduler uses a single main-process interval", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  const main = read("desktop/src/main.ts");
  assert.match(sync, /USER_DIRECTORY_SYNC_INTERVAL_MS/);
  assert.match(sync, /syncInProgress/);
  assert.match(sync, /setInterval/);
  assert.match(main, /SupabaseUserDirectorySyncService/);
});

test("routine user sync does not write Activity records", () => {
  const sync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.doesNotMatch(sync, /recordActivity/);
  assert.doesNotMatch(sync, /activity_events/);
});

test("auth status API exposes online/offline authentication without secrets", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(api, /\/api\/auth\/status/);
  assert.match(auth, /offlineAccessRemainingMs/);
  assert.doesNotMatch(api, /serviceRole/);
  assert.doesNotMatch(api, /refresh_token/);
});
