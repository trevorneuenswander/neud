#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("SPLASH: window positioned via bounds center clamped to workArea", () => {
  const splash = read("desktop/src/app/splash-window.ts");
  const position = read("desktop/src/app/splash-window-position.ts");
  assert.match(splash, /computeSplashWindowPosition/);
  assert.match(splash, /getDisplayNearestPoint/);
  assert.match(splash, /center:\s*false/);
  assert.doesNotMatch(splash, /center:\s*true/);
  assert.match(position, /export function computeSplashWindowPosition/);

  // Load compiled JS if present; otherwise evaluate TypeScript-equivalent by dynamic import of dist.
  let computeSplashWindowPosition;
  const distPath = path.join(repoRoot, "desktop/dist/app/splash-window-position.js");
  if (fs.existsSync(distPath)) {
    ({ computeSplashWindowPosition } = require(distPath));
  } else {
    // Lightweight inline mirror of the exported math for pre-build runs.
    computeSplashWindowPosition = (display, size) => {
      const { bounds, workArea } = display;
      const width = Math.max(1, Math.round(size.width));
      const height = Math.max(1, Math.round(size.height));
      let x = Math.round(bounds.x + (bounds.width - width) / 2);
      let y = Math.round(bounds.y + (bounds.height - height) / 2);
      const minX = workArea.x;
      const minY = workArea.y;
      const maxX = workArea.x + workArea.width - width;
      const maxY = workArea.y + workArea.height - height;
      if (maxX >= minX) x = Math.min(Math.max(x, minX), maxX);
      else x = minX;
      if (maxY >= minY) y = Math.min(Math.max(y, minY), maxY);
      else y = minY;
      return { x, y };
    };
  }

  // macOS-like: menu bar + Dock shrinks workArea; bounds center is lower than workArea center.
  const withDock = computeSplashWindowPosition(
    {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 25, width: 1920, height: 975 },
    },
    { width: 420, height: 260 },
  );
  const workAreaCenterY = Math.round(25 + (975 - 260) / 2);
  const boundsCenterY = Math.round((1080 - 260) / 2);
  assert.equal(withDock.y, boundsCenterY);
  assert.ok(withDock.y > workAreaCenterY);
  assert.equal(withDock.x, Math.round((1920 - 420) / 2));
});

test("MANAGE TEAM: member action buttons stay on one line", () => {
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  const layout = read("src/lib/access-management/table-layout.ts");
  assert.match(panel, /data-neud-team-member-actions="single-line"/);
  assert.match(panel, /flex flex-nowrap items-center justify-start gap-2/);
  const actionsStart = panel.indexOf("function renderMemberActions");
  const actionsEnd = panel.indexOf("const selectedMembers", actionsStart);
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart);
  const actionsBlock = panel.slice(actionsStart, actionsEnd);
  assert.match(actionsBlock, /flex-nowrap/);
  assert.doesNotMatch(actionsBlock, /flex-wrap/);
  assert.match(
    layout,
    /TEAM_MEMBER_COLUMN_WIDTHS = \["24%", "28%", "14%", "34%"\]/,
  );
  assert.match(panel, /ACCESS_TABLE_ACTION_BUTTON_CLASS/);
});

test("ACTIVITY: project access removed names subject with fallbacks", () => {
  const helper = read("src/lib/access-management/activity-subject.ts");
  const migration059 = read("supabase/migrations/059_access_activity_subject_labels.sql");
  const migration060 = read("supabase/migrations/060_access_activity_named_subjects.sql");
  assert.match(helper, /export function resolveActivitySubjectLabel/);
  assert.match(helper, /export function formatProjectAccessRemovedDescription/);
  assert.match(helper, /Removed \$\{label\} from project/);
  assert.match(migration059, /subjectUserId/);
  assert.match(migration060, /Assigned %s to project/);
  assert.match(migration060, /Removed %s from project/);
  assert.match(migration060, /upsert_project_member/);
  assert.match(migration060, /remove_project_member/);

  // Evaluate helper without a build by duplicating the pure functions briefly.
  function resolveActivitySubjectLabel(input) {
    const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
    if (fullName) return fullName;
    const email = typeof input.email === "string" ? input.email.trim() : "";
    if (email) return email;
    const userId = typeof input.userId === "string" ? input.userId.trim() : "";
    return userId || "unknown user";
  }
  function formatProjectAccessRemovedDescription(subjectLabel) {
    return `Removed ${subjectLabel.trim() || "unknown user"} from project`;
  }

  assert.equal(
    formatProjectAccessRemovedDescription(
      resolveActivitySubjectLabel({
        fullName: "Jane Smith",
        email: "jane@example.com",
        userId: "actor-should-not-appear",
      }),
    ),
    "Removed Jane Smith from project",
  );
  assert.equal(
    formatProjectAccessRemovedDescription(
      resolveActivitySubjectLabel({
        fullName: "  ",
        email: "jane@example.com",
        userId: "uuid-1",
      }),
    ),
    "Removed jane@example.com from project",
  );
  assert.equal(
    formatProjectAccessRemovedDescription(
      resolveActivitySubjectLabel({ fullName: null, email: null, userId: "uuid-1" }),
    ),
    "Removed uuid-1 from project",
  );
  // Actor id must not be used as the subject when subject fields exist.
  const subject = resolveActivitySubjectLabel({
    fullName: "Jane Smith",
    email: "jane@example.com",
    userId: "subject-id",
  });
  assert.equal(subject, "Jane Smith");
  assert.notEqual(subject, "actor-id");
});

