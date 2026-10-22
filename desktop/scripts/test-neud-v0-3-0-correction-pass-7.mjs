#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 7 — targeted contracts for all 8 items.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("ACTIVITY: Pass 7 named sentences + write-time migration 060", () => {
  const helper = read("src/lib/access-management/activity-subject.ts");
  const desktop = read("desktop/src/lib/activity/access-activity-description.ts");
  const migration = read("supabase/migrations/060_access_activity_named_subjects.sql");

  for (const source of [helper, desktop]) {
    assert.match(source, /Assigned \$\{label\} to project/);
    assert.match(source, /Removed \$\{label\} from project/);
    assert.match(source, /Assigned \$\{name\} to project/);
    assert.match(source, /Removed \$\{name\} from project/);
    assert.match(source, /project\.member_added/);
    assert.match(source, /Assigned User to project|assigned user to project/);
  }
  assert.match(migration, /Assigned %s to project/);
  assert.match(migration, /Removed %s from project/);
  assert.match(migration, /subjectLabel/);
  assert.match(migration, /teamName/);

  const dist = path.join(repoRoot, "desktop/dist/lib/activity/access-activity-description.js");
  if (!fs.existsSync(dist)) return;
  const {
    enrichAccessActivityDescription,
    formatProjectAccessAssignedDescription,
    formatProjectAccessRemovedDescription,
    formatProjectTeamAssignedDescription,
    formatProjectTeamRemovedDescription,
  } = require(dist);

  assert.equal(formatProjectAccessAssignedDescription("Jane Smith"), "Assigned Jane Smith to project");
  assert.equal(formatProjectAccessRemovedDescription("Jane Smith"), "Removed Jane Smith from project");
  assert.equal(
    formatProjectTeamAssignedDescription("Hildreth Media Group"),
    "Assigned Hildreth Media Group to project",
  );
  assert.equal(
    formatProjectTeamRemovedDescription("Hildreth Media Group"),
    "Removed Hildreth Media Group from project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.team_assigned",
      description: "Assigned Team to project",
      metadata: { teamName: "Hildreth Media Group" },
    }),
    "Assigned Hildreth Media Group to project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.member_added",
      description: "Project access granted.",
      metadata: { subjectFullName: "Jane Smith" },
    }),
    "Assigned Jane Smith to project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.team_assigned",
      description: "Assigned team to project.",
      metadata: {},
    }),
    "Assigned team to project.",
  );
});

test("PINNED HEIGHT: content-fit is max; user height preserved when smaller", () => {
  const page = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  const pref = read("shared/displays/pinned-viewer-preference.ts");
  assert.match(page, /maxPinnedHeightPx/);
  assert.match(page, /resolvePinnedEffectiveHeightPx/);
  assert.match(page, /resolvePinnedMaxHeightPx/);
  assert.match(pref, /DEFAULT_PINNED_VIEWER_HEIGHT_PX/);
  assert.match(pref, /hasCustomHeight/);
  assert.match(pref, /resolvePinnedEffectiveHeightPx/);
  assert.match(page, /data-pinned-max-height/);
  assert.doesNotMatch(
    page,
    /Width-first content fit is the default band height\. Manual drag can grow taller/,
  );
  assert.match(page, /Math\.min\(next, maxPinnedHeightPx\)/);
});

test("SEMA POLLING: 1–120 seconds inclusive", () => {
  const adapter = read("desktop/src/packages/sema/google-sheets-adapter.ts");
  const ui = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(adapter, /MIN_POLL_MS = 1_000/);
  assert.match(adapter, /MAX_POLL_MS = 120_000/);
  assert.match(ui, /Seconds \(1–120\)/);
  assert.match(ui, /Math\.min\(120, Math\.max\(1/);
  assert.doesNotMatch(ui, /Between 5 and 120/);
});

test("SCHEDULE TICKER: charcoal redesign, no red base, overflow-gated marquee", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /3840/);
  assert.match(html, /2160/);
  assert.match(html, /NOW/);
  assert.match(html, /NEXT/);
  assert.match(html, /LATER/);
  // Current SEMA Live bar uses dark translucent brand fill (not the earlier charcoal hex).
  assert.match(html, /--bar-bg:\s*rgba\(\s*8\s*,\s*8\s*,\s*10\s*,\s*0\.85\s*\)/);
  assert.doesNotMatch(html, /background:\s*#f00|background:\s*red|background:\s*#ff0000/i);
  assert.match(html, /marquee|overflow/i);
  assert.match(html, /requestAnimationFrame|raf/i);
});

test("MANAGE TEAM: no bottom Close footer button", () => {
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  const manageStart = panel.indexOf("Manage ${selectedTeam.name}");
  assert.ok(manageStart > 0);
  const manageBlock = panel.slice(manageStart, manageStart + 2500);
  assert.doesNotMatch(manageBlock, /footer=\{/);
  assert.doesNotMatch(manageBlock, />\s*Close\s*</);
  assert.match(panel, /Create Team/);
  assert.match(panel, />\s*Cancel\s*</);
});

test("NEUD TEAM: project count uses cloud directory total", () => {
  const roleModel = read("src/lib/access-management/role-model.ts");
  assert.match(roleModel, /isNeudTeam\(team\)/);
  assert.match(roleModel, /directory\.projects\.length/);
  assert.doesNotMatch(
    roleModel,
    /countTeamProjects[\s\S]{0,200}project_team_assignments\.insert/,
  );
});

test("OUTPUTS: stack sourceType supported", () => {
  const core = read("desktop/src/output/output-engine-core.ts");
  const manager = read("src/components/output/OutputManager.tsx");
  assert.match(core, /sourceType/);
  assert.match(core, /['\"]stack['\"]|\"stack\"|'stack'/);
  assert.match(core, /normalizeOutputRouteSource|sourceId/);
  assert.match(manager, /stack|Stack/);
  assert.match(read("src/lib/displays/display-stack-fit.ts"), /stack|layer/i);
});

test("STREAM BID: lot name descender room (Pass 14 supersedes)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /--title-line-height:|--title-ink-h:/);
  assert.match(html, /title-region|title-text-track/);
  assert.match(html, /--title-bottom-safety:\s*8px|descender|SLygj/i);
});
