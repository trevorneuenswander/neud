import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

test("dirty field borders use stable submitted baseline and draft values", () => {
  assert.match(controller, /type ManualDraft = \{/);
  assert.match(controller, /const \[submittedValues, setSubmittedValues\]/);
  assert.match(controller, /const \[draftValues, setDraftValues\]/);
  assert.match(controller, /normalizeLotNumber\(draftValues\.lotNumber\)/);
  assert.match(controller, /normalizeLotNumber\(submittedValues\.lotNumber\)/);
  assert.match(controller, /draftValues\.title !== submittedValues\.title/);
  assert.match(controller, /normalizeBid\(draftValues\.bid\)/);
});

test("submitted baseline is not reset on every envelope poll", () => {
  assert.doesNotMatch(
    controller,
    /if \(!lotDraftDirty && !lotIsDirtyRef\.current\)/,
  );
  assert.doesNotMatch(controller, /if \(bidDraftDirty \|\| bidIsDirtyRef\.current\)/);
  assert.match(controller, /submittedLotSyncKey\(envelope\)/);
  assert.match(controller, /syncKeyChanged/);
  assert.match(controller, /setSubmittedValues\(nextSubmitted\)/);
  assert.match(controller, /setDraftValues\(nextSubmitted\)/);
});

test("dirty borders cover lot number, title, reserve status, and bid fields", () => {
  assert.match(controller, /dirtyFieldClassName\(isLotNumberDirty\)/);
  assert.match(controller, /dirtyFieldClassName\(isTitleDirty\)/);
  assert.match(controller, /dirtyFieldClassName\(isReserveDirty\)/);
  assert.match(controller, /dirtyFieldClassName\(isBidDirty\)/);
  assert.match(controller, /border-warning/);
});

test("bid increment and decrement mark draft dirty through shared updater", () => {
  assert.match(controller, /function adjustBidDraft/);
  assert.match(controller, /updateBidDraftValue\(formatBidDraft\(next\)\)/);
  assert.match(controller, /bidIsDirtyRef\.current = true/);
  assert.doesNotMatch(controller, /setBidDraftDirty/);
});

test("draft values are not overwritten during envelope refresh", () => {
  assert.doesNotMatch(controller, /setLotDraft\(lotDraftFromEnvelope\(envelope\)\)/);
  assert.doesNotMatch(controller, /setBidDraft\(bidDraftFromEnvelope\(envelope\)\)/);
  assert.match(controller, /scheduleLotDraftPersist/);
});

test("successful lot submit clears only lot fields in submitted baseline", () => {
  assert.match(controller, /label === "Manual lot"/);
  assert.match(controller, /lotNumber: draftValues\.lotNumber/);
  assert.match(controller, /title: draftValues\.title/);
  assert.match(controller, /reserveStatus: draftValues\.reserveStatus/);
  assert.match(controller, /lotIsDirtyRef\.current = false/);
});

test("successful bid submit clears only bid baseline", () => {
  assert.match(controller, /label === "Manual bid"/);
  assert.match(controller, /setSubmittedValues\(\(current\) => \(\{ \.\.\.current, bid: formatted \}\)\)/);
  assert.match(controller, /bidIsDirtyRef\.current = false/);
});

test("lot switch reloads clean submitted baseline from envelope identity", () => {
  assert.match(controller, /manualDraftFromEnvelope\(envelope\)/);
  assert.match(controller, /setSubmittedBidLabel\(submittedBidLabelFromEnvelope\(envelope\)\)/);
  assert.match(controller, /setSubmittedBidAmount\(submittedBidAmountFromEnvelope\(envelope\)\)/);
});

test("removed unsaved warning text is not rendered", () => {
  assert.doesNotMatch(controller, /Unsaved manual lot changes/);
  assert.doesNotMatch(controller, /Unsaved manual bid changes/);
  assert.doesNotMatch(controller, /Unsaved manual changes/);
});

test("validation error styling can take priority over dirty warning borders", () => {
  assert.match(controller, /function dirtyFieldClassName\(isDirty: boolean, hasError = false\)/);
  assert.match(controller, /border-danger/);
});

test("clean fields use blue focus styling only when not dirty", () => {
  assert.match(controller, /if \(isDirty\) \{[\s\S]*border-warning focus-visible:border-warning/);
  assert.match(
    controller,
    /return `\$\{base\} border border-border focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500\/30`;/,
  );
  assert.doesNotMatch(controller, /focus-visible:border-warning[\s\S]*!isDirty/);
});

test("dirty fields keep yellow border while focused", () => {
  assert.match(controller, /border border-warning focus-visible:border-warning focus-visible:ring-2 focus-visible:ring-warning\/30/);
  assert.doesNotMatch(controller, /focus-visible:border-blue-500[\s\S]*isDirty/);
});

test("dirty state is computed from draft versus submitted values, not focus", () => {
  assert.match(controller, /const isLotNumberDirty/);
  assert.match(controller, /const isTitleDirty/);
  assert.match(controller, /const isReserveDirty/);
  assert.match(controller, /const isBidDirty = hasUnsavedBidChanges/);
  assert.doesNotMatch(controller, /isFocused/);
  assert.doesNotMatch(controller, /onFocus=.*dirty/i);
});

test("failed submit leaves dirty borders because submitted baseline is unchanged", () => {
  assert.match(controller, /async function runSubmitAction/);
  assert.match(controller, /catch \(error\)/);
  assert.doesNotMatch(
    controller,
    /catch \(error\)[\s\S]{0,200}setSubmittedValues\(\(current\) => \(\{ \.\.\.current, lotNumber: draftValues\.lotNumber/,
  );
});

test("reverting draft to submitted value clears dirty comparison", () => {
  assert.match(controller, /normalizeLotNumber\(draftValues\.lotNumber\) !== normalizeLotNumber\(submittedValues\.lotNumber\)/);
  assert.match(controller, /normalizeBid\(draftValues\.bid\) !== normalizeBid\(submittedValues\.bid\)/);
});
