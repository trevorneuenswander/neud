import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceSemaSchedule,
  buildSemaScheduleState,
  jumpSemaSchedule,
  parseSemaSheetRows,
  scheduleContentHash,
} from "../canonical-schedule";

describe("SEMA canonical schedule", () => {
  it("parses required four columns and preserves sheet order", () => {
    const { rows, error } = parseSemaSheetRows([
      ["Date", "Time", "Title", "Event/Description"],
      ["2026-10-04", "09:00", "Doors", "Open"],
      ["2026-10-04", "10:00", "Keynote", "Main stage"],
      ["2026-10-04", "11:00", "Panel", "Hall B"],
    ]);
    assert.equal(error, null);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].title, "Doors");
    assert.equal(rows[2].description, "Hall B");
  });

  it("maps NOW/NEXT/LATER without wrapping at end", () => {
    const { rows } = parseSemaSheetRows([
      ["Date", "Time", "Title", "Event/Description"],
      ["d", "t", "A", "a"],
      ["d", "t", "B", "b"],
      ["d", "t", "C", "c"],
    ]);
    const mid = buildSemaScheduleState({ rows, currentIndex: 1, source: "google-sheets" });
    assert.equal(mid.now?.title, "B");
    assert.equal(mid.next?.title, "C");
    assert.equal(mid.later, null);

    const end = buildSemaScheduleState({ rows, currentIndex: 2, source: "google-sheets" });
    assert.equal(end.now?.title, "C");
    assert.equal(end.next, null);
    assert.equal(end.later, null);
  });

  it("advances and jumps while keeping stable selection on content edit", () => {
    const { rows } = parseSemaSheetRows([
      ["Date", "Time", "Title", "Event/Description"],
      ["d", "t", "A", "a"],
      ["d", "t", "B", "b"],
      ["d", "t", "C", "c"],
    ]);
    let state = buildSemaScheduleState({ rows, currentIndex: 0, source: "google-sheets" });
    state = advanceSemaSchedule(state, "next");
    assert.equal(state.now?.title, "B");
    state = jumpSemaSchedule(state, state.rows[2].stableRowId);
    assert.equal(state.now?.title, "C");

    const edited = rows.map((row, index) =>
      index === 2 ? { ...row, description: "edited" } : row,
    );
    const afterEdit = buildSemaScheduleState({
      rows: edited,
      currentRowId: state.currentRowId,
      source: "google-sheets",
    });
    assert.equal(afterEdit.currentIndex, 2);
    assert.equal(afterEdit.now?.description, "edited");
    assert.notEqual(scheduleContentHash(rows), scheduleContentHash(edited));
  });
});
