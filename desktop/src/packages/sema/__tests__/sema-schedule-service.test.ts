import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { LocalDatabase } from "../../../database/connection";
import { ProjectsRepository } from "../../../repositories/projects-repository";
import type { AppPaths } from "../../../services/app-paths";
import { reconcileSemaSelection, parseSemaSheetRows } from "../canonical-schedule";
import {
  SemaScheduleService,
  type SemaChangeEvent,
} from "../sema-schedule-service";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstu1234567/edit#gid=0";
const HEADER = "Date,Time,Title,Event/Description";

function csv(rows: Array<[string, string, string, string]>): string {
  return [HEADER, ...rows.map((row) => row.join(","))].join("\n");
}

const BASE_ROWS: Array<[string, string, string, string]> = [
  ["2026-10-04", "09:00", "Doors", "Open"],
  ["2026-10-04", "10:00", "Keynote", "Main stage"],
  ["2026-10-04", "11:00", "Panel", "Hall B"],
  ["2026-10-04", "12:00", "Lunch", "Atrium"],
];

type FakeSheet = {
  body: string;
  contentType: string;
  status: number;
  offline: boolean;
  calls: number;
};

function makeFakeSheet(body = csv(BASE_ROWS)): { sheet: FakeSheet; fetchImpl: typeof fetch } {
  const sheet: FakeSheet = {
    body,
    contentType: "text/csv; charset=utf-8",
    status: 200,
    offline: false,
    calls: 0,
  };
  const fetchImpl = (async () => {
    sheet.calls += 1;
    if (sheet.offline) {
      throw new TypeError("fetch failed");
    }
    return new Response(sheet.body, {
      status: sheet.status,
      headers: { "content-type": sheet.contentType },
    });
  }) as typeof fetch;
  return { sheet, fetchImpl };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
});

