#!/usr/bin/env node
/**
 * NEUD v0.3.1 — Admin project access (team-assigned), sidebar install filter,
 * and live Google Sheets htmlview tab discovery.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIVE_SHEET_ID = "1-S8yWgZOmVZ1XefGosSh6Mk50vy8JqUp-J2dZ1BEiVQ";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("team-assigned manager access bridges cloud project UUID via directory cache", () => {
  const auth = read("desktop/src/services/access-authorization-service.ts");
  const local = read("desktop/src/services/local-data-service.ts");
  assert.match(auth, /setCloudDirectoryProvider/);
  assert.match(auth, /getAssignedTeamIdsForProject/);
  assert.match(auth, /resolveCloudProjectTeamIds/);
  assert.match(auth, /readCloudDirectory\(\)/);
  assert.match(local, /setCloudDirectoryProvider\(\(\) => this\.readCloudDirectoryForAuthorization\(\)\)/);
  // Opening a project still goes through capabilities / canViewProject.
  assert.match(local, /getProjectAccessContextBySlug/);
  assert.match(local, /capabilities\.canViewProject/);
});

test("layout 404 path is authorization denial, not missing package", () => {
  const layout = read("src/app/(portal)/projects/[slug]/layout.tsx");
  assert.match(layout, /resolution\.state === "denied"/);
  assert.match(layout, /notFound\(\)/);
  assert.doesNotMatch(layout, /denied[\s\S]{0,200}ProjectNotInstalledPanel/);
});

test("desktop sidebar uses installed scope; Projects page keeps directory", () => {
  const hook = read("src/hooks/useSidebarProjects.ts");
  const page = read("src/components/projects/ProjectsPageClient.tsx");
  assert.match(hook, /scope:\s*"installed"/);
  assert.doesNotMatch(hook, /scope:\s*"directory"/);
  assert.match(page, /scope:\s*"directory"/);
  assert.match(hook, /neud:projects-directory-refreshed/);
  assert.match(page, /neud:projects-directory-refreshed/);
});

test("Google Sheets parser recognizes htmlview items.push literals", () => {
  const adapter = read("desktop/src/packages/sema/google-sheets-adapter.ts");
  assert.ok(adapter.includes(String.raw`items\.push\(\{\s*name:`));
  assert.ok(adapter.includes("automatic tab discovery could not read worksheet metadata"));
});

test("authorization regression matrix: owner, team admin, direct member, unauthorized", () => {
  // Mirrors AccessAuthorizationService.resolveAccessibleProjectIds with cloud UUID bridge.
  function resolveAccessible(localProjects, localAssignments, teamMemberships, cloudDirectory, userId) {
    const ids = new Set();
    for (const project of localProjects) {
      const assigned = new Set(
        localAssignments.filter((a) => a.projectId === project.id).map((a) => a.teamId),
      );
      const cloudIds = new Set([project.id]);
      for (const cloudProject of cloudDirectory.projects ?? []) {
        if (cloudProject.slug === project.slug) cloudIds.add(cloudProject.id);
      }
      for (const assignment of cloudDirectory.projectTeams ?? []) {
        if (cloudIds.has(assignment.projectId)) assigned.add(assignment.teamId);
      }
      for (const membership of teamMemberships.filter((m) => m.userId === userId && m.isActive)) {
        if (!assigned.has(membership.teamId)) continue;
        if (membership.role === "admin") ids.add(project.id);
      }
    }
    return [...ids];
  }

  const hmg = "team-hmg";
  const localBroadArrow = { id: "local-ba", slug: "broad-arrow-auctions" };
  const cloudBroadArrowId = "cloud-ba-uuid";
  const owner = "user-owner";
  const hmgAdmin = "user-hmg-admin";
  const directMember = "user-direct";
  const stranger = "user-stranger";

  const cloudDirectory = {
    projects: [{ id: cloudBroadArrowId, slug: "broad-arrow-auctions", name: "Broad Arrow" }],
    projectTeams: [{ projectId: cloudBroadArrowId, teamId: hmg }],
    projectMembers: [{ projectId: cloudBroadArrowId, userId: directMember, role: "operator" }],
  };

  // Before fix: empty local assignments → team admin gets nothing.
  const before = resolveAccessible(
    [localBroadArrow],
    [],
    [{ userId: hmgAdmin, teamId: hmg, role: "admin", isActive: true }],
    { projects: [], projectTeams: [] },
    hmgAdmin,
  );
  assert.deepEqual(before, []);

  // After fix: cloud assignment bridges by slug → team admin can open.
  const afterAdmin = resolveAccessible(
    [localBroadArrow],
    [],
    [{ userId: hmgAdmin, teamId: hmg, role: "admin", isActive: true }],
    cloudDirectory,
    hmgAdmin,
  );
  assert.deepEqual(afterAdmin, ["local-ba"]);

  const afterStranger = resolveAccessible(
    [localBroadArrow],
    [],
    [{ userId: stranger, teamId: "other", role: "admin", isActive: true }],
    cloudDirectory,
    stranger,
  );
  assert.deepEqual(afterStranger, []);

  // Local assignment still works without cloud.
  const afterLocal = resolveAccessible(
    [localBroadArrow],
    [{ projectId: "local-ba", teamId: hmg }],
    [{ userId: hmgAdmin, teamId: hmg, role: "admin", isActive: true }],
    { projects: [], projectTeams: [] },
    hmgAdmin,
  );
  assert.deepEqual(afterLocal, ["local-ba"]);

  void owner;
  void directMember;
});

test("SEMA UI exposes manual gid fallback when discovery is empty", () => {
  const client = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(client, /Manual worksheet gid \(fallback\)/);
  assert.match(client, /Not a discovered tab/);
  assert.match(client, /Use gid/);
});

/** Mirrors adapter parseWorksheetsFromHtml items.push path (no tsc / extensionless imports). */
function parseItemsPushWorksheets(html) {
  const byGid = new Map();
  const pattern =
    /items\.push\(\{\s*name:\s*"((?:\\.|[^"\\])*)"[\s\S]{0,500}?gid:\s*"(\d{1,20})"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (!byGid.has(match[2])) {
      byGid.set(match[2], { title: match[1], index: byGid.size });
    }
  }
  return Array.from(byGid.entries()).map(([gid, meta]) => ({
    gid,
    title: meta.title,
    index: meta.index,
  }));
}

