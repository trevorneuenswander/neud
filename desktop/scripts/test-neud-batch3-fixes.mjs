import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("layout rollback uses project layout root and page scroll region", () => {
  const frame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  const appShell = readSrc("src/components/portal/AppShell.tsx");
  assert.match(frame, /project-layout-root/);
  assert.match(frame, /project-layout-frame min-h-0 flex-1 overflow-y-auto/);
  assert.match(appShell, /portal-scroll-region/);
});

test("typed matching and buttons share selectDownloadedLotByIndex", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /selectDownloadedLotByIndex/);
  assert.match(controller, /populateEditingDraftFromDownloadedLot/);
});

test("cancellation uses Download cancelled and clears notice on dismiss", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /Download cancelled/);
  assert.match(controller, /setCurrentDownloadNotice\(null\)/);
});

test("refresh button keeps text size while shrinking box", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /!h-5 !w-auto !min-w-0 shrink-0 whitespace-nowrap !px-1\.5 !py-0\.5 text-xs leading-none/);
});