async function setup(initialBody?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-"));
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
  } as AppPaths;
  const db = await LocalDatabase.open(paths);
  const project = new ProjectsRepository(db).create({
    name: "SEMA",
    slug: "sema",
    projectType: "sema-schedule",
  });
  const { sheet, fetchImpl } = makeFakeSheet(initialBody);
  const service = new SemaScheduleService(db, { fetchImpl });
  const events: SemaChangeEvent[] = [];
  service.onChange((event) => events.push(event));
  cleanups.push(() => {
    service.stopAllPolling();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { db, service, sheet, events, projectId: project.id, fetchImpl };
}

async function configuredWithSheet(initialBody?: string) {
  const ctx = await setup(initialBody);
  ctx.service.configureSheet(ctx.projectId, { spreadsheetUrlOrId: SHEET_URL });
  const first = await ctx.service.refreshFromSheet(ctx.projectId);
  assert.equal(first.unchanged, false);
  ctx.events.length = 0;
  return ctx;
}

describe("SEMA schedule service: source precedence", () => {
  it("manual mode is the only on-air source and ignores sheet changes until switched back", async () => {
    const { service, sheet, events, projectId } = await configuredWithSheet();

    service.setManualFields(projectId, {
      date: "2026-10-04",
      time: "13:30",
      title: "Backup Panel",
      description: "Hall C",
    });
    service.setSourceMode(projectId, "manual");
    const manualPayload = service.toDisplayPayload(projectId);
    assert.equal(manualPayload.source, "manual");
    assert.equal(manualPayload.schedule.now?.title, "Backup Panel");
    assert.equal(manualPayload.schedule.next?.title, "");
    assert.equal(manualPayload.schedule.later?.title, "");

    // The sheet changes while manual is on air: cache updates, display output does not.
    events.length = 0;
    sheet.body = csv([...BASE_ROWS, ["2026-10-04", "14:00", "Closing", "Main stage"]]);
    const refreshed = await service.refreshFromSheet(projectId);
    assert.equal(refreshed.unchanged, false);
    assert.equal(refreshed.published, false);
    assert.equal(events.length, 0);
    const afterRefresh = service.toDisplayPayload(projectId);
    assert.equal(afterRefresh.contentHash, manualPayload.contentHash);
    assert.equal(afterRefresh.revision, manualPayload.revision);
    assert.equal(service.getState(projectId).cacheRowCount, 5);

    // Switching back shows the freshest cache.
    service.setSourceMode(projectId, "google-sheets");
    const sheetPayload = service.toDisplayPayload(projectId);
    assert.equal(sheetPayload.source, "google-sheets");
    assert.equal(sheetPayload.schedule.now?.title, "Doors");
    assert.equal(service.getState(projectId).schedule.rows.length, 5);
  });

  it("never falls back from an empty sheet cache to manual fields automatically", async () => {
    const { service, projectId } = await setup();
    service.setManualFields(projectId, { title: "Backup", description: "Not on air" });
    const payload = service.toDisplayPayload(projectId);
    assert.equal(payload.source, "google-sheets");
    assert.equal(payload.schedule.now, null);
  });

  it("keeps sheet cache navigation independent of on-air source", async () => {
    const { service, projectId } = await configuredWithSheet();
    service.advance(projectId, "next");
    service.advance(projectId, "next");
    service.setManualFields(projectId, { title: "Backup" });
    service.setSourceMode(projectId, "manual");
    assert.equal(service.getState(projectId).sourceMode, "manual");
    assert.equal(service.toDisplayPayload(projectId).schedule.now?.title, "Backup");
    // PREV/NEXT still move the sheet cache while Manual Controller is on air.
    service.advance(projectId, "next");
    assert.equal(service.getState(projectId).sourceMode, "manual");
    assert.equal(service.getState(projectId).sheetSchedule.now?.title, "Lunch");
    assert.equal(service.toDisplayPayload(projectId).schedule.now?.title, "Backup");
    service.setSourceMode(projectId, "google-sheets");
    assert.equal(service.getState(projectId).schedule.now?.title, "Lunch");
  });

  it("Save without takeOnAir does not switch source to manual", async () => {
    const { service, projectId } = await configuredWithSheet();
    assert.equal(service.getState(projectId).sourceMode, "google-sheets");
    service.setManualFields(projectId, { title: "Standby Only" });
    assert.equal(service.getState(projectId).sourceMode, "google-sheets");
    assert.equal(service.getState(projectId).manual.title, "Standby Only");
    assert.equal(service.toDisplayPayload(projectId).source, "google-sheets");
  });

  it("manual edits while on air update in place without a new selection token", async () => {
    const { service, events, projectId } = await configuredWithSheet();
    service.setManualFields(projectId, { title: "One" });
    service.setSourceMode(projectId, "manual");
    const before = service.toDisplayPayload(projectId);
    events.length = 0;
    service.setManualFields(projectId, { title: "Two" });
    const after = service.toDisplayPayload(projectId);
    assert.equal(after.schedule.currentRowId, before.schedule.currentRowId);
    assert.equal(after.schedule.now?.title, "Two");
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, "manual");
    assert.ok(after.revision > before.revision);
  });

  it("manual edits while the sheet is on air do not publish", async () => {
    const { service, events, projectId } = await configuredWithSheet();
    service.setManualFields(projectId, { title: "Standby" });
    assert.equal(events.length, 0);
    assert.equal(service.getState(projectId).manual.title, "Standby");
  });

  it("manual Now / Next / Later slots publish independently when taken on air", async () => {
    const { service, projectId } = await configuredWithSheet();
    service.setManualFields(
      projectId,
      {
        title: "Manual Now",
        description: "Now desk",
        nextTitle: "Manual Next",
        nextDescription: "Next desk",
        laterTitle: "Manual Later",
        laterDescription: "Later desk",
      },
      { takeOnAir: true },
    );
    const state = service.getState(projectId);
    assert.equal(state.sourceMode, "manual");
    assert.equal(state.schedule.now?.title, "Manual Now");
    assert.equal(state.schedule.next?.title, "Manual Next");
    assert.equal(state.schedule.later?.title, "Manual Later");
    assert.equal(state.sheetSchedule.now?.title, "Doors");
    assert.ok(state.sheetSchedule.rows.length >= 3);
  });
});

