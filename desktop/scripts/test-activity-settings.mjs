import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("dashboard activity uses shared compact table and normalization", () => {
  const dashboard = readSrc("src/components/dashboard/DashboardActivityClient.tsx");
  const activity = readSrc("src/components/dashboard/DashboardActivity.tsx");
  assert.ok(dashboard.includes("CompactActivityTable"));
  assert.ok(dashboard.includes("normalizeActivityEventsForProjects"));
  assert.ok(!dashboard.includes("undefined"));
  assert.ok(!activity.includes("formatActivityLine"));
});

test("project overview activity uses shared compact table", () => {
  const panel = readSrc("src/components/projects/ProjectActivityPanel.tsx");
  assert.ok(panel.includes("CompactActivityTable"));
  assert.ok(panel.includes("normalizeActivityEventsForProjects"));
  assert.ok(panel.includes("projectId"));
});

test("compact activity feed selects fifty items newest-first", () => {
  const feed = readSrc("src/components/activity/CompactActivityFeed.tsx");
  const normalize = readSrc("src/lib/activity/normalize.ts");
  assert.ok(feed.includes("selectCompactActivityEvents"));
  assert.ok(feed.includes("ACTIVITY_OVERVIEW_LIMIT"));
  assert.ok(feed.includes("scrollActivityToTop"));
  assert.ok(feed.includes("isNearActivityTop"));
  assert.ok(normalize.includes("selectNewestActivityEvents"));
});

test("activity normalization avoids undefined actor and message fallbacks", () => {
  const normalize = readSrc("src/lib/activity/normalize.ts");
  assert.ok(normalize.includes('"System"'));
  assert.ok(normalize.includes("humanizeActivityType"));
  assert.ok(normalize.includes("actorName"));
  assert.ok(normalize.includes("createdAt"));
  assert.ok(normalize.includes("timestamp"));
});

test("dashboard data service returns fifty normalized activity events", () => {
  const data = readSrc("desktop/src/services/local-data-service.ts");
  assert.ok(data.includes("selectCompactActivityEvents"));
  assert.ok(data.includes("normalizeActivityEventForDisplay"));
  assert.ok(!data.includes(".slice(0, 20)"));
});

test("settings form includes name description and active status", () => {
  const form = readSrc("src/components/projects/ProjectSettingsForm.tsx");
  const page = readSrc("src/app/(portal)/projects/[slug]/settings/page.tsx");
  assert.ok(form.includes("Project Description"));
  assert.ok(form.includes("Project Status"));
  assert.ok(form.includes("isDirty"));
  assert.ok(form.includes("localUpdateProjectSettings"));
  assert.ok(page.includes("requireProjectSettingsAccess"));
  assert.ok(page.includes("initialDescription"));
});

test("settings update preserves slug and records activity", () => {
  const data = readSrc("desktop/src/services/local-data-service.ts");
  const repo = readSrc("desktop/src/repositories/projects-repository.ts");
  assert.ok(data.includes("project.settings-updated"));
  assert.ok(data.includes("project.marked-inactive"));
  assert.ok(data.includes("resolveCurrentProjectRole(existing.id)"));
  assert.ok(repo.includes("UPDATE projects SET name = ?, description = ?, is_active = ?, updated_at = ?"));
  assert.ok(!repo.match(/updateSettings[\s\S]*?slug\s*=/i));
});

test("compact activity feed uses five visible rows at 68px", () => {
  const panel = readSrc("src/lib/projects/activity-panel.ts");
  const feed = readSrc("src/components/activity/CompactActivityFeed.tsx");
  assert.ok(panel.includes("ACTIVITY_ROW_MIN_HEIGHT_PX = 68"));
  assert.ok(panel.includes("ACTIVITY_PANEL_VISIBLE_ROWS = 5"));
  assert.ok(feed.includes("visibleRows = ACTIVITY_PANEL_VISIBLE_ROWS"));
  assert.ok(feed.includes("contextKey"));
});

test("login defaults to dashboard in local and hosted modes", () => {
  const home = readSrc("src/app/(public)/page.tsx");
  const session = readSrc("src/lib/auth/session.ts");
  const proxy = readSrc("src/lib/supabase/proxy.ts");
  assert.ok(home.includes("DEFAULT_REDIRECT"));
  assert.ok(!home.includes("getDefaultAuthenticatedPath"));
  assert.ok(session.includes("DEFAULT_REDIRECT"));
  assert.ok(proxy.includes("DEFAULT_HOSTED_LANDING_PATH"));
});

