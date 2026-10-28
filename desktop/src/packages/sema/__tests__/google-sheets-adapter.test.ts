import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicCsvExportUrl,
  extractSpreadsheetId,
  extractWorksheetGidFromUrl,
  parseCsv,
  parseWorksheetsFromFeedsJson,
  parseWorksheetsFromHtml,
} from "../google-sheets-adapter";

describe("SEMA Google Sheets adapter", () => {
  it("extracts spreadsheet id from URL or raw id", () => {
    assert.equal(
      extractSpreadsheetId("https://docs.google.com/spreadsheets/d/abc123XYZ_-/edit#gid=0"),
      "abc123XYZ_-",
    );
    assert.equal(extractSpreadsheetId("abc123XYZ_-abcdefghij"), "abc123XYZ_-abcdefghij");
  });

  it("extracts worksheet gid from URL fragments", () => {
    assert.equal(
      extractWorksheetGidFromUrl(
        "https://docs.google.com/spreadsheets/d/abc123XYZ_-/edit#gid=1847293847",
      ),
      "1847293847",
    );
    assert.equal(
      extractWorksheetGidFromUrl(
        "https://docs.google.com/spreadsheets/d/abc123XYZ_-/edit?gid=12#gid=12",
      ),
      "12",
    );
    assert.equal(extractWorksheetGidFromUrl("abc123XYZ_-abcdefghij"), null);
  });

  it("builds public CSV export URL", () => {
    const url = buildPublicCsvExportUrl({
      spreadsheetId: "sheet123",
      worksheetGid: "0",
      accessMode: "public-csv",
    });
    assert.match(url, /spreadsheets\/d\/sheet123\/export/);
    assert.match(url, /format=csv/);
    assert.match(url, /gid=0/);
  });

  it("parses quoted CSV cells", () => {
    const rows = parseCsv('Date,Time,Title,"Event/Description"\n2026-10-04,09:00,Doors,"Open, doors"\n');
    assert.equal(rows[0][3], "Event/Description");
    assert.equal(rows[1][3], "Open, doors");
  });

  it("parses worksheet tabs from Sheets html metadata", () => {
    const html = `
      {"sheets":[{"properties":{"sheetId":0,"title":"Main Schedule"}},
      {"properties":{"sheetId":1847293847,"title":"VIP Lounge & Press"}}]}
    `;
    const tabs = parseWorksheetsFromHtml(html);
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0]?.gid, "0");
    assert.equal(tabs[0]?.title, "Main Schedule");
    assert.equal(tabs[1]?.gid, "1847293847");
    assert.equal(tabs[1]?.title, "VIP Lounge & Press");
  });

  it("parses alternate name/gid worksheet metadata", () => {
    const html = `"items":[{"name":"Day One","gid":"0"},{"name":"Day Two","gid":"99"}]`;
    const tabs = parseWorksheetsFromHtml(html);
    assert.equal(tabs.length, 2);
    assert.equal(tabs[1]?.title, "Day Two");
    assert.equal(tabs[1]?.gid, "99");
  });

  it("parses htmlview items.push JS literals (unquoted keys)", () => {
    const html = `
      var items = [];
      items.push({name: "DAY 1", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/abc\\/htmlview\\/sheet?headers\\x3dtrue&gid=0", gid: "0",initialSheet: ("0" == gid)});
      items.push({name: "DAY 2", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/abc\\/htmlview\\/sheet?headers\\x3dtrue&gid=1828876151", gid: "1828876151",initialSheet: ("1828876151" == gid)});
    `;
    const tabs = parseWorksheetsFromHtml(html);
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0]?.title, "DAY 1");
    assert.equal(tabs[0]?.gid, "0");
    assert.equal(tabs[1]?.title, "DAY 2");
    assert.equal(tabs[1]?.gid, "1828876151");
  });

  it("parses title-before-sheetId HTML bootstrap objects", () => {
    const html = `{"properties":{"title":"Schedule A","sheetId":1847,"index":0}}`;
    const tabs = parseWorksheetsFromHtml(html);
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0]?.gid, "1847");
    assert.equal(tabs[0]?.title, "Schedule A");
  });

  it("parses public worksheets Atom/JSON feed entries", () => {
    const payload = {
      feed: {
        entry: [
          {
            title: { $t: "Main Schedule" },
            link: [{ rel: "alternate", href: "https://docs.google.com/spreadsheets/d/abc/edit#gid=0" }],
          },
          {
            title: { $t: "VIP Lounge & Press" },
            link: [{ href: "https://docs.google.com/spreadsheets/d/abc/edit?gid=99#gid=99" }],
          },
        ],
      },
    };
    const tabs = parseWorksheetsFromFeedsJson(payload);
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0]?.gid, "0");
    assert.equal(tabs[0]?.title, "Main Schedule");
    assert.equal(tabs[1]?.gid, "99");
    assert.equal(tabs[1]?.title, "VIP Lounge & Press");
  });
});