describe("SEMA schedule service: offline behavior", () => {
  it("advances from the last-known cache while the sheet is unreachable and keeps position", async () => {
    const { db, service, sheet, projectId, fetchImpl } = await configuredWithSheet();
    service.advance(projectId, "next"); // Keynote

    sheet.offline = true;
    const failed = await service.refreshFromSheet(projectId);
    assert.equal(failed.offline, true);
    assert.equal(failed.unchanged, true);
    assert.match(failed.state.lastError ?? "", /unreachable/i);
    assert.equal(failed.state.stale, true);
    assert.equal(failed.state.cacheRowCount, 4);
    assert.equal(failed.state.schedule.now?.title, "Keynote");

    const advanced = service.advance(projectId, "next");
    assert.equal(advanced.schedule.now?.title, "Panel");
    assert.equal(advanced.schedule.next?.title, "Lunch");
    assert.equal(service.toDisplayPayload(projectId).stale, true);
    assert.equal(service.toDisplayPayload(projectId).schedule.now?.title, "Panel");

    const back = service.advance(projectId, "previous");
    assert.equal(back.schedule.now?.title, "Keynote");
    await service.jump(projectId, 3);
    assert.equal(service.getState(projectId).schedule.now?.title, "Lunch");

    // App restart while still offline: position and cache come back from SQLite.
    const restarted = new SemaScheduleService(db, { fetchImpl });
    const restored = restarted.getState(projectId);
    assert.equal(restored.schedule.now?.title, "Lunch");
    assert.equal(restored.schedule.currentIndex, 3);
    assert.equal(restored.stale, true);
    assert.equal(restored.sheet.spreadsheetId, "abcdefghijklmnopqrstu1234567");
  });

  it("recovers without moving the operator when the same content comes back", async () => {
    const { service, sheet, events, projectId } = await configuredWithSheet();
    service.advance(projectId, "next");
    service.advance(projectId, "next");

    sheet.offline = true;
    await service.refreshFromSheet(projectId);
    const staleRevision = service.getState(projectId).revision;
    events.length = 0;

    sheet.offline = false;
    const recovered = await service.refreshFromSheet(projectId);
    assert.equal(recovered.unchanged, true);
    assert.equal(recovered.state.lastError, null);
    assert.equal(recovered.state.stale, false);
    assert.equal(recovered.state.schedule.now?.title, "Panel");
    // Clearing the stale flag is a visible state change, but not a staged advance.
    assert.equal(events.length, 1);
    assert.ok(recovered.state.revision > staleRevision);
  });

  it("keeps the cache on HTTP errors, sign-in pages, parse failures, and blank sheets", async () => {
    const { service, sheet, projectId } = await configuredWithSheet();
    service.advance(projectId, "next");

    sheet.status = 500;
    let result = await service.refreshFromSheet(projectId);
    assert.match(result.state.lastError ?? "", /500/);
    assert.equal(result.state.schedule.now?.title, "Keynote");

    sheet.status = 200;
    sheet.contentType = "text/html; charset=utf-8";
    sheet.body = "<html>Sign in</html>";
    result = await service.refreshFromSheet(projectId);
    assert.match(result.state.lastError ?? "", /sign-in/i);
    assert.equal(result.state.cacheRowCount, 4);

    sheet.contentType = "text/csv";
    sheet.body = "Foo,Bar\n1,2";
    result = await service.refreshFromSheet(projectId);
    assert.match(result.state.lastError ?? "", /Missing required columns/);
    assert.equal(result.state.cacheRowCount, 4);

    sheet.body = HEADER; // header only: a blank/partial load must not wipe the show
    result = await service.refreshFromSheet(projectId);
    assert.match(result.state.lastError ?? "", /no schedule rows/i);
    assert.equal(result.state.cacheRowCount, 4);
    assert.equal(result.state.schedule.now?.title, "Keynote");
  });

  it("does not report stale before anything was ever cached", async () => {
    const { service, sheet, projectId } = await setup();
    service.configureSheet(projectId, { spreadsheetUrlOrId: SHEET_URL });
    sheet.offline = true;
    const result = await service.refreshFromSheet(projectId);
    assert.equal(result.state.stale, false);
    assert.equal(result.state.schedule.now, null);
    assert.ok(result.state.lastError);
  });
});

