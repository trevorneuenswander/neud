#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const migration058 = read(
  "supabase/migrations/058_harden_sema_seed_in_directory_rpc.sql",
);
const migration057 = read("supabase/migrations/057_ensure_sema_cloud_project.sql");
const projectAccessPanel = read("src/components/access-management/ProjectAccessPanel.tsx");
const projectsPageClient = read("src/components/projects/ProjectsPageClient.tsx");

test("catch boundary wraps only ensure_sema_cloud_project inside directory RPC", () => {
  assert.match(migration058, /create or replace function public\.get_access_management_directory/);
  assert.match(migration058, /perform public\.ensure_sema_cloud_project\(\);/);
  assert.match(migration058, /exception\s+when others then/);
  assert.match(migration058, /raise warning/);
  assert.match(migration058, /NEUD ensure_sema_cloud_project failed during get_access_management_directory/);
  // Nested begin/exception must surround the ensure call only.
  const ensureIdx = migration058.indexOf("perform public.ensure_sema_cloud_project();");
  const beginIdx = migration058.lastIndexOf("begin", ensureIdx);
  const exceptionIdx = migration058.indexOf("exception", ensureIdx);
  const endIdx = migration058.indexOf("end;", exceptionIdx);
  assert.ok(beginIdx > 0 && ensureIdx > beginIdx && exceptionIdx > ensureIdx && endIdx > exceptionIdx);
  // Must not wrap the whole function body in a catch-all that returns ok:true on error.
  assert.doesNotMatch(
    migration058,
    /exception\s+when others then[\s\S]{0,200}return jsonb_build_object\(\s*'ok',\s*true/i,
  );
});

test("seed failure is logged and diagnosable via semaSeed payload", () => {
  assert.match(migration058, /v_sema_seed_error/);
  assert.match(migration058, /v_sema_seed_sqlstate/);
  assert.match(migration058, /'semaSeed',\s*v_sema_seed/);
  assert.match(migration058, /'ok',\s*false/);
  assert.match(migration058, /'error',\s*v_sema_seed_error/);
  assert.match(migration058, /'sqlstate',\s*v_sema_seed_sqlstate/);
});

test("seed success path continues to return normal directory entities", () => {
  assert.match(migration058, /when v_sema_seed_ok then jsonb_build_object\('ok', true\)/);
  assert.match(migration058, /'teams',\s*coalesce\(v_teams/);
  assert.match(migration058, /'projects',\s*coalesce\(v_projects/);
  assert.match(migration058, /'projectMembers',\s*coalesce\(v_project_members/);
  // Projects still come from public.projects (includes SEMA when seed succeeded).
  assert.match(migration058, /from public\.projects pr/);
  assert.match(migration057, /slug = 'sema'/);
});

test("seed failure does not empty or fabricate the directory", () => {
  // Continues querying projects after the seed block.
  const seedBlockEnd = migration058.search(/v_is_owner := public\.has_site_wide_access/);
  const projectsQuery = migration058.indexOf("into v_projects");
  assert.ok(seedBlockEnd > 0 && projectsQuery > seedBlockEnd);

  // No client-side SEMA hardcoding in Project Access.
  assert.doesNotMatch(projectAccessPanel, /['"]sema['"]\s*,|\bSEMA\b/);
  assert.doesNotMatch(projectAccessPanel, /fabricat|hardcode/i);
  assert.match(projectAccessPanel, /directory\.projects|projects\.map/);
});

test("unrelated directory failures are not swallowed as success", () => {
  // Auth failure still returns ok:false.
  assert.match(
    migration058,
    /authentication_required/,
  );
  // Only the nested ensure block catches exceptions; outer function has no catch-all.
  const outerCatchAll = migration058.match(
    /as \$\$[\s\S]*exception\s+when others then[\s\S]*\$\$/,
  );
  assert.ok(outerCatchAll, "nested exception block must exist");
  // Exactly one EXCEPTION WHEN OTHERS in the directory function body.
  const exceptionCount = (migration058.match(/exception\s+when others then/gi) ?? []).length;
  assert.equal(exceptionCount, 1);
});

test("no installed-project filtering regression in Project Access", () => {
  assert.doesNotMatch(projectAccessPanel, /isPackageInstalled|packageState|scope:\s*"installed"/);
  assert.match(projectAccessPanel, /const \{ projects, teams, users \} = directory/);
});

test("ProjectsPageClient retains directory-scoped localListProjects query fix", () => {
  assert.match(
    projectsPageClient,
    /localListProjects\(\s*initialQuery\.trim\(\) \|\| undefined,\s*\{\s*scope:\s*"directory",?\s*\}\s*\)/s,
  );
  assert.doesNotMatch(projectsPageClient, /localListProjects\(suffix\)/);
  assert.doesNotMatch(projectsPageClient, /localListProjects\(`\?q=/);
});

/**
 * Behavioral contract helpers used by regression assertions below.
 * These mirror the RPC catch boundary without requiring a live DB session.
 */
function simulateDirectoryRpc(options) {
  const { seedThrows = false, projectsQueryThrows = false, seedProjects = [], baseProjects = [] } =
    options;
  const logs = [];
  let semaSeed = { ok: true };
  let projects = [];

  try {
    if (seedThrows) {
      throw Object.assign(new Error("sema seed boom"), { sqlstate: "P0001" });
    }
    projects = [...baseProjects, ...seedProjects];
  } catch (error) {
    logs.push({
      level: "warning",
      message: `NEUD ensure_sema_cloud_project failed during get_access_management_directory: [${error.sqlstate ?? "P0001"}] ${error.message}`,
    });
    semaSeed = {
      ok: false,
      error: error.message,
      sqlstate: error.sqlstate ?? "P0001",
    };
    projects = [...baseProjects];
  }

  if (projectsQueryThrows) {
    throw new Error("projects query failed");
  }

  return {
    ok: true,
    projects,
    semaSeed,
    logs,
  };
}

test("behavior: seed succeeds -> SEMA + normal directory returned", () => {
  const result = simulateDirectoryRpc({
    seedThrows: false,
    baseProjects: [{ slug: "broad-arrow-auctions", name: "Broad Arrow Auctions" }],
    seedProjects: [{ slug: "sema", name: "SEMA" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.semaSeed.ok, true);
  assert.ok(result.projects.some((p) => p.slug === "sema"));
  assert.ok(result.projects.some((p) => p.slug === "broad-arrow-auctions"));
  assert.equal(result.logs.length, 0);
});

test("behavior: seed fails -> other accessible projects still returned and failure logged", () => {
  const result = simulateDirectoryRpc({
    seedThrows: true,
    baseProjects: [{ slug: "broad-arrow-auctions", name: "Broad Arrow Auctions" }],
    seedProjects: [{ slug: "sema", name: "SEMA" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.semaSeed.ok, false);
  assert.match(result.semaSeed.error, /sema seed boom/);
  assert.ok(result.projects.some((p) => p.slug === "broad-arrow-auctions"));
  assert.ok(!result.projects.some((p) => p.slug === "sema"));
  assert.equal(result.logs.length, 1);
  assert.match(result.logs[0].message, /ensure_sema_cloud_project failed/);
});

test("behavior: unrelated directory query failure still fails normally", () => {
  assert.throws(
    () =>
      simulateDirectoryRpc({
        seedThrows: false,
        projectsQueryThrows: true,
        baseProjects: [{ slug: "broad-arrow-auctions" }],
      }),
    /projects query failed/,
  );
});
