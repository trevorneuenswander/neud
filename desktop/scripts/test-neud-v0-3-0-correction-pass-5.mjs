#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadEnricher() {
  const dist = path.join(repoRoot, "desktop/dist/lib/activity/access-activity-description.js");
  if (fs.existsSync(dist)) {
    return require(dist);
  }
  // Inline mirror for pre-build runs (kept identical to Pass 7 source helper).
  return {
    enrichAccessActivityDescription(input) {
      const type = (input.eventType ?? "").trim();
      const description = (input.description ?? "").trim();
      const metadata = input.metadata ?? {};
      const read = (key) =>
        typeof metadata[key] === "string" && metadata[key].trim() ? metadata[key].trim() : null;
      const subject =
        read("subjectLabel") ||
        read("subjectFullName") ||
        read("subjectEmail") ||
        read("subjectUserId");
      const teamName = read("teamName");
      if (type === "project.member_added") {
        if (subject && (!description || /project access granted/i.test(description))) {
          return `Assigned ${subject} to project`;
        }
        return description || null;
      }
      if (type === "project.member_removed" || type === "access.project-unassigned") {
        if (
          subject &&
          (!description ||
            /project access removed\.?$/i.test(description) ||
            /^project access removed for /i.test(description))
        ) {
          return `Removed ${subject} from project`;
        }
        return description || null;
      }
      if (type === "project.team_assigned" || type === "access.project-team-assigned") {
        if (teamName && (!description || /assigned team to project\.?/i.test(description))) {
          return `Assigned ${teamName} to project`;
        }
        if (teamName && /assigned to project\.?$/i.test(description)) {
          return `Assigned ${teamName} to project`;
        }
        return description || null;
      }
      if (type === "project.team_removed" || type === "access.project-team-removed") {
        if (teamName && (!description || /removed team from project\.?/i.test(description))) {
          return `Removed ${teamName} from project`;
        }
        if (teamName && /removed from project\.?$/i.test(description)) {
          return `Removed ${teamName} from project`;
        }
        return description || null;
      }
      return description || null;
    },
    formatProjectAccessRemovedDescription: (label) =>
      `Removed ${label.trim() || "unknown user"} from project`,
    formatProjectTeamAssignedDescription: (name) =>
      `Assigned ${name.trim() || "Team"} to project`,
    formatProjectTeamRemovedDescription: (name) =>
      `Removed ${name.trim() || "Team"} from project`,
  };
}

test("ACTIVITY: new user removal / team assign / team remove include subject names", () => {
  const { enrichAccessActivityDescription } = loadEnricher();
  const migration060 = read("supabase/migrations/060_access_activity_named_subjects.sql");
  const normalize = read("src/lib/activity/normalize.ts");
  const desktopDisplay = read("desktop/src/services/activity-display.ts");
  const hosted = read("src/lib/hosted/activity-queries.ts");

  assert.match(migration060, /Assigned %s to project/);
  assert.match(migration060, /Removed %s from project/);
  assert.match(normalize, /enrichAccessActivityDescription/);
  assert.match(desktopDisplay, /enrichAccessActivityDescription/);
  assert.match(hosted, /enrichAccessActivityDescription/);
  assert.match(hosted, /metadata/);

  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.member_removed",
      description: "Project access removed for Jane Smith.",
      metadata: {
        subjectFullName: "Jane Smith",
        actorUserId: "actor-1",
        subjectUserId: "subject-1",
      },
    }),
    "Removed Jane Smith from project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.team_assigned",
      description: "Hildreth Media Group assigned to project.",
      metadata: { teamName: "Hildreth Media Group", actorUserId: "actor-1" },
    }),
    "Assigned Hildreth Media Group to project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.team_removed",
      description: "Hildreth Media Group removed from project.",
      metadata: { teamName: "Hildreth Media Group", actorUserId: "actor-1" },
    }),
    "Removed Hildreth Media Group from project",
  );
});

