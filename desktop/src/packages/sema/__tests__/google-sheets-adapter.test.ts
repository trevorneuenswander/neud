import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicCsvExportUrl,
  extractSpreadsheetId,
  parseCsv,
} from "../google-sheets-adapter";

describe("SEMA Google Sheets adapter", () => {
  it("extracts spreadsheet id from URL or raw id", () => {
    assert.equal(
      extractSpreadsheetId("https://docs.google.com/spreadsheets/d/abc123XYZ_-/edit#gid=0"),
      "abc123XYZ_-",
    );
    assert.equal(extractSpreadsheetId("abc123XYZ_-abcdefghij"), "abc123XYZ_-abcdefghij");
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
});
