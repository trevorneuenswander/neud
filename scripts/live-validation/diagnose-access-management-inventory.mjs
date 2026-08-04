#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import {
  sanitizeInvitationRecord,
  sanitizeProjectRecord,
  sanitizeTeamRecord,
  sanitizeUserRecord,
  summarizeInventoryCounts,
} from "./lib/access-management-classification.mjs";
import {
  isProtectedProject,
  isProtectedTeam,
  PROTECTED_USER_NAME_PATTERN,
} from "./lib/access-management-protected-records.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);
const OUTPUT_PATH = path.join(repoRoot, "docs", "access-management-inventory-diagnostic.json");

async function loadInventory(dbClient) {
  const [
    teamsResult,
    profilesResult,
    projectsResult,
    invitationsResult,
    teamMembershipsResult,
    projectMembersResult,
    projectTeamsResult,
    displaysResult,
  ] = await Promise.all([
    dbClient.query(`
      select t.id, t.name, t.slug, t.created_at, t.created_by, t.is_active, t.deleted_at
      from public.teams t
      order by t.name
    `),
    dbClient.query(`
      select p.id, p.full_name, p.email, p.role, p.created_at
      from public.profiles p
      order by coalesce(p.full_name, p.email)
    `),
    dbClient.query(`
      select p.id, p.slug, p.name, p.is_active, p.archived_at, p.created_at
      from public.projects p
      order by p.name
    `),
    dbClient.query(`
      select i.id, i.email_normalized, i.status, i.created_at, i.expires_at, i.team_id,
             coalesce(jsonb_array_length(i.project_assignments), 0) as project_assignment_count
      from public.cloud_invitations i
      order by i.created_at desc
    `),
    dbClient.query(`
      select team_id, user_id
      from public.team_memberships
      where status = 'active'
    `),
    dbClient.query(`
      select project_id, user_id
      from public.project_members
    `),
    dbClient.query(`
      select project_id, team_id
      from public.project_team_assignments
    `),
    dbClient.query(`
      select project_id, count(*)::integer as display_count
      from public.displays
      where deleted_at is null
      group by project_id
    `),
  ]);

  const teamMemberCounts = new Map();
  for (const row of teamMembershipsResult.rows) {
    teamMemberCounts.set(row.team_id, (teamMemberCounts.get(row.team_id) ?? 0) + 1);
  }

  const projectMemberCounts = new Map();
  for (const row of projectMembersResult.rows) {
    projectMemberCounts.set(row.project_id, (projectMemberCounts.get(row.project_id) ?? 0) + 1);
  }

  const userTeamCounts = new Map();
  for (const row of teamMembershipsResult.rows) {
    userTeamCounts.set(row.user_id, (userTeamCounts.get(row.user_id) ?? 0) + 1);
  }

  const userProjectCounts = new Map();
  for (const row of projectMembersResult.rows) {
    userProjectCounts.set(row.user_id, (userProjectCounts.get(row.user_id) ?? 0) + 1);
  }

  const teamProjectCounts = new Map();
  for (const row of projectTeamsResult.rows) {
    teamProjectCounts.set(row.team_id, (teamProjectCounts.get(row.team_id) ?? 0) + 1);
  }

  const displayCounts = new Map(
    displaysResult.rows.map((row) => [row.project_id, row.display_count]),
  );

  const teams = teamsResult.rows.map((row) =>
    sanitizeTeamRecord(row, {
      memberCount: teamMemberCounts.get(row.id) ?? 0,
      projectCount: teamProjectCounts.get(row.id) ?? 0,
    }),
  );

  const users = profilesResult.rows.map((row) =>
    sanitizeUserRecord(row, {
      teamMembershipCount: userTeamCounts.get(row.id) ?? 0,
      projectMembershipCount: userProjectCounts.get(row.id) ?? 0,
    }),
  );

  const projects = projectsResult.rows.map((row) =>
    sanitizeProjectRecord(row, {
      projectMemberCount: projectMemberCounts.get(row.id) ?? 0,
      displayCount: displayCounts.get(row.id) ?? 0,
    }),
  );

  const invitations = invitationsResult.rows.map((row) =>
    sanitizeInvitationRecord(row, {
      projectAssignmentCount: Number(row.project_assignment_count ?? 0),
    }),
  );

  return { teams, users, projects, invitations };
}

async function main() {
  const summary = {
    completedAt: null,
    diagnosticScriptError: null,
    protectedRecords: {
      teams: ["NEUD", "Hildreth Media Group"],
      projects: ["Broad Arrow Auctions"],
      users: ["Trevor Neuenswander"],
    },
    inventory: null,
    counts: null,
    classificationSummary: null,
    fixtureSources: [
      {
        script: "scripts/live-validation/run-access-photo-matrix.mjs",
        creates: ["Matrix Team *", "access-owner-*", "access-outsider-*", "invitee-* invitations"],
        cleanupPreviously: "finally block with registry + postgres project delete",
      },
      {
        script: "scripts/live-validation/run-live-matrix.mjs",
        creates: ["live-admin-*", "live-owner-*", "live-manager-*", "neud-validation-* projects"],
        cleanupPreviously: "finally block with registry + postgres project delete",
      },
      {
        script: "scripts/live-validation/diagnose-access-directory-rpc.mjs",
        creates: ["directory-diagnose-* owner when env credentials absent"],
        cleanupPreviously: "none (ephemeral auth user only)",
      },
    ],
    notes: [
      "No tokens, invitation hashes, full private emails, or directory payloads are included.",
      "Use npm run cleanup:access-management-test-fixtures for dry-run cleanup planning.",
    ],
  };

  let dbClient;
  try {
    dbClient = await createLiveValidationDbClient();
    const inventory = await loadInventory(dbClient);
    summary.inventory = inventory;
    summary.counts = {
      teams: inventory.teams.length,
      users: inventory.users.length,
      projects: inventory.projects.length,
      invitations: inventory.invitations.length,
    };
    summary.classificationSummary = {
      teams: summarizeInventoryCounts(inventory.teams),
      users: summarizeInventoryCounts(inventory.users),
      projects: summarizeInventoryCounts(inventory.projects),
      invitations: summarizeInventoryCounts(inventory.invitations),
    };
    summary.protectedMatches = {
      teams: inventory.teams.filter((team) => isProtectedTeam({ name: team.name })).map((team) => team.id),
      projects: inventory.projects
        .filter((project) => isProtectedProject({ slug: project.slug, name: project.name }))
        .map((project) => project.id),
      users: inventory.users
        .filter((user) => PROTECTED_USER_NAME_PATTERN.test(String(user.displayName ?? "")))
        .map((user) => user.id),
    };
  } catch (error) {
    summary.diagnosticScriptError = sanitizeError(error).message;
  } finally {
    if (dbClient) {
      await dbClient.end().catch(() => {});
    }
    summary.completedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${OUTPUT_PATH}`);
    if (summary.diagnosticScriptError) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  const summary = {
    completedAt: new Date().toISOString(),
    diagnosticScriptError: sanitizeError(error).message,
    inventory: null,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.exit(1);
});
