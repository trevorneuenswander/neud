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
const HMG_TEAM = "Hildreth Media Group";

test("canonical owner and hildreth admin emails are distinct constants", () => {
  const desktop = read("desktop/src/auth/default-owner-email.ts");
  assert.match(desktop, /DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com"/);
  assert.match(desktop, /HILDRETH_ADMIN_EMAIL = "trevor@hildrethmedia.com"/);
  assert.match(desktop, /isHildrethAdminEmail/);
  assert.match(desktop, /isLegacyPlaceholderOwnerEmail/);
  assert.doesNotMatch(
    desktop,
    /LEGACY_PLACEHOLDER_OWNER_EMAILS[\s\S]*trevor@hildrethmedia\.com/,
  );
});

test("default owner migration demotes hildreth admin instead of deactivating", () => {
  const migration = read("desktop/src/services/default-owner-email-migration.ts");
  assert.match(migration, /isHildrethAdminEmail/);
  assert.match(migration, /platform_role = 'user', is_active = 1/);
  assert.match(migration, /demotedLegacyOwners/);
  assert.match(migration, /isLegacyPlaceholderOwnerEmail/);
});

test("users access directory repair migration restores hildreth admin account", () => {
  const migration = read("desktop/src/services/users-access-directory-repair-migration.ts");
  const main = read("desktop/src/main.ts");
  assert.match(migration, /neud\.usersAccessDirectoryRepair_v1/);
  assert.match(migration, /HILDRETH_ADMIN_EMAIL/);
  assert.match(migration, /Hildreth Media Group/);
  assert.match(migration, /reactivatedHildrethAdmin/);
  assert.match(migration, /Ambiguous Hildreth admin records/);
  assert.match(migration, /share the same Supabase UUID/);
  assert.match(main, /runUsersAccessDirectoryRepairMigration/);
});

test("identity reconciliation maps Supabase UUIDs to distinct NEUD users", () => {
  const reconciliation = read("desktop/src/services/user-identity-reconciliation-service.ts");
  assert.match(reconciliation, /resolveByAuthUserId/);
  assert.match(reconciliation, /supabaseUserId/);
  assert.match(reconciliation, /DEFAULT_OWNER_EMAIL/);
  assert.match(reconciliation, /HILDRETH_ADMIN_EMAIL/);
  assert.match(reconciliation, /isHildrethAdminEmail/);
  assert.doesNotMatch(
    reconciliation,
    /export const HILDRETH_ADMIN_EMAIL = "trevor@hildrethmedia\.com"/,
  );
});

test("owner directory query includes all users for platform owner scope", () => {
  const access = read("desktop/src/services/access-management-service.ts");
  assert.match(access, /context\.isPlatformOwner/);
  assert.match(access, /this\.users\s*\.\s*listAll\(\)/);
  assert.match(access, /return true;/);
});

test("team admin directory query scopes users to managed teams", () => {
  const access = read("desktop/src/services/access-management-service.ts");
  assert.match(access, /resolveAdminTeamIds/);
  assert.match(access, /adminTeamIds\.has\(membership\.teamId\)/);
});

test("legacy placeholder owners may still be deactivated during repair", () => {
  const repair = read("desktop/src/services/users-access-directory-repair-migration.ts");
  assert.match(repair, /isLegacyPlaceholderOwnerEmail/);
  assert.match(repair, /deactivatedPlaceholders/);
});

test("hildreth admin is not treated as disposable placeholder identity", () => {
  const desktop = read("desktop/src/auth/default-owner-email.ts");
  const migration = read("desktop/src/services/default-owner-email-migration.ts");
  assert.match(desktop, /LEGACY_PLACEHOLDER_OWNER_EMAILS[\s\S]*local@neud\.desktop/);
  assert.match(migration, /if \(isHildrethAdminEmail\(email\)\)/);
  assert.match(migration, /platform_role = 'user', is_active = 1/);
  assert.match(migration, /isLegacyPlaceholderOwnerEmail\(email\)[\s\S]*is_active = 0/);
});

test("users and access UI distinguishes global owner from team admin", () => {
  const client = read("src/components/users/LocalUsersAccessClient.tsx");
  assert.match(client, /user\.platformRole === "owner"/);
  assert.match(client, new RegExp(`Admin — \\$\\{team\\.name\\}`));
});

test("users page names link to canonical user details route", () => {
  const client = read("src/components/users/LocalUsersAccessClient.tsx");
  assert.match(client, /getUserDetailsHref/);
  assert.match(client, /viewableUserIds\.has\(user\.id\)/);
  assert.match(client, /Refresh Users/);
});

test("owner identity sync clears stale owner auth cache for hildreth admin", () => {
  const migration = read("desktop/src/services/owner-identity-sync-migration.ts");
  assert.match(migration, /shouldClearStaleOwnerAuthCache/);
});

test("local desktop identity only migrates placeholder emails", () => {
  const identity = read("desktop/src/auth/local-desktop-identity.ts");
  assert.match(identity, /isLegacyPlaceholderOwnerEmail/);
  assert.doesNotMatch(identity, /isLegacyDefaultOwnerEmail/);
});

test("repository resolves users by email with case-insensitive matching", () => {
  const repository = read("desktop/src/repositories/local-users-repository.ts");
  assert.match(repository, /COLLATE NOCASE/);
});

test("repair migration is idempotent with application migration key", () => {
  const repair = read("desktop/src/services/users-access-directory-repair-migration.ts");
  assert.match(repair, /USERS_ACCESS_DIRECTORY_REPAIR_KEY/);
  assert.match(repair, /alreadyApplied/);
  assert.match(repair, /JSON\.parse\(marker\.value_json\) === "done"/);
});

test("authorization prevents inactive users from gaining session capabilities", () => {
  const authz = read("desktop/src/services/access-authorization-service.ts");
  assert.match(authz, /!user\.isActive/);
  assert.match(authz, /resolveByAuthUserId/);
});

test("user details resolves accounts by stable user id", () => {
  const access = read("desktop/src/services/access-management-service.ts");
  const page = read("src/app/(portal)/users/[userId]/page.tsx");
  assert.match(access, /getUserDetails/);
  assert.match(page, /UserDetailsClient/);
});

test("search filter includes team names and does not hide unassigned users", () => {
  const client = read("src/components/users/LocalUsersAccessClient.tsx");
  assert.match(client, /teamNames\.some/);
  assert.doesNotMatch(client, /filter\(\(user\) => user\.isActive/);
});

test("expected email references remain limited to migration and identity modules", () => {
  const ignoredPrefixes = [
    "workers/data-engine/node_modules/",
    "desktop/node_modules/",
    "node_modules/",
  ];

  function shouldScan(relativePath) {
    return !ignoredPrefixes.some((prefix) => relativePath.startsWith(prefix));
  }

  function scanDirectory(relativeDir, matches) {
    const absoluteDir = path.join(root, relativeDir);
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, "/");
      if (!shouldScan(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        scanDirectory(relativePath, matches);
        continue;
      }
      if (!/\.(ts|tsx|sql|mjs|md|json|env|example)$/i.test(entry.name)) {
        continue;
      }
      const contents = fs.readFileSync(path.join(root, relativePath), "utf8");
      if (contents.includes(ADMIN_EMAIL)) {
        matches.push(relativePath);
      }
    }
  }

  const matches = [];
  for (const topLevel of fs.readdirSync(root, { withFileTypes: true })) {
    if (!topLevel.isDirectory() || topLevel.name === "node_modules") {
      continue;
    }
    scanDirectory(topLevel.name, matches);
  }

  assert.deepEqual(
    matches.sort(),
    [
      "desktop/scripts/test-neud-default-owner-email.mjs",
      "desktop/scripts/test-neud-owner-permissions.mjs",
      "desktop/scripts/test-neud-users-access.mjs",
      "desktop/src/auth/default-owner-email.ts",
      "src/lib/auth/default-owner-email.ts",
      "supabase/migrations/004_owner_role_reconciliation.sql",
    ].sort(),
    `Unexpected hildreth admin email references: ${matches.join(", ")}`,
  );
});

test("supabase reconciliation keeps owner and admin profile roles separate", () => {
  const sql = read("supabase/migrations/004_owner_role_reconciliation.sql");
  assert.match(sql, new RegExp(OWNER_EMAIL.replace(".", "\\.")));
  assert.match(sql, new RegExp(ADMIN_EMAIL.replace(".", "\\.")));
  assert.match(sql, /SET role = 'owner'/);
  assert.match(sql, /SET role = 'admin'/);
});

test("activity history is not rewritten by users access repair", () => {
  const repair = read("desktop/src/services/users-access-directory-repair-migration.ts");
  assert.doesNotMatch(repair, /activity_events/);
  assert.doesNotMatch(repair, /DELETE FROM activity/);
});

test("repair does not create duplicate team memberships", () => {
  const repair = read("desktop/src/services/users-access-directory-repair-migration.ts");
  assert.match(repair, /teamMemberships\.upsert/);
  assert.doesNotMatch(repair, /INSERT INTO team_memberships[\s\S]*INSERT INTO team_memberships/);
});
