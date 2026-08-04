#!/usr/bin/env node
/**
 * Development helper: inspect and repair local_users identity duplicates.
 * Usage: node desktop/scripts/diagnose-local-identity-cache.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dbPath = path.join(os.homedir(), "AppData", "Roaming", "NEUD", "data", "neud.sqlite");

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  process.chdir(path.join(repoRoot, "desktop"));
  const { openLocalDatabase } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/database/connection.js")).href
  );
  const { LocalUsersRepository } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/repositories/local-users-repository.js")).href
  );
  const { reconcileLocalUserIdentitySync } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/services/local-user-identity-reconciliation.js"),
    ).href
  );

  const db = await openLocalDatabase(dbPath);
  const users = new LocalUsersRepository(db);

  const email = "trevorneuenswander@gmail.com";
  const supabaseUserId = "3bd404fe-7eff-45fe-9d52-296b5c953dc2";
  const staleUserId = "323a2626-fd22-49ee-9abb-ebf6b72c8afa";

  const matches = users.listByEmail(email);
  console.info("Existing local_users rows for email:");
  for (const row of matches) {
    console.info(
      `  id=${row.id} email=${row.email} supabase_user_id=${row.supabaseUserId ?? "null"} role=${row.platformRole} active=${row.isActive}`,
    );
  }

  const linked = users.getBySupabaseUserId(supabaseUserId);
  console.info(`Linked row for Supabase user: ${linked?.id ?? "none"}`);

  const stale = users.getById(staleUserId);
  console.info(`Stale row ${staleUserId}: ${stale ? "exists" : "missing"}`);

  const result = reconcileLocalUserIdentitySync({
    db,
    users,
    supabaseUserId,
    email,
    fullName: "Trevor Neuenswander",
    platformRole: "owner",
    previousAuthUserId: staleUserId,
  });

  console.info("Reconciliation result:", JSON.stringify(result, null, 2));

  const after = users.listByEmail(email);
  console.info("Rows after reconciliation:");
  for (const row of after) {
    console.info(
      `  id=${row.id} email=${row.email} supabase_user_id=${row.supabaseUserId ?? "null"} role=${row.platformRole}`,
    );
  }

  db.close?.();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
