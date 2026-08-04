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

test("local controller inputs stay enabled and use draft onChange handlers", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(controller.includes("updateLotDraftField"));
  assert.ok(controller.includes("updateBidDraftValue"));
  assert.ok(!controller.includes("disabled={Boolean(pendingAction)}\n                    onChange"));
  assert.ok(!controller.match(/value=\{lotDraft\.title\}[\s\S]{0,120}disabled=\{Boolean\(pendingAction\)\}/));
  assert.ok(!controller.match(/value=\{bidDraft\}[\s\S]{0,120}disabled=\{Boolean\(pendingAction\)\}/));
  assert.ok(controller.includes('updateLotDraftField("title"'));
  assert.ok(controller.includes("onChange={(event) => updateBidDraftValue(event.target.value)}"));
});

test("local controller draft is not reset on every envelope poll", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(controller.includes("submittedLotSyncKey"));
  assert.ok(controller.includes("lotDraftSyncKeyRef"));
  assert.ok(controller.includes("isLotNumberFocused"));
  assert.ok(controller.includes("scheduleLotDraftPersist"));
  assert.ok(!controller.includes("Unsaved manual lot changes"));
});

test("manual lot patch route accepts reserve status", () => {
  const routes = readSrc("desktop/src/bag/live-state/bag-live-state-routes.ts");
  assert.ok(routes.includes('readOptionalString(body, "reserveStatus", "reserve_status")'));
});

test("viewer access keeps read-only submitted summary without editable inputs", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes("{canControl ? ("));
  assert.ok(controller.includes("Current Lot Number:"));
});