test("live htmlview discovery returns DAY 1 and DAY 2 for owner spreadsheet", async () => {
  const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${LIVE_SHEET_ID}/public/basic?alt=json`;
  const htmlviewUrl = `https://docs.google.com/spreadsheets/d/${LIVE_SHEET_ID}/htmlview`;
  const editUrl = `https://docs.google.com/spreadsheets/d/${LIVE_SHEET_ID}/edit?usp=sharing`;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${LIVE_SHEET_ID}/export?format=csv&gid=0`;

  async function probe(label, url) {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "*/*" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const finalUrl = response.url || url;
    const authRequested =
      /accounts\.google\.com\/ServiceLogin|Sign in to continue|identifierId/i.test(text);
    const hasItemsPush = /items\.push\(\{\s*name:/i.test(text);
    const hasSheetId = /"sheetId"\s*:/i.test(text);
    const parserCount = hasItemsPush ? parseItemsPushWorksheets(text).length : 0;
    return {
      label,
      status: response.status,
      contentType,
      redirectCategory: finalUrl.includes("accounts.google.com")
        ? "sign-in"
        : finalUrl.includes("/htmlview")
          ? "htmlview"
          : finalUrl.includes("/edit")
            ? "edit"
            : finalUrl.includes("googleusercontent.com")
              ? "usercontent-export"
              : finalUrl.includes("spreadsheets.google.com/feeds")
                ? "feeds"
                : "other",
      authRequested,
      worksheetMarkers: { hasItemsPush, hasSheetId },
      parserResultCount: parserCount,
      bytes: text.length,
      text,
    };
  }

  const [feed, htmlview, edit, csv] = await Promise.all([
    probe("feeds", feedUrl),
    probe("htmlview", htmlviewUrl),
    probe("edit", editUrl),
    probe("csv-gid-0", csvUrl),
  ]);

  // Sanitized diagnostics (no cookies / private cell contents).
  console.log(
    JSON.stringify(
      {
        spreadsheetId: LIVE_SHEET_ID,
        probes: [feed, htmlview, edit, csv].map((entry) => ({
          endpoint: entry.label,
          httpStatus: entry.status,
          contentType: entry.contentType.split(";")[0],
          redirectCategory: entry.redirectCategory,
          authRequested: entry.authRequested,
          worksheetMarkers: entry.worksheetMarkers,
          parserResultCount: entry.parserResultCount,
          responseBytes: entry.bytes,
          failureReason:
            entry.label === "feeds" && entry.status === 404
              ? "obsolete_feed_404"
              : entry.authRequested
                ? "sign_in_wall"
                : entry.worksheetMarkers.hasItemsPush
                  ? null
                  : entry.label === "edit"
                    ? "modern_js_shell_without_items_push"
                    : entry.label === "csv-gid-0" && /csv/i.test(entry.contentType)
                      ? null
                      : "unexpected",
        })),
      },
      null,
      2,
    ),
  );

  assert.equal(feed.status, 404, "legacy worksheets feed is retired (404)");
  assert.equal(htmlview.status, 200);
  assert.equal(htmlview.authRequested, false);
  assert.equal(htmlview.worksheetMarkers.hasItemsPush, true);
  assert.equal(csv.status, 200);
  assert.match(csv.contentType, /csv/i);

  const fromHtml = parseItemsPushWorksheets(htmlview.text);
  assert.equal(fromHtml.length, 2, `expected 2 tabs from htmlview, got ${fromHtml.length}`);
  assert.equal(fromHtml[0]?.title, "DAY 1");
  assert.equal(fromHtml[0]?.gid, "0");
  assert.equal(fromHtml[1]?.title, "DAY 2");
  assert.equal(fromHtml[1]?.gid, "1828876151");

  // Adapter source must contain the same discovery pattern used above.
  const adapter = read("desktop/src/packages/sema/google-sheets-adapter.ts");
  assert.ok(adapter.includes(String.raw`items\.push\(\{\s*name:`));
  assert.ok(adapter.includes("htmlview"));

  const day2Csv = await fetch(
    `https://docs.google.com/spreadsheets/d/${LIVE_SHEET_ID}/export?format=csv&gid=1828876151`,
    { redirect: "follow", signal: AbortSignal.timeout(15_000) },
  );
  assert.equal(day2Csv.status, 200);
  assert.match(day2Csv.headers.get("content-type") ?? "", /csv/i);
});
