import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const NEW_EMAIL = "trevorneuenswander@gmail.com";
const OLD_EMAIL = "trevor@hildrethmedia.com";

test("default owner email constant is trevorneuenswander@gmail.com", () => {
  const desktop = readSrc("desktop/src/auth/default-owner-email.ts");
  const web = readSrc("src/lib/auth/default-owner-email.ts");
  assert.match(desktop, /DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com"/);
  assert.match(web, /DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com"/);
});

test("project creator defaults use shared owner email constant", () => {
  const webCreator = readSrc("src/lib/displays/creator.ts");
  const desktopCreator = readSrc("desktop/src/displays/creator.ts");
  assert.match(webCreator, /DEFAULT_OWNER_EMAIL/);
  assert.match(desktopCreator, /DEFAULT_OWNER_EMAIL/);
  assert.doesNotMatch(webCreator, new RegExp(OLD_EMAIL));
  assert.doesNotMatch(desktopCreator, new RegExp(OLD_EMAIL));
});

test("local desktop identity seeds the default owner email", () => {
  const identity = readSrc("desktop/src/auth/local-desktop-identity.ts");
  assert.match(identity, /email: DEFAULT_OWNER_EMAIL/);
  assert.match(identity, /isLegacyPlaceholderOwnerEmail/);
  assert.doesNotMatch(identity, /local@neud\.desktop/);
});

test("access migration fallback owner uses default owner email", () => {
  const migration = readSrc("desktop/src/services/access-data-migration.ts");
  assert.match(migration, /email: DEFAULT_OWNER_EMAIL/);
  assert.doesNotMatch(migration, /owner@neud\.local/);
});

test("default owner email migration rewrites legacy owner records once", () => {
  const migration = readSrc("desktop/src/services/default-owner-email-migration.ts");
  const main = readSrc("desktop/src/main.ts");
  assert.match(migration, /neud\.defaultOwnerEmailMigration_v1/);
  assert.match(migration, /HILDRETH_ADMIN_EMAIL/);
  assert.match(migration, /isHildrethAdminEmail/);
  assert.match(migration, /LEGACY_DEFAULT_OWNER_EMAILS/);
  assert.match(migration, /isLegacyPlaceholderOwnerEmail/);
  assert.match(migration, /demotedLegacyOwners/);
  assert.match(migration, /deactivatedLegacyOwners/);
  assert.match(migration, /DELETE FROM auth_cache/);
  assert.match(main, /runDefaultOwnerEmailMigration/);
});

test("repository search finds no remaining legacy default owner email references", () => {
  const ignoredPrefixes = [
    "workers/data-engine/node_modules/",
    "desktop/node_modules/",
    "node_modules/",
  ];

  function shouldScan(relativePath) {
    return !ignoredPrefixes.some((prefix) => relativePath.startsWith(prefix));
  }

  function scanDirectory(relativeDir, matches) {
    const absoluteDir = path.join(repoRoot, relativeDir);
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
      const contents = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      if (contents.includes(OLD_EMAIL)) {
        matches.push(relativePath);
      }
    }
  }

  const matches = [];
  for (const topLevel of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (!topLevel.isDirectory()) {
      continue;
    }
    if (topLevel.name === "node_modules") {
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
    `Unexpected legacy owner email references: ${matches.join(", ")}`,
  );
});