describe("SEMA schedule service: polling refresh", () => {
  it("unchanged content hash performs no canonical update and no display event", async () => {
    const { service, events, projectId } = await configuredWithSheet();
    const before = service.getState(projectId);

    const again = await service.refreshFromSheet(projectId);
    assert.equal(again.unchanged, true);
    assert.equal(again.published, false);
    assert.equal(events.length, 0);
    assert.equal(again.state.revision, before.revision);
    assert.equal(again.state.updatedAt, before.updatedAt);
    assert.equal(
      service.toDisplayPayload(projectId).contentHash,
      service.toDisplayPayload(projectId).contentHash,
    );
  });

  it("navigation does not invalidate the stored content hash", async () => {
    const { service, events, projectId } = await configuredWithSheet();
    service.advance(projectId, "next");
    events.length = 0;
    const again = await service.refreshFromSheet(projectId);
    assert.equal(again.unchanged, true);
    assert.equal(events.length, 0);
  });

  it("live edit of the current row's description keeps the index and token", async () => {
    const { service, sheet, events, projectId } = await configuredWithSheet();
    await service.jump(projectId, 2);
    const before = service.toDisplayPayload(projectId);
    events.length = 0;

    sheet.body = csv([
      BASE_ROWS[0],
      BASE_ROWS[1],
      ["2026-10-04", "11:00", "Panel", "Moved to Hall D"],
      BASE_ROWS[3],
    ]);
    const result = await service.refreshFromSheet(projectId);
    assert.equal(result.unchanged, false);
    assert.equal(result.published, true);
    assert.equal(result.state.schedule.currentIndex, 2);
    assert.equal(result.state.schedule.now?.description, "Moved to Hall D");
    const after = service.toDisplayPayload(projectId);
    assert.equal(after.schedule.currentRowId, before.schedule.currentRowId);
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, "sheet");
    assert.notEqual(after.contentHash, before.contentHash);
  });

  it("live edit of the current row's title keeps the index", async () => {
    const { service, sheet, projectId } = await configuredWithSheet();
    await service.jump(projectId, 2);
    sheet.body = csv([
      BASE_ROWS[0],
      BASE_ROWS[1],
      ["2026-10-04", "11:00", "Panel (Updated)", "Hall B"],
      BASE_ROWS[3],
    ]);
    const result = await service.refreshFromSheet(projectId);
    assert.equal(result.state.schedule.currentIndex, 2);
    assert.equal(result.state.schedule.now?.title, "Panel (Updated)");
    assert.equal(result.state.schedule.next?.title, "Lunch");
  });

  it("rows inserted above the current row move the selection with the show", async () => {
    const { service, sheet, projectId } = await configuredWithSheet();
    await service.jump(projectId, 1); // Keynote
    sheet.body = csv([
      BASE_ROWS[0],
      ["2026-10-04", "09:30", "Coffee", "Lobby"],
      BASE_ROWS[1],
      BASE_ROWS[2],
      BASE_ROWS[3],
    ]);
    const result = await service.refreshFromSheet(projectId);
    assert.equal(result.state.schedule.now?.title, "Keynote");
    assert.equal(result.state.schedule.currentIndex, 2);
  });

  it("rows removed past the end clamp the index instead of resetting to the top", async () => {
    const { service, sheet, projectId } = await configuredWithSheet();
    await service.jump(projectId, 3);
    sheet.body = csv([BASE_ROWS[0], BASE_ROWS[1]]);
    const result = await service.refreshFromSheet(projectId);
    assert.equal(result.state.schedule.currentIndex, 1);
    assert.equal(result.state.schedule.now?.title, "Keynote");
  });

  it("operator navigation always produces a new selection token; live edits never do", async () => {
    const { service, projectId } = await configuredWithSheet();
    const t0 = service.toDisplayPayload(projectId).schedule.currentRowId;
    service.advance(projectId, "next");
    const t1 = service.toDisplayPayload(projectId).schedule.currentRowId;
    service.takeNow(projectId);
    const t2 = service.toDisplayPayload(projectId).schedule.currentRowId;
    assert.notEqual(t0, t1);
    assert.notEqual(t1, t2);
  });

  it("polling refreshes configured projects and can be stopped", async () => {
    const { service, projectId } = await configuredWithSheet();
    const started = service.startPollingConfiguredProjects();
    assert.deepEqual(started, [projectId]);
    assert.equal(service.isPolling(projectId), true);
    service.stopAllPolling();
    assert.equal(service.isPolling(projectId), false);
  });
});