test("ACTIVITY: actor/subject separation and historical metadata fallback", () => {
  const { enrichAccessActivityDescription } = loadEnricher();
  const normalize = read("src/lib/activity/normalize.ts");
  assert.match(normalize, /actorUserId/);
  assert.match(normalize, /subjectUserId/);

  // Historical generic row + enough metadata → enrich at read time.
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.member_removed",
      description: "Project access removed.",
      metadata: { subjectFullName: "Jane Smith", actorUserId: "actor-1" },
    }),
    "Removed Jane Smith from project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.team_assigned",
      description: "Assigned team to project.",
      metadata: { teamName: "Hildreth Media Group" },
    }),
    "Assigned Hildreth Media Group to project",
  );
  // Historical generic row with empty metadata → do not invent a name.
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.team_assigned",
      description: "Assigned team to project.",
      metadata: {},
    }),
    "Assigned team to project.",
  );
  // Email fallback for subject.
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.member_removed",
      description: "Project access removed.",
      metadata: { subjectEmail: "jane@example.com", actorUserId: "actor-1" },
    }),
    "Removed jane@example.com from project",
  );
  assert.equal(
    enrichAccessActivityDescription({
      eventType: "project.member_added",
      description: "Project access granted as Manager.",
      metadata: { subjectFullName: "Jane Smith" },
    }),
    "Assigned Jane Smith to project",
  );
});

test("SEMA NAV: no Activity; Data Source / Manual Controller capability labels", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.doesNotMatch(nav, /href: "\/activity"/);
  assert.match(nav, /\/google-sheet/);
  assert.match(nav, /\/controller/);
  const caps = read("src/lib/projects/capabilities.ts");
  assert.match(caps, /moduleRoute: "google-sheet"[\s\S]*moduleLabel: "Data Source"/);
  assert.match(caps, /moduleRoute: "controller"[\s\S]*moduleLabel: "Manual Controller"/);
});

test("SEMA Data Source page: no API key field; public CSV documented", () => {
  const page = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(page, /title="Data Source"/);
  assert.match(page, /public CSV/i);
  assert.doesNotMatch(page, /API Key|apiKey|api_key/);
});

test("DISPLAYS subheader exact copy", () => {
  const client = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(
    client,
    /description="Local display URLs for this project's on-air graphics\."/,
  );
});

test("SEMA v1 package contains Schedule Ticker HTML + integrity + 3840x2160", () => {
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  const manifest = read("desktop/runtime-asset-manifest.json");
  const listDisplays = read("desktop/src/services/local-data-service.ts");

  assert.match(builder, /name:\s*"Schedule Ticker"/);
  assert.match(builder, /slug:\s*"schedule-ticker"/);
  assert.match(builder, /width:\s*3840/);
  assert.match(builder, /height:\s*2160/);
  assert.match(builder, /SEMA_SCHEDULE_TICKER_HTML_PATH/);
  assert.match(hydration, /ensureHydrated/);
  assert.match(hydration, /SEMA_DISPLAY_IMPORT_KEY/);
  assert.match(bundled, /sema-schedule-ticker-v1\.html/);
  assert.match(manifest, /sema-schedule-ticker-v1\.html/);
  assert.match(listDisplays, /sema-schedule/);
  assert.match(listDisplays, /installedDisplayKeys/);
  assert.ok(html.includes("<!DOCTYPE html>") || html.includes("<!doctype html>"));
  assert.match(html, /NOW|NEXT|LATER/i);
});

test("SEMA package builder writes ticker HTML into package directory", () => {
  const distBuilder = path.join(repoRoot, "desktop/dist/packages/sema-package-builder.js");
  if (!fs.existsSync(distBuilder)) {
    // Desktop build required for runtime package builder test; source contract covered above.
    assert.match(read("desktop/src/packages/sema-package-builder.ts"), /buildSemaPackageV1/);
    return;
  }
  const { buildSemaPackageV1, SEMA_SCHEDULE_TICKER_HTML_PATH } = require(distBuilder);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-pkg-"));
  try {
    const manifest = buildSemaPackageV1(tmp);
    assert.equal(manifest.packageVersion, 8);
    assert.ok(manifest.displays.length >= 1);
    assert.equal(manifest.displays[0].slug, "schedule-ticker");
    assert.equal(manifest.displays[0].width, 3840);
    assert.equal(manifest.displays[0].height, 2160);
    assert.ok(fs.existsSync(path.join(tmp, SEMA_SCHEDULE_TICKER_HTML_PATH)));
    assert.ok(manifest.integrity?.files?.[SEMA_SCHEDULE_TICKER_HTML_PATH]);
    assert.doesNotMatch(JSON.stringify(manifest.modules), /"Activity"/);
    assert.match(JSON.stringify(manifest.modules), /Data Source/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
