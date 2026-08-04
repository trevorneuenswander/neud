import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
const button = readSrc("src/components/ui/Button.tsx");

test("refresh button uses Refresh Rates and Refreshing Rates labels", () => {
  assert.match(controller, /"Refresh Rates"/);
  assert.match(controller, /"Refreshing Rates…"/);
  assert.match(controller, /isRefreshingRates \? "Refreshing Rates…" : "Refresh Rates"/);
});

test("refresh button keeps text-xs and font-medium from Button component", () => {
  assert.match(controller, /!h-5 !w-auto !min-w-0 shrink-0 whitespace-nowrap !px-1\.5 !py-0\.5 text-xs leading-none/);
  assert.match(button, /font-medium/);
  assert.match(button, /sm: "h-8 px-3 text-xs"/);
});

test("refresh button box is content-hugging without fixed width", () => {
  assert.match(controller, /!h-5/);
  assert.match(controller, /!w-auto/);
  assert.match(controller, /!min-w-0/);
  assert.match(controller, /!px-1\.5 !py-0\.5/);
  assert.match(controller, /leading-none/);
  assert.doesNotMatch(controller, /w-\[7\.5rem\]/);
  assert.doesNotMatch(controller, /min-w-\[/);
});

test("current bid layout classes are restored without heading-row workaround", () => {
  assert.match(
    controller,
    /const MANUAL_CARD_HEADING_ROW_CLASS = "flex min-h-8 items-start justify-between gap-3"/,
  );
  assert.match(
    controller,
    /const MANUAL_CARD_HEADING_ACTIONS_CLASS = "flex min-h-8 shrink-0 items-center gap-1.5"/,
  );
  assert.doesNotMatch(controller, /mb-3 flex min-h-6 items-start justify-between gap-3/);
  assert.doesNotMatch(controller, /flex min-w-0 shrink-0 flex-wrap items-center gap-2/);
  assert.match(controller, /const MANUAL_SUMMARY_BOX_CLASS =\s*\n?\s*"min-h-\[8\.5rem\]/);
});

test("manual bid card layout remains unchanged aside from button", () => {
  assert.match(controller, /const MANUAL_CARD_CLASS = "h-full"/);
  assert.match(controller, /const MANUAL_CARD_BODY_CLASS = "flex h-full flex-col"/);
  assert.match(controller, /const MANUAL_PRIMARY_FIELD_GROUP_CLASS = "mt-4 space-y-2"/);
  assert.equal(
    (controller.match(/className=\{MANUAL_CARD_HEADING_ROW_CLASS\}/g) ?? []).length,
    2,
  );
});

test("manual rate refresh remains wired without automatic refresh", () => {
  assert.match(controller, /refreshRatesManually/);
  assert.match(controller, /isRefreshingRates/);
  assert.match(controller, /onClick=\{\(\) => void refreshRatesManually\(\)\}/);
  const hook = readSrc("src/lib/desktop/use-currency-rates.ts");
  assert.doesNotMatch(hook, /scheduleAutomaticRefresh/);
});
