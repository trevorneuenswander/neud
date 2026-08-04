#!/usr/bin/env node
import fs from "node:fs";
import initSqlJs from "sql.js";

const dbPath = process.env.NEUD_DB ?? "C:/Users/Trevor/AppData/Roaming/NEUD/data/neud.sqlite";
const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));

function q(sql) {
  const result = db.exec(sql);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

console.log("=== auth_cache ===");
console.log(q("SELECT user_id, email, display_name, team, role, last_verified_at FROM auth_cache WHERE id = 1"));

console.log("=== local_users ===");
console.log(q("SELECT id, email, full_name, platform_role, supabase_user_id, is_active FROM local_users"));

console.log("=== teams ===");
console.log(q("SELECT id, name, is_active FROM teams"));

console.log("=== team_memberships ===");
console.log(q("SELECT team_id, user_id, role, is_active FROM team_memberships"));

console.log("=== projects ===");
console.log(q("SELECT id, name, slug, project_type, is_active FROM projects"));

console.log("=== project_team_assignments ===");
console.log(
  q("SELECT project_id, team_id FROM project_team_assignments").catch?.() ??
    q("SELECT project_id, team_id FROM project_team_assignments"),
);
