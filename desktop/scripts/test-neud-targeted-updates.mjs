import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("refresh button keeps text size while shrinking surrounding box", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /!h-5 !w-auto !min-w-0 shrink-0 whitespace-nowrap !px-1\.5 !py-0\.5 text-xs leading-none/);
  assert.doesNotMatch(controller, /h-5 shrink-0 px-1 text-xs/);
  assert.doesNotMatch(controller, /text-\[11px\]/);
});

test("selected lot editing does not overwrite submitted current lot on navigation", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /selectDownloadedLotByIndex/);
  assert.match(controller, /populateEditingDraftFromDownloadedLot/);
  assert.match(controller, /lotEditingSourceRef/);
  assert.match(controller, /setSubmittedValues\(nextSubmittedDraft\)/);
  assert.doesNotMatch(
    controller,
    /setSubmittedValues\(nextDraft\)[\s\S]*selectedDownloadedLotIndex/s,
  );
});

test("dirty borders compare draft against submitted current lot", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /normalizeComparableText\(draftValues\.lotNumber\)/);
  assert.match(controller, /normalizeComparableText\(submittedValues\.lotNumber\)/);
  assert.doesNotMatch(controller, /selectedLotBaseline/);
});

test("typed lot number matching uses exact normalized comparison", () => {
  const source = readSrc("src/lib/bag/lot-editing-state.ts");
  assert.match(source, /normalizeLotNumberForMatch/);
  assert.match(source, /findMatchingDownloadedLot/);
  assert.match(source, /toUpperCase\(\)/);
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /findMatchingDownloadedLot/);
  assert.match(controller, /typed-match/);
});

test("load opens native folder picker in project download root", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  const client = readSrc("src/lib/desktop/offline-auction-client.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(ipc, /properties: \["openDirectory"\]/);
  assert.match(ipc, /getProjectAuctionDataDirectory\(project\.slug\)/);
  assert.match(ipc, /The selected folder does not contain a valid Broad Arrow download\./);
  assert.match(client, /loadOfflineAuction/);
  assert.match(controller, /loadOfflineAuction\(projectId\)/);
  assert.doesNotMatch(controller, /openOfflineDownloadRoot\(projectId\)/);
});

test("cancelled downloads display Download cancelled and auto dismiss", () => {
  const types = readSrc("src/lib/desktop/webpage-export-types.ts");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(types, /Download cancelled/);
  assert.doesNotMatch(types, /Download Cancelled/);
  assert.match(exportService, /message: "Download cancelled"/);
  assert.match(exportService, /patch\.status === "cancelled"/);
  assert.match(controller, /Download cancelled/);
  assert.match(controller, /scheduleExportDismiss\(operation\)/);
});

test("project top menu uses normal flow inside project layout", () => {
  const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
  const frame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  assert.doesNotMatch(topMenu, /fixed left-0 right-0/);
  assert.match(frame, /project-layout-root/);
  assert.match(frame, /project-layout-frame/);
  assert.match(frame, /pt-6/);
});

test("users with access supports add user inside expanded section", () => {
  const section = readSrc("src/components/projects/UsersWithAccessSection.tsx");
  const dialog = readSrc("src/components/projects/AddUserToProjectDialog.tsx");
  assert.match(section, /Add User/);
  assert.doesNotMatch(section, /headerAction/);
  assert.match(section, /canManageMembers \?/);
  assert.match(section, /setShowAddUserDialog\(true\)/);
  assert.match(section, /event\.stopPropagation\(\)/);
  assert.match(section, /Remove Access/);
  assert.match(section, /Access inherited from Team/);
  assert.match(dialog, /localAssignAccessProject/);
});