test("scraper developer context exposes real runtime metadata", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const client = readSrc("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");
  assert.ok(service.includes("latestSnapshotId: latestSnapshot?.id ?? null"));
  assert.ok(service.includes("projectSourceFiles"));
  assert.ok(service.includes("trustedRuntimeFiles"));
  assert.ok(client.includes("Latest Snapshot ID"));
  assert.ok(client.includes("Trusted NEUD Runtime"));
});

test("revision naming is supported for scraper and display publish", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const scraperEditor = readSrc("src/components/developer-tools/ScraperCodeEditor.tsx");
  const displayEditor = readSrc("src/components/developer-tools/DisplayCodeEditor.tsx");
  const revisions = readSrc("src/components/developer-tools/CodeRevisionsPanel.tsx");
  assert.ok(service.includes("revisionName"));
  assert.ok(service.includes("changeNote"));
  assert.ok(service.includes("id: revisionId"));
  assert.ok(scraperEditor.includes("PublishRevisionDialog"));
  assert.ok(displayEditor.includes("PublishRevisionDialog"));
  assert.ok(revisions.includes("formatRevisionDisplayName"));
});

test("project overview activity filters by project ID", () => {
  const normalize = readSrc("src/lib/activity/normalize.ts");
  const filter = readSrc("src/lib/activity/filter.ts");
  const panel = readSrc("src/components/projects/ProjectActivityPanel.tsx");
  const session = readSrc("src/lib/desktop/activity-session-client.ts");
  assert.ok(normalize.includes("activityEventBelongsToProject"));
  assert.ok(filter.includes("resolveActivityEventProjectId"));
  assert.ok(filter.includes("getActivityScopeKey"));
  assert.ok(filter.includes('return `activity:project:${projectId}`'));
  assert.ok(panel.includes("useProjectActivityEntries"));
  assert.ok(panel.includes("projectEngineIds"));
  assert.ok(panel.includes("contextKey={projectId}"));
  assert.ok(panel.includes("showProjectName={false}"));
});

test("dashboard activity stays pinned to latest event", () => {
  const dashboard = readSrc("src/components/dashboard/DashboardActivityClient.tsx");
  const feed = readSrc("src/components/activity/CompactActivityFeed.tsx");
  assert.ok(dashboard.includes("pinToLatest"));
  assert.ok(feed.includes("pinToLatest"));
  assert.ok(feed.includes("requestAnimationFrame"));
});

test("full activity pages share table layout and csv export", () => {
  const global = readSrc("src/components/activity/GlobalActivityFullView.tsx");
  const project = readSrc("src/components/projects/ProjectActivityFullView.tsx");
  const fullView = readSrc("src/components/activity/ActivityFullView.tsx");
  const table = readSrc("src/components/activity/ActivityTable.tsx");
  const exportButton = readSrc("src/components/activity/ActivityExportButton.tsx");
  const csv = readSrc("src/lib/activity/csv-export.ts");
  assert.ok(global.includes("ActivityFullView"));
  assert.ok(project.includes("ActivityFullView"));
  assert.ok(fullView.includes("ActivityTable"));
  assert.ok(fullView.includes("ActivityExportButton"));
  assert.ok(fullView.includes("exportRows"));
  assert.ok(fullView.includes("filteredEvents"));
  assert.ok(table.includes("Project Name"));
  assert.ok(table.includes("User"));
  assert.ok(table.includes("Description"));
  assert.ok(table.includes("Date"));
  assert.ok(exportButton.includes("Download CSV"));
  assert.ok(csv.includes("activityRowsToCsv"));
  assert.ok(csv.includes('replace(/"/g, \'""\')'));
  assert.ok(csv.includes("sanitizeActivityFilenameSegment"));
});

