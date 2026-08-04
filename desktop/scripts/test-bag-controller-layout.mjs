import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const controller = fs.readFileSync(
  path.join(repoRoot, "src/components/bag-graphics/BagControllerClient.tsx"),
  "utf8",
);

test("Current Lot and Manual Bid share one stretched grid row", () => {
  assert.match(controller, /grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2/);
  assert.equal((controller.match(/<section className="h-full">/g) ?? []).length, 2);
  assert.match(controller, /const MANUAL_CARD_CLASS = "h-full"/);
});

test("both cards use matching heading row wrappers", () => {
  assert.match(controller, /const MANUAL_CARD_HEADING_ROW_CLASS = "flex min-h-8 items-start justify-between gap-3"/);
  assert.equal(
    (controller.match(/className=\{MANUAL_CARD_HEADING_ROW_CLASS\}/g) ?? []).length,
    2,
  );
});

test("Lot Number and Bid use matching primary field groups and input rows", () => {
  assert.match(controller, /const MANUAL_PRIMARY_FIELD_GROUP_CLASS = "mt-4 space-y-2"/);
  assert.match(controller, /const MANUAL_PRIMARY_INPUT_ROW_CLASS = "flex min-h-10 items-center gap-2"/);
  assert.match(controller, /const MANUAL_PRIMARY_INPUT_IN_ROW_CLASS = "min-w-0 flex-1"/);
  assert.equal(
    (controller.match(/className=\{MANUAL_PRIMARY_FIELD_GROUP_CLASS\}/g) ?? []).length,
    2,
  );
  assert.equal(
    (controller.match(/className=\{MANUAL_PRIMARY_INPUT_ROW_CLASS\}/g) ?? []).length,
    2,
  );
});

test("Bid Submit sits in the same row as the Bid input", () => {
  assert.match(
    controller,
    /MANUAL_PRIMARY_INPUT_ROW_CLASS[\s\S]*dirtyFieldClassName\(isBidDirty\)[\s\S]*Submit/,
  );
  assert.doesNotMatch(controller, /dirtyFieldClassName\(isBidDirty\)[\s\S]{0,300}mt-4 flex flex-wrap items-end gap-2/);
});

test("Lot Submit, Previous, and Next sit in the same row as Lot Number", () => {
  assert.match(
    controller,
    /dirtyFieldClassName\(isLotNumberDirty\)[\s\S]*Submit[\s\S]*Previous Lot[\s\S]*Next Lot/,
  );
  assert.doesNotMatch(
    controller,
    /LotPhotoThumbnails[\s\S]{0,500}mt-4 flex flex-wrap gap-2[\s\S]*Submit/,
  );
});

test("row controls use matching h-10 height", () => {
  assert.match(controller, /const MANUAL_ROW_BUTTON_CLASS = "h-10 shrink-0"/);
  assert.match(controller, /"h-10 w-full rounded-md/);
});

test("Increase and Decrease bid groups use reduced spacing", () => {
  assert.match(controller, /mt-4 space-y-2/);
  assert.match(controller, /space-y-1\.5[\s\S]*Increase Bid[\s\S]*space-y-1\.5[\s\S]*Decrease Bid/);
  assert.doesNotMatch(controller, /flex-1 space-y-4[\s\S]*Increase Bid/);
});

test("dirty border logic remains unchanged", () => {
  assert.match(controller, /const \[submittedValues, setSubmittedValues\]/);
  assert.match(controller, /const \[draftValues, setDraftValues\]/);
  assert.match(controller, /border border-warning focus-visible:border-warning/);
  assert.match(controller, /focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500\/30/);
  assert.match(controller, /function adjustBidDraft/);
});

test("Previous and Next still use draft-only actions", () => {
  assert.match(controller, /runDraftAction\("Previous lot"/);
  assert.match(controller, /runDraftAction\("Next lot"/);
});