describe("SEMA schedule service: configuration and persistence", () => {
  it("rejects invalid sheet input and keeps public-csv as the only access mode", async () => {
    const { service, projectId } = await setup();
    assert.throws(
      () => service.configureSheet(projectId, { spreadsheetUrlOrId: "not a sheet" }),
      /Google Sheets URL/,
    );
    assert.throws(
      () =>
        service.configureSheet(projectId, {
          spreadsheetUrlOrId: SHEET_URL,
          worksheetGid: "abc",
        }),
      /gid/i,
    );
    const state = service.configureSheet(projectId, {
      spreadsheetUrlOrId: SHEET_URL,
      worksheetGid: "123",
      worksheetTitle: "Main Schedule",
      pollIntervalMs: 1,
    });
    assert.equal(state.sheet.accessMode, "public-csv");
    assert.equal(state.sheet.worksheetGid, "123");
    assert.equal(state.sheet.worksheetTitle, "Main Schedule");
    assert.equal(state.sheet.pollIntervalMs, 1_000);

    const fromUrl = service.configureSheet(projectId, {
      spreadsheetUrlOrId:
        "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstu1234567/edit#gid=555",
    });
    assert.equal(fromUrl.sheet.worksheetGid, "555");
  });

  it("persists selected worksheet and preserves cache when new tab parse fails", async () => {
    const { service, projectId, sheet } = await configuredWithSheet();
    const before = service.getState(projectId);
    assert.ok(before.cacheRowCount > 0);
    const previousTitle = before.sheetSchedule.now?.title;

    service.configureSheet(projectId, {
      spreadsheetUrlOrId: SHEET_URL,
      worksheetGid: "999",
      worksheetTitle: "Bad Columns",
    });
    const afterSelect = service.getState(projectId);
    assert.equal(afterSelect.sheet.worksheetGid, "999");
    assert.equal(afterSelect.sheet.worksheetTitle, "Bad Columns");
    assert.equal(afterSelect.cacheRowCount, before.cacheRowCount);

    sheet.body = "ColA,ColB\n1,2\n";
    const failed = await service.refreshFromSheet(projectId);
    assert.ok(failed.state.lastError);
    assert.match(failed.state.lastError ?? "", /Missing required columns/i);
    assert.equal(failed.state.cacheRowCount, before.cacheRowCount);
    assert.equal(failed.state.sheetSchedule.now?.title, previousTitle);
    assert.equal(failed.state.sheet.worksheetGid, "999");
    assert.equal(failed.state.sheet.worksheetTitle, "Bad Columns");
  });

  it("lists worksheets from public htmlview metadata", async () => {
    const htmlFetch: typeof fetch = async () =>
      new Response(
        `{"sheets":[{"properties":{"sheetId":0,"title":"Main"}},{"properties":{"sheetId":42,"title":"Alt Tab"}}]}`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    const { listPublicSpreadsheetWorksheets } = await import("../google-sheets-adapter");
    const tabs = await listPublicSpreadsheetWorksheets("abcdefghijklmnopqrstu1234567", htmlFetch);
    assert.equal(tabs.error, null);
    assert.equal(tabs.worksheets.length, 2);
    assert.equal(tabs.worksheets[1]?.gid, "42");
    assert.equal(tabs.worksheets[1]?.title, "Alt Tab");
  });

  it("switching to a different sheet drops the old cache and position", async () => {
    const { service, projectId } = await configuredWithSheet();
    service.advance(projectId, "next");
    const state = service.configureSheet(projectId, {
      spreadsheetUrlOrId: "https://docs.google.com/spreadsheets/d/zyxwvutsrqponmlkjihg9876/edit",
    });
    assert.equal(state.cacheRowCount, 0);
    assert.equal(state.schedule.currentIndex, 0);
    assert.equal(state.lastSuccessAt, null);
  });

  it("jump rejects unknown rows and out-of-range indexes", async () => {
    const { service, projectId } = await configuredWithSheet();
    await assert.rejects(() => service.jump(projectId, "sema-row-99-deadbeef"), /no longer available/);
    await assert.rejects(() => service.jump(projectId, 99), /out of range/);
  });

  it("cross-tab Jump promotes viewing worksheet to live without losing prior live on failure", async () => {
    const day1 = csv(BASE_ROWS);
    const day2 = csv([
      ["2026-10-05", "09:00", "Day2 Open", "Lot A"],
      ["2026-10-05", "10:00", "Day2 Keynote", "Main"],
      ["2026-10-05", "11:00", "Day2 Panel", "Hall"],
    ]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-xtab-"));
    const paths = {
      root,
      data: path.join(root, "data"),
      databaseFile: path.join(root, "data", "test.sqlite"),
      backups: path.join(root, "backups"),
    } as AppPaths;
    const db = await LocalDatabase.open(paths);
    const project = new ProjectsRepository(db).create({
      name: "SEMA",
      slug: "sema-xtab",
      projectType: "sema-schedule",
    });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const gidMatch = url.match(/[?&]gid=(\d+)/);
      const gid = gidMatch?.[1] ?? "0";
      const body = gid === "1828876151" ? day2 : day1;
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      });
    }) as typeof fetch;
    const service = new SemaScheduleService(db, { fetchImpl });
    cleanups.push(() => {
      service.stopAllPolling();
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    });

    service.configureSheet(project.id, {
      spreadsheetUrlOrId: SHEET_URL,
      worksheetGid: "0",
      worksheetTitle: "DAY 1",
    });
    await service.refreshFromSheet(project.id);
    assert.equal(service.getState(project.id).sheet.worksheetGid, "0");
    assert.equal(service.getState(project.id).liveSchedule.now?.title, "Doors");

    await service.setViewingWorksheet(project.id, {
      worksheetGid: "1828876151",
      worksheetTitle: "DAY 2",
    });
    const viewing = service.getState(project.id);
    assert.equal(viewing.viewing.worksheetGid, "1828876151");
    assert.equal(viewing.sheet.worksheetGid, "0");
    assert.equal(viewing.liveSchedule.now?.title, "Doors");
    assert.equal(viewing.sheetSchedule.now?.title, "Day2 Open");

    const target = viewing.sheetSchedule.rows[1]!;
    await service.jump(project.id, target.stableRowId, {
      worksheetGid: "1828876151",
    });
    const after = service.getState(project.id);
    assert.equal(after.sheet.worksheetGid, "1828876151");
    assert.equal(after.sheet.worksheetTitle, "DAY 2");
    assert.equal(after.liveSchedule.now?.title, "Day2 Keynote");
    assert.equal(after.liveSchedule.next?.title, "Day2 Panel");
    assert.equal(after.viewing.worksheetGid, "1828876151");

    // Failed Jump (unknown row) preserves the new live worksheet.
    await assert.rejects(
      () => service.jump(project.id, "sema-row-missing", { worksheetGid: "1828876151" }),
      /Live schedule unchanged/,
    );
    assert.equal(service.getState(project.id).sheet.worksheetGid, "1828876151");
    assert.equal(service.getState(project.id).liveSchedule.now?.title, "Day2 Keynote");

    // Restart persistence.
    const restarted = new SemaScheduleService(db, { fetchImpl });
    const restored = restarted.getState(project.id);
    assert.equal(restored.sheet.worksheetGid, "1828876151");
    assert.equal(restored.liveSchedule.now?.title, "Day2 Keynote");
  });

  it("limits manual field size and collapses whitespace", async () => {
    const { service, projectId } = await setup();
    const state = service.setManualFields(projectId, {
      title: `  Big\n\n   Title ${"x".repeat(900)}`,
    });
    assert.ok(state.manual.title.startsWith("Big Title x"));
    assert.equal(state.manual.title.length, 500);
  });

  it("display payload exposes only schedule fields (no sheet config or secrets)", async () => {
    const { service, projectId } = await configuredWithSheet();
    const payload = service.toDisplayPayload(projectId);
    const serialized = JSON.stringify(payload);
    assert.ok(!serialized.includes("abcdefghijklmnopqrstu1234567"));
    assert.ok(!/spreadsheet|accessMode|credential|token/i.test(serialized));
    assert.deepEqual(Object.keys(payload.schedule).sort(), [
      "currentIndex",
      "currentRowId",
      "highlightActive",
      "later",
      "laterLabel",
      "next",
      "now",
      "rowCount",
      "source",
      "stale",
    ]);
    assert.equal(payload.schedule.laterLabel, "LATER");
    assert.equal(payload.schedule.highlightActive, false);
  });
});

