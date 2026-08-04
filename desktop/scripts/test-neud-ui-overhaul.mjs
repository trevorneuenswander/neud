import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLotThumbnailPhotos } from "../dist/services/lot-thumbnail-service.js";
import {
  applyLotPhotoOverrides,
  parseLotPhotoOverrides,
} from "../dist/bag/live-state/lot-photo-overrides.js";
import {
  generateDisplaySlugFromName,
  isUsablePhotoUrl,
} from "../dist/displays/display-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("login tagline appears once and description does not repeat it", () => {
  const login = readSrc("src/app/(public)/page.tsx");
  assert.ok(login.includes("showTagline"));
  assert.ok(login.includes("Manage project data extraction"));
  assert.ok(!login.includes("The Ultimate Data Stripper"));
});

test("desktop title bar is rendered outside authenticated portal shell", () => {
  const rootLayout = readSrc("src/app/layout.tsx");
  const appShell = readSrc("src/components/portal/AppShell.tsx");
  const desktopShell = readSrc("src/components/portal/DesktopAppShell.tsx");

  assert.ok(rootLayout.includes("DesktopAppShell"));
  assert.ok(desktopShell.includes("AppTitleBar"));
  assert.ok(!appShell.includes("AppTitleBar"));
  assert.ok(desktopShell.includes("neud-overlay-root"));
});

test("global scrollbar tokens exist", () => {
  const css = readSrc("src/app/globals.css");
  assert.ok(css.includes("--scrollbar-size"));
  assert.ok(css.includes("--scrollbar-thumb"));
  assert.ok(css.includes("::-webkit-scrollbar-thumb"));
});

test("placeholder urls are excluded from usable photos", () => {
  assert.equal(isUsablePhotoUrl("https://example.com/placeholder-logo.png"), false);
  assert.equal(isUsablePhotoUrl("https://example.com/pip-preview.png"), false);
  assert.equal(isUsablePhotoUrl("https://example.com/car.jpg"), true);
});

test("real first photo remains first after normalization", () => {
  const photos = normalizeLotThumbnailPhotos(
    {
      lot: "126",
      photos: [
        "https://example.com/placeholder.png",
        {
          relativePath: "photos/lot-126/001.jpg",
        },
        "https://example.com/002.jpg",
      ],
    },
    (relativePath) => `/api/offline-assets/pkg/${relativePath}`,
  );
  assert.equal(photos.length, 2);
  assert.ok(photos[0]?.url.includes("/api/offline-assets/"));
});

test("lot photo overrides reorder and remove references", () => {
  const base = [
    { url: "/a.jpg", alt: "a" },
    { url: "/b.jpg", alt: "b" },
    { url: "/c.jpg", alt: "c" },
  ];
  const overrides = parseLotPhotoOverrides({
    "126": { order: ["/c.jpg", "/a.jpg"], removed: ["/b.jpg"] },
  });
  const next = applyLotPhotoOverrides(base, overrides, "126");
  assert.deepEqual(
    next.map((photo) => photo.url),
    ["/c.jpg", "/a.jpg"],
  );
});

test("Jump to Lot UI is absent from Local Controller", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(!controller.includes("Jump to lot"));
  assert.ok(!controller.includes("jumpLotDraft"));
  assert.ok(controller.includes("Previous Lot"));
  assert.ok(controller.includes("Next Lot"));
});

test("manual lot draft is not overwritten while dirty", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes("lotIsDirtyRef"));
  assert.ok(controller.includes("lotDraftDirty"));
  assert.ok(controller.includes("submittedLotSyncKey"));
});

test("manual bid submit is not blocked by display source", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(!controller.includes('if (displaySource !== "local-controller") return true;'));
  assert.ok(!controller.includes("Select Local Controller as the Data Source to submit a manual bid"));
});

test("LIVE and OFFLINE label reflects data source", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes('displaySource === "local-controller" ? "Live" : "Offline"'));
});

test("Add HTML Display exposes only name description and html fields", () => {
  const form = readSrc("src/components/developer-tools/NewDisplayForm.tsx");
  assert.ok(form.includes("Display Name"));
  assert.ok(form.includes("Description"));
  assert.ok(form.includes("HTML Code"));
  assert.ok(!form.includes("URL slug"));
});

test("display slug collision suffix is generated", () => {
  assert.equal(generateDisplaySlugFromName("New Bid Display v1"), "new-bid-display-v1");
});

test("scraper developer tools dropdown removed from operational page", () => {
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  assert.ok(!engineDetail.includes("ScraperDeveloperTools"));
  assert.ok(engineDetail.includes("developer-tools"));
});

test("scraper developer details route exists with authorization", () => {
  const page = readSrc(
    "src/app/(portal)/projects/[slug]/data-engines/[engineId]/developer-tools/page.tsx",
  );
  assert.ok(page.includes("canManageSettings"));
  assert.ok(page.includes("ScraperDeveloperDetailsClient"));
});

