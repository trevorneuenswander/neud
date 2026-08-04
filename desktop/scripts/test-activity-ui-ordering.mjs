import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

import {
  selectNewestActivityEvents,
  sortActivityEventsNewestFirst,
} from "../../scripts/live-validation/lib/activity-sort.mjs";

const ACTIVITY_OVERVIEW_LIMIT = 50;
const ACTIVITY_SYSTEM_ACTOR_LABEL = "System";

function getOverviewDisplayEntries(entries) {
  return selectNewestActivityEvents(entries, ACTIVITY_OVERVIEW_LIMIT);
}

function getActivityActorFilterLabel(entry) {
  const name = entry.actor?.name?.trim();
  return name || ACTIVITY_SYSTEM_ACTOR_LABEL;
}

function filterActivityEntries(entries, actorFilter) {
  if (actorFilter === "all") return entries;
  return entries.filter((entry) => getActivityActorFilterLabel(entry) === actorFilter);
}

function orderActivityEntries(entries, order) {
  if (order === "newest-first") return entries;
  return [...entries].reverse();
}

function isNearActivityBottom(element, threshold = 48) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

function makeEntry(index, actorName) {
  return {
    id: `activity-${index}`,
    type: "test.event",
    message: `Event ${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    actor: actorName ? { name: actorName } : undefined,
  };
}

test("overview display entries show newest-first preview order", () => {
  const entries = Array.from({ length: 55 }, (_, index) => makeEntry(54 - index));
  const overview = getOverviewDisplayEntries(entries);

  assert.equal(overview.length, ACTIVITY_OVERVIEW_LIMIT);
  assert.equal(overview[0]?.message, "Event 54");
  assert.equal(overview.at(-1)?.message, "Event 5");
});

test("activity actor filter maps missing actor to System", () => {
  const entry = makeEntry(1);
  assert.equal(getActivityActorFilterLabel(entry), ACTIVITY_SYSTEM_ACTOR_LABEL);
});

test("activity filtering and ordering compose without mutating source entries", () => {
  const entries = [
    makeEntry(1, "Trevor Neuenswander"),
    makeEntry(2),
    makeEntry(3, "Trevor Neuenswander"),
  ];
  const sourceCopy = structuredClone(entries);

  const filtered = filterActivityEntries(entries, "Trevor Neuenswander");
  const oldestFirst = orderActivityEntries(filtered, "oldest-first");
  const newestFirst = orderActivityEntries(filtered, "newest-first");

  assert.deepEqual(entries, sourceCopy);
  assert.equal(filtered.length, 2);
  assert.equal(oldestFirst[0]?.message, "Event 3");
  assert.equal(newestFirst[0]?.message, "Event 1");
});

test("isNearActivityBottom respects scroll threshold", () => {
  const element = {
    scrollHeight: 500,
    clientHeight: 200,
    scrollTop: 260,
  };

  assert.equal(isNearActivityBottom(element, 48), true);
  element.scrollTop = 100;
  assert.equal(isNearActivityBottom(element, 48), false);
});

test("overview and dashboard activity tables share full-activity date formatter", () => {
  const compact = readSrc("src/components/activity/CompactActivityTable.tsx");
  const full = readSrc("src/components/activity/ActivityTable.tsx");
  const format = readSrc("src/lib/activity/format.ts");

  assert.match(compact, /formatActivityTableDate\(event\.createdAt\)/);
  assert.match(compact, /formatActivityTableDateTitle\(event\.createdAt\)/);
  assert.match(full, /formatActivityTableDate\(event\.createdAt\)/);
  assert.match(format, /export const formatActivityDate = formatActivityTableDate/);
  assert.match(compact, />Date</);
});

test("local controller and webpage scraper share page heading status pills", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  const pill = readSrc("src/components/ui/DataSourceStatusPill.tsx");
  const hook = readSrc("src/lib/displays/use-data-source-page-status.ts");

  assert.match(controller, /PageHeader/);
  assert.match(controller, /DataSourceStatusPill pageSource="local-controller"/);
  assert.match(engineDetail, /PageHeader/);
  assert.match(engineDetail, /DataSourceStatusPill pageSource="webpage-scraper"/);
  assert.match(hook, /subscribeToDesktopDisplayDataSource/);
  assert.match(pill, /px-4 py-1\.5 text-sm/);
  assert.doesNotMatch(
    controller,
    /Manual controller values are editable and preserved here/,
  );
});

test("overview activity panel keeps header outside scroll and supports jump to latest", () => {
  const panel = readSrc("src/components/projects/ProjectActivityPanel.tsx");
  const constants = readSrc("src/lib/projects/activity-panel.ts");
  const table = readSrc("src/components/activity/CompactActivityTable.tsx");

  assert.ok(panel.includes("CompactActivityTable"));
  assert.ok(panel.includes("normalizeActivityEventsForProjects"));
  assert.ok(table.includes("scrollActivityToTop"));
  assert.ok(table.includes("Jump to Latest"));
  assert.ok(constants.includes("getOverviewDisplayEntries"));
  assert.ok(constants.includes("selectNewestActivityEvents"));
});

test("full activity view exposes user filter and order controls", () => {
  const fullView = readSrc("src/components/projects/ProjectActivityFullView.tsx");
  const constants = readSrc("src/lib/projects/activity-panel.ts");

  assert.ok(fullView.includes("All Users"));
  assert.ok(fullView.includes("ACTIVITY_ORDER_OPTIONS"));
  assert.ok(constants.includes('"Oldest First"'));
});

test("project top menu keeps last poll left of data source and uses fixed header", () => {
  const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
  const lastPoll = readSrc("src/components/projects/ProjectLastPollStatus.tsx");
  const layout = readSrc("src/app/(portal)/projects/[slug]/layout.tsx");
  const layoutFrame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");

  assert.ok(layout.includes("ProjectLayoutFrame"));
  assert.ok(topMenu.includes("fixed"));
  assert.ok(topMenu.includes("z-[1000]"));
  assert.ok(topMenu.includes("ProjectLastPollStatus"));
  assert.ok(topMenu.includes("ProjectDataSourceSelector"));
  assert.ok(lastPoll.includes("useEngineLastPollAt"));
  assert.ok(lastPoll.includes("Last Poll:"));
  assert.ok(layoutFrame.includes("--navigation-bar-height"));
});

test("manual bid workflow removes calculator and gates submit by data source", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(!controller.includes("Bid calculator"));
  assert.ok(!controller.includes("localApplyBagBidCalculator"));
  assert.ok(!controller.includes("localPreviewBagBidCalculator"));
  assert.ok(controller.includes("Select Local Controller as the Data Source to submit a manual bid."));
  assert.ok(controller.includes("submittedBidLabel"));
  assert.ok(controller.includes("adjustBidDraft"));
  assert.ok(controller.includes("Download Current Webpage"));
  assert.ok(controller.includes('"Load"'));
  assert.ok(controller.includes("Previous Lot"));
  assert.match(controller, /Submit[\s\S]*Previous Lot[\s\S]*Next Lot[\s\S]*Jump to lot/);
  assert.ok(controller.includes("lotIsDirtyRef"));
  assert.ok(controller.includes("bidIsDirtyRef"));
  assert.ok(controller.includes("scrapedBaseline"));
});
