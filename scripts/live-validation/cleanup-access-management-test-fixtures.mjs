#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import {
  classifyInvitation,
  classifyProject,
  classifyTeam,
  classifyUser,
} from "./lib/access-management-classification.mjs";
import {
  deleteValidationProjectWithAudit,
} from "./lib/validation-project-delete.mjs";
import { unregisterValidationFixtures } from "./lib/validation-fixture-registry.mjs";
import {
  isProtectedProject,
  isProtectedTeam,
  isProtectedUser,
} from "./lib/access-management-protected-records.mjs";
import { createAdminClient } from "./lib/supabase-test-helpers.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);
const INVENTORY_PATH = path.join(repoRoot, "docs", "access-management-inventory-diagnostic.json");
const OUTPUT_PATH = path.join(repoRoot, "docs", "access-management-test-fixture-cleanup.json");

function parseConfirmFlag(argv = process.argv) {
  return argv.includes("--confirm");
}

async function loadCleanupCandidates(dbClient) {
  const [teams, profiles, projects, invitations, teamMemberships, projectMembers] =
    await Promise.all([
      dbClient.query(`select * from public.teams order by name`),
      dbClient.query(`select * from public.profiles order by coalesce(full_name, email)`),
      dbClient.query(`select * from public.projects order by name`),
      dbClient.query(`select * from public.cloud_invitations order by created_at desc`),
      dbClient.query(`select team_id, user_id from public.team_memberships where status = 'active'`),
      dbClient.query(`select project_id, user_id from public.project_members`),
    ]);

  const userTeamCounts = new Map();
  for (const row of teamMemberships.rows) {
    userTeamCounts.set(row.user_id, (userTeamCounts.get(row.user_id) ?? 0) + 1);
  }
  const userProjectCounts = new Map();
  for (const row of projectMembers.rows) {
    userProjectCounts.set(row.user_id, (userProjectCounts.get(row.user_id) ?? 0) + 1);
  }

  const teamTargets = [];
  for (const row of teams.rows) {
    if (isProtectedTeam(row)) {
      continue;
    }
    const classification = classifyTeam(row);
    if (classification === "automated_test_fixture") {
      teamTargets.push({ id: row.id, name: row.name, classification });
    }
  }

  const userTargets = [];
  for (const row of profiles.rows) {
    if (isProtectedUser(row)) {
      continue;
    }
    const classification = classifyUser(row, {
      teamMembershipCount: userTeamCounts.get(row.id) ?? 0,
      projectMembershipCount: userProjectCounts.get(row.id) ?? 0,
    });
    if (classification === "automated_test_fixture" || classification === "orphaned_membership") {
      if (String(row.email ?? "").endsWith("@example.com")) {
        userTargets.push({ id: row.id, classification });
      }
    }
  }

  const projectTargets = [];
  for (const row of projects.rows) {
    if (isProtectedProject(row)) {
      continue;
    }
    const classification = classifyProject(row);
    if (classification === "automated_test_fixture") {
      projectTargets.push({ id: row.id, slug: row.slug, name: row.name, classification });
    }
  }

  const invitationTargets = [];
  for (const row of invitations.rows) {
    const classification = classifyInvitation(row);
    if (classification === "automated_test_fixture") {
      invitationTargets.push({ id: row.id, status: row.status, classification });
    }
  }

  const unknownCount =
    teams.rows.filter((row) => !isProtectedTeam(row) && classifyTeam(row) === "unknown").length +
    profiles.rows.filter((row) => !isProtectedUser(row) && classifyUser(row, {
      teamMembershipCount: userTeamCounts.get(row.id) ?? 0,
      projectMembershipCount: userProjectCounts.get(row.id) ?? 0,
    }) === "unknown").length +
    projects.rows.filter((row) => !isProtectedProject(row) && classifyProject(row) === "unknown").length +
    invitations.rows.filter((row) => classifyInvitation(row) === "unknown").length;

  return {
    teamTargets,
    userTargets,
    projectTargets,
    invitationTargets,
    unknownCount,
  };
}