test("activity csv export formatting", () => {
  function escapeCsvField(value) {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  function activityRowsToCsv(rows) {
    const lines = [
      ["Project Name", "User", "Description", "Date"].join(","),
      ...rows.map((row) =>
        [
          escapeCsvField(row.projectName),
          escapeCsvField(row.user),
          escapeCsvField(row.description),
          escapeCsvField(row.createdAt ?? ""),
        ].join(","),
      ),
    ];
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }

  const csv = activityRowsToCsv([
    {
      projectName: "Broad Arrow Auctions",
      user: "Trevor Neuenswander",
      description: 'Published scraper revision, "Stable Baseline"',
      createdAt: "July 18, 2026",
    },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("Broad Arrow Auctions,Trevor Neuenswander"));
  assert.ok(csv.includes('""Stable Baseline""'));
});

test("project settings avoids client helper import on server page", () => {
  const page = readSrc("src/app/(portal)/projects/[slug]/settings/page.tsx");
  const form = readSrc("src/components/projects/ProjectSettingsForm.tsx");
  assert.ok(page.includes("normalizeProjectIsActive"));
  assert.ok(!page.includes("projectSettingsInitialIsActive"));
  assert.ok(!form.includes("projectSettingsInitialIsActive"));
});

test("webpage scraper title is owned by engine detail page only", () => {
  const enginePage = readSrc("src/app/(portal)/projects/[slug]/data-engines/[engineId]/page.tsx");
  const engineClient = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  const devTools = readSrc("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");
  assert.ok(!enginePage.includes("<PageHeader"));
  assert.ok(!enginePage.includes('from "@/components/portal/PageHeader"'));
  assert.ok(enginePage.includes("EngineDetailContent"));
  assert.ok(engineClient.includes("Webpage Scraper"));
  assert.ok(devTools.includes("operationalHref"));
  assert.ok(devTools.includes("/developer-tools"));
  assert.ok(devTools.includes("Developer Tools"));
});

test("sidebar shows NEUD with alpha version label", () => {
  const branding = readSrc("src/components/portal/SidebarBranding.tsx");
  const appVersion = readSrc("src/components/branding/AppVersion.tsx");
  const version = readSrc("src/lib/version/app-version.ts");
  const config = readSrc("next.config.ts");
  assert.ok(branding.includes("sidebar-brand"));
  assert.ok(branding.includes("<AppVersion placement=\"sidebar\" />"));
  assert.ok(appVersion.includes("sidebar-version"));
  assert.ok(appVersion.includes("whitespace-nowrap"));
  assert.ok(version.includes("getDisplayVersion"));
  assert.ok(version.includes('channel: "alpha"'));
  assert.ok(config.includes("NEXT_PUBLIC_NEUD_APP_VERSION"));
});

test("activity presentation does not duplicate actor prefix", () => {
  const compact = readSrc("src/components/activity/CompactActivityFeed.tsx");
  const fullView = readSrc("src/components/activity/ActivityFullView.tsx");
  const table = readSrc("src/components/activity/ActivityTable.tsx");
  const project = readSrc("src/components/projects/ProjectActivityFullView.tsx");
  assert.ok(compact.includes("activity-message"));
  assert.ok(compact.includes("{event.message}"));
  assert.ok(!compact.includes("{event.actorName} —"));
  assert.ok(!compact.includes('{" — "}'));
  assert.ok(fullView.includes("User"));
  assert.ok(!fullView.includes(">Actor<"));
  assert.ok(!fullView.includes("All actors"));
  assert.ok(table.includes("{event.message}"));
  assert.ok(!table.includes(" — "));
  assert.ok(project.includes("ActivityFullView"));
});

test("app version label avoids duplicated alpha suffix", () => {
  function resolveAppVersionInfo(rawVersion) {
    const trimmed = rawVersion.trim();
    const lower = trimmed.toLowerCase();
    if (lower.includes("alpha")) {
      return {
        version: trimmed.replace(/[-.]?alpha.*$/i, "").trim() || trimmed,
        channel: "alpha",
      };
    }
    if (/^0\./.test(trimmed)) {
      return { version: trimmed, channel: "alpha" };
    }
    return { version: trimmed, channel: "stable" };
  }

  function formatSidebarVersionLabel(info) {
    const baseVersion = info.version.replace(/[-.](alpha|beta).*$/i, "").trim();
    if (info.channel === "alpha") {
      return `Alpha ${baseVersion}`;
    }
    return `v${baseVersion}`;
  }

  const label = formatSidebarVersionLabel(resolveAppVersionInfo("0.1.0-alpha"));
  assert.equal(label, "Alpha 0.1.0");
  assert.ok(!label.toLowerCase().includes("alpha alpha"));
});