describe("SEMA ticker Highlight overlay", () => {
  it("replaces LATER without mutating sheet later or schedule advance", async () => {
    const { service, projectId } = await setup();
    await service.configureSheet(projectId, { spreadsheetUrlOrId: SHEET_URL });
    await service.refreshFromSheet(projectId);

    const before = service.getState(projectId);
    assert.equal(before.highlight.active, false);
    assert.ok(before.schedule.later);

    const activated = service.setHighlight(projectId, {
      source: "custom",
      label: "Featured",
      title: "VIP Lounge",
      description: "Level 2",
    });
    assert.equal(activated.highlight.active, true);
    assert.equal(activated.highlight.label, "FEATURED");
    assert.equal(activated.highlight.title, "VIP Lounge");
    assert.equal(activated.schedule.later?.title, before.schedule.later?.title);

    const payload = service.toDisplayPayload(projectId);
    assert.equal(payload.schedule.highlightActive, true);
    assert.equal(payload.schedule.laterLabel, "LATER");
    assert.equal(payload.schedule.later?.title, "VIP Lounge");
    assert.equal(payload.schedule.later?.description, "Level 2");
    assert.equal(payload.schedule.now?.title, before.schedule.now?.title);
    assert.equal(payload.schedule.next?.title, before.schedule.next?.title);

    service.advance(projectId, "next");
    const afterAdvance = service.getState(projectId);
    assert.equal(afterAdvance.highlight.active, true);
    assert.equal(afterAdvance.highlight.title, "VIP Lounge");
    const advancedPayload = service.toDisplayPayload(projectId);
    assert.equal(advancedPayload.schedule.later?.title, "VIP Lounge");
    assert.notEqual(advancedPayload.schedule.now?.title, payload.schedule.now?.title);

    const cleared = service.clearHighlight(projectId);
    assert.equal(cleared.highlight.active, false);
    assert.equal(cleared.highlight.title, "");
    assert.equal(cleared.highlight.label, "HIGHLIGHT");
    assert.equal(cleared.highlight.source, null);
    const restored = service.toDisplayPayload(projectId);
    assert.equal(restored.schedule.highlightActive, false);
    assert.equal(restored.schedule.laterLabel, "LATER");
    assert.equal(restored.schedule.later?.title, cleared.schedule.later?.title);
  });

  it("removeHighlight deactivates without wiping prepared fields; clear wipes", async () => {
    const { service, projectId } = await setup();
    service.setHighlight(projectId, {
      source: "custom",
      label: "Spotlight",
      title: "Press Conference",
      description: "Hall B",
    });

    const removed = service.removeHighlight(projectId);
    assert.equal(removed.highlight.active, false);
    assert.equal(removed.highlight.title, "Press Conference");
    assert.equal(removed.highlight.description, "Hall B");
    assert.equal(removed.highlight.label, "SPOTLIGHT");
    assert.equal(removed.highlight.source, "custom");
    assert.equal(service.toDisplayPayload(projectId).schedule.laterLabel, "LATER");
    assert.notEqual(
      service.toDisplayPayload(projectId).schedule.later?.title,
      "Press Conference",
    );

    const reactivated = service.setHighlight(projectId, {
      source: "custom",
      label: removed.highlight.label,
      title: removed.highlight.title,
      description: removed.highlight.description,
    });
    assert.equal(reactivated.highlight.active, true);
    assert.equal(reactivated.highlight.title, "Press Conference");
    assert.equal(service.toDisplayPayload(projectId).schedule.laterLabel, "LATER");
    assert.equal(service.toDisplayPayload(projectId).schedule.later?.title, "Press Conference");

    const cleared = service.clearHighlight(projectId);
    assert.equal(cleared.highlight.active, false);
    assert.equal(cleared.highlight.title, "");
    assert.equal(cleared.highlight.description, "");
    assert.equal(cleared.highlight.label, "HIGHLIGHT");
    assert.equal(cleared.highlight.source, null);
    assert.equal(cleared.highlight.sourceRowId, null);
  });

  it("keeps scheduled-event Highlight tied to stableRowId until it becomes NEXT", async () => {
    const { service, projectId } = await setup();
    await service.configureSheet(projectId, { spreadsheetUrlOrId: SHEET_URL });
    await service.refreshFromSheet(projectId);
    const rows = service.getState(projectId).sheetSchedule.rows;
    assert.ok(rows.length >= 4);
    // rows[3] stays LATER after one advance (now=1, next=2, later=3).
    const picked = rows[3]!;

    service.setHighlight(projectId, {
      source: "scheduled",
      sourceRowId: picked.stableRowId,
      title: `${picked.title} (customized)`,
      description: picked.description,
      label: "SPECIAL EVENT",
    });
    service.advance(projectId, "next");
    const stillActive = service.getState(projectId);
    assert.equal(stillActive.highlight.active, true);
    assert.equal(stillActive.highlight.sourceRowId, picked.stableRowId);
    assert.equal(stillActive.highlight.title, `${picked.title} (customized)`);
    assert.equal(service.toDisplayPayload(projectId).schedule.laterLabel, "LATER");
    assert.equal(
      service.toDisplayPayload(projectId).schedule.later?.title,
      `${picked.title} (customized)`,
    );

    service.advance(projectId, "next");
    // now=2, next=3 — scheduled Highlight auto-removes but keeps prepared fields.
    const afterDue = service.getState(projectId);
    assert.equal(afterDue.sheetSchedule.next?.stableRowId, picked.stableRowId);
    assert.equal(afterDue.highlight.active, false);
    assert.equal(afterDue.highlight.sourceRowId, picked.stableRowId);
    assert.equal(afterDue.highlight.title, `${picked.title} (customized)`);
  });

  it("rejects blank Highlight titles", async () => {
    const { service, projectId } = await setup();
    assert.throws(
      () => service.setHighlight(projectId, { source: "custom", title: "   " }),
      /required/i,
    );
  });

  it("auto-removes scheduled Highlight when event becomes NEXT or NOW; keeps custom", async () => {
    const { service, projectId } = await setup();
    await service.configureSheet(projectId, { spreadsheetUrlOrId: SHEET_URL });
    await service.refreshFromSheet(projectId);
    const rows = service.getState(projectId).sheetSchedule.rows;
    assert.ok(rows.length >= 4);
    // Pick the row that will become NEXT after one advance from index 0 (rows[2] is later→next).
    const laterCandidate = rows[2]!;

    service.setHighlight(projectId, {
      source: "scheduled",
      sourceRowId: laterCandidate.stableRowId,
      title: laterCandidate.title,
      description: laterCandidate.description,
      label: "FEATURED",
    });
    assert.equal(service.getState(projectId).highlight.active, true);

    service.advance(projectId, "next");
    // After one advance: now=1, next=2 — highlight source is next → auto-remove.
    const afterNext = service.getState(projectId);
    assert.equal(afterNext.sheetSchedule.next?.stableRowId, laterCandidate.stableRowId);
    assert.equal(afterNext.highlight.active, false);
    assert.equal(afterNext.highlight.title, laterCandidate.title);
    assert.equal(afterNext.highlight.sourceRowId, laterCandidate.stableRowId);
    assert.equal(afterNext.highlight.label, "FEATURED");
    assert.equal(service.toDisplayPayload(projectId).schedule.laterLabel, "LATER");

    assert.throws(
      () =>
        service.setHighlight(projectId, {
          source: "scheduled",
          sourceRowId: afterNext.sheetSchedule.next!.stableRowId,
          title: "Nope",
        }),
      /already NEXT/i,
    );

    service.setHighlight(projectId, {
      source: "custom",
      title: "Stay on air",
      label: "CUSTOM",
    });
    service.advance(projectId, "next");
    assert.equal(service.getState(projectId).highlight.active, true);
    assert.equal(service.getState(projectId).highlight.title, "Stay on air");

    // Reset to the top, activate a LATER row, then jump it directly to NOW.
    const allRows = service.getState(projectId).sheetSchedule.rows;
    await service.jump(projectId, allRows[0]!.stableRowId);
    const jumpTarget = allRows[2]!;
    assert.notEqual(
      service.getState(projectId).sheetSchedule.next?.stableRowId,
      jumpTarget.stableRowId,
    );
    service.setHighlight(projectId, {
      source: "scheduled",
      sourceRowId: jumpTarget.stableRowId,
      title: jumpTarget.title,
      description: jumpTarget.description,
    });
    assert.equal(service.getState(projectId).highlight.active, true);
    await service.jump(projectId, jumpTarget.stableRowId);
    const afterJump = service.getState(projectId);
    assert.equal(afterJump.sheetSchedule.now?.stableRowId, jumpTarget.stableRowId);
    assert.equal(afterJump.highlight.active, false);
    assert.equal(afterJump.highlight.sourceRowId, jumpTarget.stableRowId);
  });
});

describe("SEMA selection reconciliation", () => {
  const rows = (titles: string[]) =>
    parseSemaSheetRows([
      ["Date", "Time", "Title", "Event/Description"],
      ...titles.map((title) => ["d", "t", title, ""]),
    ]).rows;

  it("prefers same row id, then same date/time/title, then clamped position", () => {
    const previous = rows(["A", "B", "C"]);
    assert.equal(
      reconcileSemaSelection({ previousRows: previous, previousIndex: 1, nextRows: rows(["A", "B", "C"]) }),
      1,
    );
    assert.equal(
      reconcileSemaSelection({ previousRows: previous, previousIndex: 1, nextRows: rows(["X", "A", "B", "C"]) }),
      2,
    );
    assert.equal(
      reconcileSemaSelection({ previousRows: previous, previousIndex: 2, nextRows: rows(["A", "B2", "C2"]) }),
      2,
    );
    assert.equal(
      reconcileSemaSelection({ previousRows: previous, previousIndex: 2, nextRows: rows(["A"]) }),
      0,
    );
    assert.equal(
      reconcileSemaSelection({ previousRows: previous, previousIndex: 2, nextRows: [] }),
      0,
    );
  });
});