async function executeCleanup(dbClient, admin, targets) {
  const counts = {
    invitations: 0,
    projects: 0,
    teams: 0,
    users: 0,
  };
  const errors = [];
  const projectDeletions = [];

  for (const invitation of targets.invitationTargets) {
    const { error } = await admin.from("cloud_invitations").delete().eq("id", invitation.id);
    if (error) {
      errors.push(`invitation:${invitation.id}:${error.message}`);
    } else {
      counts.invitations += 1;
    }
  }

  for (const project of targets.projectTargets) {
    const auditEntry = await deleteValidationProjectWithAudit(dbClient, project);
    projectDeletions.push(auditEntry);
    if (auditEntry.deletionSuccess) {
      counts.projects += 1;
    } else {
      errors.push(`project:${project.id}:${auditEntry.error ?? "delete_verification_failed"}`);
    }
  }
  unregisterValidationFixtures(
    projectDeletions.filter((entry) => entry.deletionSuccess).map((entry) => entry.id),
  );

  for (const team of targets.teamTargets) {
    await admin.from("project_team_assignments").delete().eq("team_id", team.id);
    await admin.from("team_memberships").delete().eq("team_id", team.id);
    const { error } = await admin.from("teams").delete().eq("id", team.id);
    if (error) {
      errors.push(`team:${team.id}:${error.message}`);
    } else {
      counts.teams += 1;
    }
  }

  for (const user of targets.userTargets) {
    await admin.from("team_memberships").delete().eq("user_id", user.id);
    await admin.from("project_members").delete().eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      errors.push(`user:${user.id}:${error.message}`);
    } else {
      counts.users += 1;
    }
  }

  return { counts, errors, ok: errors.length === 0, projectDeletions };
}

async function main() {
  const confirm = parseConfirmFlag();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const summary = {
    completedAt: null,
    mode: confirm ? "confirm" : "dry_run",
    diagnosticScriptError: null,
    blockedByUnknown: false,
    targets: null,
    dependencyCounts: null,
    execution: null,
    notes: [
      "Dry run by default. Re-run with --confirm to delete classified automated test fixtures only.",
      "Protected records: NEUD, Hildreth Media Group, Broad Arrow Auctions, Trevor Neuenswander.",
    ],
  };

  if (!url || !serviceRoleKey) {
    summary.diagnosticScriptError = "Missing Supabase env vars.";
    writeOutput(summary);
    process.exitCode = 1;
    return;
  }

  let dbClient;
  try {
    dbClient = await createLiveValidationDbClient();
    const targets = await loadCleanupCandidates(dbClient);
    summary.targets = targets;
    summary.dependencyCounts = {
      invitations: targets.invitationTargets.length,
      projects: targets.projectTargets.length,
      teams: targets.teamTargets.length,
      users: targets.userTargets.length,
      unknownRecordsBlockingCleanup: targets.unknownCount,
    };
    summary.blockedByUnknown = [
      ...targets.teamTargets,
      ...targets.userTargets,
      ...targets.projectTargets,
      ...targets.invitationTargets,
    ].some((target) => target.classification === "unknown");

    if (confirm) {
      if (summary.blockedByUnknown) {
        summary.execution = {
          ok: false,
          skipped: true,
          reason: "unknown_records_present",
        };
      } else {
        const admin = createAdminClient(url, serviceRoleKey);
        summary.execution = await executeCleanup(dbClient, admin, targets);
      }
    }
  } catch (error) {
    summary.diagnosticScriptError = sanitizeError(error).message;
  } finally {
    if (dbClient) {
      await dbClient.end().catch(() => {});
    }
    summary.completedAt = new Date().toISOString();
    writeOutput(summary);
    if (summary.diagnosticScriptError || summary.blockedByUnknown || summary.execution?.ok === false) {
      process.exitCode = 1;
    }
  }
}

function writeOutput(summary) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
  if (fs.existsSync(INVENTORY_PATH)) {
    console.log(`Inventory source: ${INVENTORY_PATH}`);
  }
}

main().catch((error) => {
  writeOutput({
    completedAt: new Date().toISOString(),
    diagnosticScriptError: sanitizeError(error).message,
    mode: parseConfirmFlag() ? "confirm" : "dry_run",
  });
  process.exit(1);
});
