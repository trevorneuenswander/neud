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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getActivityDisplayDescription(rawDescription, actorName) {
  const trimmedMessage = rawDescription.trim();
  const trimmedActor = (actorName ?? "").trim();
  if (!trimmedMessage) return trimmedMessage;
  if (!trimmedActor) return trimmedMessage.charAt(0).toUpperCase() + trimmedMessage.slice(1);
  const escapedActor = escapeRegExp(trimmedActor);
  const withoutActor = trimmedMessage
    .replace(
      new RegExp(`^${escapedActor}(?:\\s*(?:[—–-]|:)\\s*|\\s+)`, "i"),
      "",
    )
    .trim();
  const next = withoutActor || trimmedMessage;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

test("scrapes today helpers exist in health module", () => {
  const health = readSrc("src/lib/data-engines/health.ts");
  assert.match(health, /resolveDailyScrapeCounts/);
  assert.match(health, /startOfDayInLocalTimezone/);
  assert.match(health, /stats_day/);
});

test("engine statistics uses resolveDailyScrapeCounts", () => {
  const stats = readSrc("src/components/data-engines/webpage-scraper/EngineStatistics.tsx");
  assert.match(stats, /resolveDailyScrapeCounts/);
  assert.match(stats, /String\(scrapesToday\)/);
});

test("activity display description strips actor prefix and capitalizes", () => {
  assert.equal(
    getActivityDisplayDescription(
      "Trevor Neuenswander copied Pylon v5 local URL",
      "Trevor Neuenswander",
    ),
    "Copied Pylon v5 local URL",
  );
});

test("activity message format stores action only", () => {
  const source = readSrc("desktop/src/services/activity-message.ts");
  assert.match(source, /formatActivityDescription/);
  assert.doesNotMatch(source, /\$\{actorName\} \$\{trimmedAction\}/);
});

test("compact activity table renders user and description columns", () => {
  const table = readSrc("src/components/activity/CompactActivityTable.tsx");
  assert.match(table, /showProjectColumn/);
  assert.match(table, /Description/);
  assert.match(table, /User/);
});

test("dashboard activity uses compact table", () => {
  const dashboard = readSrc("src/components/dashboard/DashboardActivityClient.tsx");
  assert.match(dashboard, /CompactActivityTable/);
  assert.match(dashboard, /getCleanActivityDescription/);
});

test("display order persists through user-specific save path", () => {
  const service = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(service, /\[DisplayOrder\]\[SaveStart\]/);
  assert.match(service, /\[DisplayOrder\]\[SaveComplete\]/);
  assert.match(service, /databasePath/);
  assert.match(service, /idByKey/);
});

test("display order uses IPC save in desktop client", () => {
  const api = readSrc("src/lib/local/display-order-api.ts");
  assert.match(api, /displays\.saveOrder/);
  assert.match(api, /projectId/);
  const ipc = readSrc("desktop/src/ipc/displays.ts");
  assert.match(ipc, /neud:displays:saveOrder/);
});

test("display list does not show success notification", () => {
  const list = readSrc("src/components/displays/DisplaysListClient.tsx");
  assert.doesNotMatch(list, /Display order saved/);
  assert.match(list, /Could not save display order/);
});

test("app title bar defers desktop chrome until mount", () => {
  const shell = readSrc("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /useDesktopShellActive/);
  const bar = readSrc("src/components/portal/AppTitleBar.tsx");
  assert.match(bar, /if \(!active\)/);
});

test("historical activity repair is wired at startup", () => {
  const repair = readSrc("desktop/src/services/activity-description-repair.ts");
  assert.match(repair, /removeLeadingActorFromDescription/);
  assert.match(repair, /\[ActivityRepair\]/);
  const main = readSrc("desktop/src/main.ts");
  assert.match(main, /repairHistoricalActivityDescriptions/);
});

test("activity description removes colon actor prefix", () => {
  assert.equal(
    getActivityDisplayDescription(
      "Trevor Neuenswander: copied Pylon v5 local URL",
      "Trevor Neuenswander",
    ),
    "Copied Pylon v5 local URL",
  );
});

test("new ticker v1 next.js proxy routes exist", () => {
  const data = readSrc("src/app/api/displays/new-ticker-v1/data/route.ts");
  assert.match(data, /new-ticker-v1\/data/);
  const enabled = readSrc("src/app/api/displays/new-ticker-v1/enabled/route.ts");
  assert.match(enabled, /new-ticker-v1\/enabled/);
});

test("preview window avoids renderer window.open in desktop mode", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.match(card, /displays\.openPreview/);
  assert.match(card, /Display preview is unavailable/);
  const manager = readSrc("desktop/src/services/display-preview-window-manager.ts");
  assert.match(manager, /\[PreviewWindow\] create/);
});

test("reserve dropdown excludes downloaded sentinel option", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /Use downloaded value/);
  assert.match(controller, /has_reserve/);
  assert.match(controller, /offered_without_reserve/);
  assert.match(controller, /unknown/);
});

