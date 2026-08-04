import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertDisplayCardSwitches(source, label) {
  assert.match(source, /DisplayCardControlRow label="Enable Display"/, `${label} enable row`);
  assert.match(source, /label="Online Viewer"/, `${label} online viewer row`);
  assert.match(
    source,
    /aria-label=\{`\$\{display\.name\} display enabled`\}/,
    `${label} enable switch label`,
  );
  assert.match(source, /OnlineViewerToggle/, `${label} online viewer toggle`);
  assert.match(source, /disabled=\{saving\}/, `${label} enable pending disable`);
}

test("display cards expose accessible enable and online viewer switches", () => {
  assertDisplayCardSwitches(read("src/components/displays/DisplayCard.tsx"), "DisplayCard");
  assertDisplayCardSwitches(
    read("src/components/displays/DeveloperHtmlDisplayCard.tsx"),
    "DeveloperHtmlDisplayCard",
  );
  assertDisplayCardSwitches(
    read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx"),
    "BroadArrowTypedDisplayCard",
  );

  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /Data Connected/);
  assert.match(card, /Data Disconnected/);
  assert.match(custom, /Data Connected/);
});

test("display enable switch uses local display enabled API only", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  assert.match(card, /localSetDisplayEnabled/);
  assert.match(card, /handleEnabledChange/);
  assert.match(card, /setEnabled\(previousEnabled\)/);
  assert.match(hook, /localUpdateOnlineViewerSettings/);
  assert.doesNotMatch(hook, /localSetDisplayEnabled/);
});

test("online viewer switch restores prior state on failed update", () => {
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  assert.match(hook, /setEnabled\(previousEnabled\)/);
  assert.match(hook, /onlineViewerEnabled: nextEnabled/);
  assert.match(hook, /busy/);
  assert.match(toggle, /aria-label=\{`\$\{displayName\} online viewer`\}/);
  assert.match(toggle, /checked=\{onlineViewer\.enabled\}/);
});

test("online viewer permissions gate management changes", () => {
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  assert.match(toggle, /!canManage/);
  assert.match(toggle, /onlineViewer\.busy/);
  assert.match(toggle, /onlineViewer\.unavailableReason/);
});

test("control order remains enable, online viewer, refresh rate, then action row", () => {
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(file);
    const enableIndex = source.indexOf('label="Enable Display"');
    const onlineIndex = source.indexOf('label="Online Viewer"');
    const refreshIndex = source.indexOf('label="Refresh Rate"');
    const actionRowIndex = source.indexOf("<DisplayCardActionSizeRow");
    assert.ok(enableIndex >= 0 && onlineIndex > enableIndex, `${file} enable/online order`);
    assert.ok(refreshIndex > onlineIndex, `${file} refresh order`);
    assert.ok(actionRowIndex > refreshIndex, `${file} action row order`);
  }
});

test("duplicate standalone button and pencil rename are removed from display cards", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");

  assert.doesNotMatch(card, /DisplayNameEditor/);
  assert.doesNotMatch(card, /Duplicate as Editable Display/);
  assert.doesNotMatch(custom, /DisplayNameEditor/);
  assert.doesNotMatch(custom, /Duplicate as Editable Display/);
});

test("developer tools button is renamed to Edit with required menu items", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");

  assert.match(menu, /label="Edit"/);
  assert.match(menu, /Edit Display/);
  assert.match(menu, /Duplicate/);
  assert.match(menu, /Archive/);
  assert.doesNotMatch(menu, /Developer Tools/);
});

test("refresh rate dropdown exposes all six required values", () => {
  const refresh = read("src/lib/displays/refresh-rate.ts");
  const select = read("src/components/displays/DisplayRefreshRateSelect.tsx");

  assert.match(refresh, /1000/);
  assert.match(refresh, /2500/);
  assert.match(refresh, /5000/);
  assert.match(refresh, /10000/);
  assert.match(refresh, /30000/);
  assert.match(refresh, /60000/);
  assert.match(select, /Refresh Rate/);
  assert.match(select, /appearance-none/);
  assert.match(select, /▼/);
});

test("refresh rate is stored in SQLite and validated on backend", () => {
  const migration = read("desktop/src/database/migrations/021_display_refresh_rate.sql");
  const repo = read("desktop/src/repositories/displays-repository.ts");
  const service = read("desktop/src/services/local-data-service.ts");

  assert.match(migration, /refresh_rate_ms/);
  assert.match(migration, /DEFAULT 5000/);
  assert.match(repo, /setRefreshRateMs/);
  assert.match(service, /Unsupported display refresh rate/);
  assert.match(service, /resolveProjectDisplay/);
});

test("move up and move down buttons are removed from displays list", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");

  assert.doesNotMatch(list, /Move up/);
  assert.doesNotMatch(list, /Move down/);
  assert.match(list, /activationConstraint: \{ distance: 6 \}/);
  assert.match(list, /SortableDisplayCard/);
  assert.match(read("src/components/displays/NoDrag.tsx"), /data-no-drag/);
});

test("edit display page uses stable display id route and backend authorization", () => {
  const page = read("src/app/(portal)/projects/[slug]/displays/[displayId]/edit/page.tsx");
  const client = read("src/components/displays/DisplayEditClient.tsx");

  assert.match(page, /canManageSettings/);
  assert.match(page, /notFound\(\)/);
  assert.match(client, /Back to Displays/);
  assert.match(client, /Save as New Version/);
  assert.match(client, /Download HTML/);
});

test("publish rejects identical html content", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /No HTML changes to save as a new version/);
});
