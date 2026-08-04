#!/usr/bin/env node
/**
 * One-shot local identity cache repair using compiled desktop services.
 * Usage: npm run build -w @neud/desktop && node desktop/scripts/repair-local-identity-cache.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(os.homedir(), "AppData", "Roaming", "NEUD", "data");
const dbPath = path.join(dataDir, "neud.sqlite");

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const distConnection = path.join(repoRoot, "desktop/dist/database/connection.js");
  if (!fs.existsSync(distConnection)) {
    console.error("Build desktop first: npm run build -w @neud/desktop");
    process.exit(1);
  }

  const { openLocalDatabase } = await import(pathToFileURL(distConnection).href);
  const { LocalUsersRepository } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/dist/repositories/local-users-repository.js")).href,
  );
  const { reconcileLocalUserIdentitySync } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/services/local-user-identity-reconciliation.js"),
    ).href,
  );

  const paths = {
    root: path.join(os.homedir(), "AppData", "Roaming", "NEUD"),
    data: dataDir,
    databaseFile: dbPath,
    backups: path.join(dataDir, "backups"),
    logs: path.join(os.homedir(), "AppData", "Roaming", "NEUD", "logs"),
  };

  const db = await openLocalDatabase(paths);
  const users = new LocalUsersRepository(db);

  const supabaseUserId = "3bd404fe-7eff-45fe-9d52-296b5c953dc2";
  const email = "trevorneuenswander@gmail.com";
  const staleUserId = "323a2626-fd22-49ee-9abb-ebf6b72c8afa";

  console.info("Before repair:");
  printState(users, db, email, staleUserId);

  const result = reconcileLocalUserIdentitySync({
    db,
    users,
    supabaseUserId,
    email,
    fullName: "Trevor Neuenswander",
    platformRole: "owner",
    previousAuthUserId: staleUserId,
  });

  console.info("\nRepair result:", JSON.stringify(result, null, 2));
  console.info("\nAfter repair:");
  printState(users, db, email, staleUserId);

  db.close();
}

function printState(users, db, email, staleUserId) {
  for (const row of users.listByEmail(email)) {
    console.info(`  active id=${row.id} supabase=${row.supabaseUserId}`);
  }
  for (const row of users.listAll()) {
    if (row.email.includes(".merged.")) {
      console.info(`  merged id=${row.id} email=${row.email}`);
    }
  }
  for (const table of ["team_memberships", "local_project_memberships"]) {
    const count = db
      .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`)
      .get(staleUserId)?.count;
    console.info(`  ${table} refs for stale user: ${count ?? 0}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