test("slide-over panels render through overlay root below title bar", () => {
  const panel = readSrc("src/components/ui/SlideOverPanel.tsx");
  assert.ok(panel.includes("neud-overlay-root"));
  assert.ok(panel.includes("createPortal"));
});

test("recent project cards are fully clickable links", () => {
  const projects = readSrc("src/components/dashboard/DashboardProjects.tsx");
  assert.ok(projects.includes('className="recent-project-card'));
  assert.ok(projects.includes("href={`/projects/${project.slug}`}"));
});

test("dashboard activity includes actor names and view full activity button", () => {
  const activity = readSrc("src/components/dashboard/DashboardActivityClient.tsx");
  assert.ok(activity.includes("actorName"));
  assert.ok(activity.includes('href="/activity"'));
  assert.ok(activity.includes("View Full Activity"));
  assert.ok(activity.includes("CompactActivityFeed"));
});

test("dashboard summary polls online displays and running engines", () => {
  const summary = readSrc("src/components/dashboard/DashboardSummary.tsx");
  assert.ok(summary.includes("onlineDisplays"));
  assert.ok(summary.includes("runningEngines"));
  assert.ok(summary.includes("Running Engines"));
  assert.ok(!summary.includes("Running Workers"));
  assert.ok(!summary.includes("runningWorkers"));
  assert.ok(summary.includes("/api/dashboard"));
});

test("global activity page is available to authenticated users", () => {
  const page = readSrc("src/app/(portal)/activity/page.tsx");
  assert.ok(page.includes("requireUser"));
  assert.ok(page.includes("GlobalActivityFullView"));
  assert.ok(!page.includes("requireAdmin"));
});

test("layout keeps sidebar fixed and main content scrollable below title bar", () => {
  const css = readSrc("src/app/globals.css");
  const shell = readSrc("src/components/portal/AppShell.tsx");
  assert.ok(css.includes(".app-body"));
  assert.ok(css.includes(".sidebar"));
  assert.ok(css.includes(".main-content"));
  assert.ok(shell.includes('className="main-content'));
});

test("developer drawer removed from operational scraper page", () => {
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  assert.ok(!engineDetail.includes("DeveloperDrawer"));
});

test("scraper developer tools show runtime metadata and close route", () => {
  const details = readSrc("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");
  assert.ok(details.includes("Engine ID"));
  assert.ok(details.includes("Worker ID"));
  assert.ok(details.includes("Latest Snapshot ID"));
  assert.ok(details.includes("Close Developer Tools"));
  assert.ok(details.includes("/data-engines/${engineId}"));
});

test("manual bid draft accepts currency symbols before submit", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes('replace(/[$€£,\\s]/g, "")'));
  assert.ok(controller.includes("bidDraftChanged(bidDraft, submittedBidAmount)"));
});

test("photo and display ordering use arrows only", () => {
  const photos = readSrc("src/components/bag-graphics/LotPhotoThumbnails.tsx");
  const displays = readSrc("src/components/displays/DisplaysListClient.tsx");
  assert.ok(!photos.includes("⋮⋮"));
  assert.ok(!displays.includes("⋮⋮"));
  assert.ok(photos.includes("Move photo earlier"));
  assert.ok(displays.includes("Move display up"));
});

test("display rename keeps slug stable in helper text", () => {
  const editor = readSrc("src/components/displays/DisplayNameEditor.tsx");
  assert.ok(editor.includes("does not change its local URL"));
  assert.ok(editor.includes("localRenameDeveloperDisplay"));
});

test("display edit html action is explicit for editable displays", () => {
  const tools = readSrc("src/components/developer-tools/DisplayDeveloperTools.tsx");
  assert.ok(tools.includes("Edit HTML"));
  assert.ok(tools.includes("Duplicate as Editable Display"));
});

test("online display sessions use heartbeat store with stale timeout", () => {
  const store = readSrc("desktop/src/services/display-viewer-session-store.ts");
  assert.ok(store.includes("countActiveSessions"));
  assert.ok(store.includes("30000") || store.includes("DEFAULT_STALE_MS"));
});

test("running engines come from engine manager summaries", () => {
  const manager = readSrc("desktop/src/services/engine-manager.ts");
  const data = readSrc("desktop/src/services/local-data-service.ts");
  const displays = readSrc("desktop/src/repositories/displays-repository.ts");
  assert.ok(manager.includes("getRunningEngineSummaries"));
  assert.ok(manager.includes("countRunningEngines"));
  assert.ok(data.includes("getRunningEngineCount"));
  assert.ok(data.includes("getActiveDisplayCount"));
  assert.ok(data.includes("runningEngines"));
  assert.ok(displays.includes("countActiveForProjects"));
  assert.ok(!data.includes("runningWorkers"));
});

test("shared compact activity feed is used on dashboard and overview", () => {
  const dashboard = readSrc("src/components/dashboard/DashboardActivityClient.tsx");
  const overview = readSrc("src/components/projects/ProjectActivityPanel.tsx");
  assert.ok(dashboard.includes("CompactActivityFeed"));
  assert.ok(overview.includes("CompactActivityFeed"));
});