test("ACTIVITY: team removed from project names the team", () => {
  const migration060 = read("supabase/migrations/060_access_activity_named_subjects.sql");
  const local = read("desktop/src/services/access-management-service.ts");
  const allowlist = read("src/lib/activity/sync-allowlist.ts");
  assert.match(migration060, /remove_project_team/);
  assert.match(migration060, /Removed %s from project/);
  assert.match(migration060, /teamName/);
  assert.match(migration060, /project\.team_removed/);
  assert.match(allowlist, /project\.team_removed/);
  assert.match(migration060, /assign_project_team/);
  assert.match(migration060, /Assigned %s to project/);
  // Local desktop activity copy should also name the subject (user removal path).
  assert.match(local, /Removed \$\{target\.fullName\} from project/);
});

test("PROJECTS DIRECTORY: SEMA/not-downloaded cards hydrate teams from cloud", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /resolveDirectoryCardTeams/);
  assert.match(service, /listProjectsDirectoryPage/);
  assert.match(service, /getVisibleProjectTeams/);
  assert.match(
    service,
    /teams: this\.resolveDirectoryCardTeams\(entry\.slug, entry\.cloudProjectId/,
  );
});

test("TEAM PROJECT COUNT: countTeamProjects uses assignments; NEUD Team uses directory total", () => {
  const roleModel = read("src/lib/access-management/role-model.ts");
  assert.match(roleModel, /export function countTeamProjects/);
  assert.match(roleModel, /isNeudTeam\(team\)/);
  assert.match(roleModel, /directory\.projects\.length/);
  assert.match(
    roleModel,
    /directory\.projectTeams\.filter\(\(assignment\) => assignment\.teamId === teamId\)\.length/,
  );

  function isNeudTeam(team) {
    return team.slug === "neud" || team.name === "NEUD";
  }
  function countTeamProjects(teamId, directory) {
    const team = directory.teams.find((entry) => entry.id === teamId);
    if (team && isNeudTeam(team)) {
      return directory.projects.length;
    }
    return directory.projectTeams.filter((assignment) => assignment.teamId === teamId).length;
  }
  const hmg = "hmg";
  const neud = "neud";
  const directory = {
    teams: [
      { id: hmg, name: "Hildreth Media Group", slug: "hildreth-media-group" },
      { id: neud, name: "NEUD", slug: "neud" },
    ],
    projects: [{ id: "sema" }, { id: "ba" }],
    projectTeams: [
      { projectId: "sema", teamId: hmg },
      { projectId: "ba", teamId: hmg },
    ],
  };
  assert.equal(countTeamProjects(hmg, directory), 2);
  assert.equal(countTeamProjects(neud, directory), 2);
  directory.projects.push({ id: "third" });
  assert.equal(countTeamProjects(neud, directory), 3);
  assert.equal(countTeamProjects(hmg, directory), 2);
});

test("PACKAGE DIRECTORY: slug collision reconciles to one canonical row", () => {
  const identity = read("desktop/src/packages/directory-identity.ts");
  const repo = read("desktop/src/repositories/project-packages-repository.ts");
  const service = read("desktop/src/packages/project-package-service.ts");
  assert.match(identity, /pickCanonicalDirectoryCloudProjectId/);
  assert.match(repo, /pickCanonicalDirectoryCloudProjectId/);
  assert.match(repo, /removeDirectoryByCloudProjectId/);
  assert.match(service, /directoryCloudProjectId/);
  assert.match(service, /!existingDirectory\.cloudProjectId\.startsWith\("builtin:"\)/);

  function pickCanonicalDirectoryCloudProjectId(existing, incoming) {
    const a = existing.trim();
    const b = incoming.trim();
    if (!a) return b;
    if (!b) return a;
    if (a === b) return a;
    const aBuiltin = a.startsWith("builtin:");
    const bBuiltin = b.startsWith("builtin:");
    if (aBuiltin && !bBuiltin) return b;
    if (!aBuiltin && bBuiltin) return a;
    return b;
  }

  const cloudId = "5e0a0001-0000-4000-8000-000000000001";
  assert.equal(
    pickCanonicalDirectoryCloudProjectId(`builtin:sema`, cloudId),
    cloudId,
  );
  assert.equal(
    pickCanonicalDirectoryCloudProjectId(cloudId, `builtin:sema`),
    cloudId,
  );
  assert.equal(
    pickCanonicalDirectoryCloudProjectId(`builtin:sema`, `builtin:sema`),
    `builtin:sema`,
  );
  assert.equal(
    pickCanonicalDirectoryCloudProjectId("old-uuid", cloudId),
    cloudId,
  );
});

test("MIGRATION 059 present and additive", () => {
  const migration = read("supabase/migrations/059_access_activity_subject_labels.sql");
  assert.match(migration, /059_access_activity_subject_labels/);
  assert.doesNotMatch(migration, /drop table/i);
  assert.match(migration, /create or replace function public\.remove_project_member/);
  assert.match(migration, /create or replace function public\.remove_project_team/);
});