test("submit lot clears manual bid only when lot identity changes", () => {
  const service = readSrc("desktop/src/bag/live-state/bag-local-controller-service.ts");
  assert.match(service, /getLotKey/);
  assert.match(service, /lotIdentityChanged/);
});

test("users with access supports removable access paths", () => {
  const section = readSrc("src/components/projects/UsersWithAccessSection.tsx");
  assert.match(section, /Remove Access/);
  assert.match(section, /localRemoveProjectAccess/);
  const auth = readSrc("desktop/src/services/access-authorization-service.ts");
  assert.match(auth, /removablePaths/);
});

test("reserve status module uses canonical values", () => {
  const source = readSrc("src/lib/bag/reserve-status.ts");
  assert.match(source, /has_reserve/);
  assert.match(source, /offered_without_reserve/);
  assert.match(source, /getVisibleReserveLabel/);
  assert.match(source, /Has Reserve/);
});

test("local controller navigation preserves submitted lot", () => {
  const source = readSrc("desktop/src/bag/live-state/bag-local-controller-service.ts");
  assert.match(source, /localControllerSubmitted: record\.localControllerSubmitted/);
  assert.doesNotMatch(source, /shouldResetBid && submitted/);
});

test("display card records copy url with project metadata", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.match(card, /userAction:/);
  assert.match(card, /projectId/);
});

test("lot photo thumbnails expose add photos action", () => {
  const photos = readSrc("src/components/bag-graphics/LotPhotoThumbnails.tsx");
  assert.match(photos, /Add Photos/);
  assert.match(photos, /importLotPhotos/);
});

test("users with access section is wired on project overview", () => {
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");
  assert.match(overview, /UsersWithAccessSection/);
});

test("owner role appears only in roles column", () => {
  const users = readSrc("src/components/users/LocalUsersAccessClient.tsx");
  assert.match(users, /platformRole === "owner"/);
  assert.doesNotMatch(users, /ml-2.*roleBadge\("owner"\)/);
});

test("migration 016 defines user display order and soft delete", () => {
  const sql = readSrc("desktop/src/database/migrations/016_user_display_order_and_user_soft_delete.sql");
  assert.match(sql, /user_display_order/);
  assert.match(sql, /deleted_at/);
});

test("display preview window manager uses isolated browser window", () => {
  const source = readSrc("desktop/src/services/display-preview-window-manager.ts");
  assert.match(source, /contextIsolation: true/);
  assert.match(source, /nodeIntegration: false/);
});

test("placeholder detection helper exists", () => {
  const source = readSrc("desktop/src/displays/display-utils.ts");
  assert.match(source, /isPlaceholderLotImage/);
});

test("project data source selector renders stable wrapper before mount", () => {
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");
  assert.match(selector, /aria-label="Data source"/);
  assert.match(selector, /SelectorPlaceholder/);
  assert.match(selector, /const \[mounted, setMounted\]/);
  assert.match(selector, /desktopActive = mounted && isDesktopEnvironment\(\)/);
  assert.doesNotMatch(selector, /if \(!isDesktopEnvironment\(\)\) \{\s*return null/s);
});

test("project data source selector initializes from deterministic prop", () => {
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");
  const layout = readSrc("src/app/(portal)/projects/[slug]/layout.tsx");
  assert.match(selector, /initialDataSource/);
  assert.match(selector, /useState<DisplayDataSource>\(initialDataSource\)/);
  assert.match(layout, /initialDataSource="webpage-scraper"/);
});

test("engine controls defer desktop buttons until mount to avoid hydration mismatch", () => {
  const controls = readSrc("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.match(controls, /const \[mounted, setMounted\]/);
  assert.match(controls, /useLocalDesktop = mounted && shouldUseLocalDesktopEngine\(engine\)/);
  assert.doesNotMatch(controls, /const useLocalDesktop = shouldUseLocalDesktopEngine\(engine\)/);
});

test("scraper credentials defer desktop UI until mount to avoid hydration mismatch", () => {
  const credentials = readSrc("src/components/data-engines/webpage-scraper/ScraperCredentialsSection.tsx");
  assert.match(credentials, /const \[mounted, setMounted\]/);
  assert.match(credentials, /const isDesktop = mounted && isDesktopEnvironment\(\)/);
  assert.doesNotMatch(credentials, /const isDesktop = isDesktopEnvironment\(\)/);
});

test("project top menu bar uses server-provided status controls", () => {
  const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
  const layout = readSrc("src/app/(portal)/projects/[slug]/layout.tsx");
  assert.match(topMenu, /showStatusControls: boolean/);
  assert.doesNotMatch(topMenu, /shouldUseLocalDataClient/);
  assert.match(layout, /showStatusControls=/);
});
