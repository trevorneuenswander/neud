#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display edit page uses version selector instead of restore/view buttons", () => {
  const editClient = readSrc("src/components/displays/DisplayEditClient.tsx");
  const versionList = readSrc("src/components/developer-tools/DisplayVersionList.tsx");
  assert.match(editClient, /DisplayVersionList/);
  assert.doesNotMatch(editClient, /CodeRevisionsPanel/);
  assert.doesNotMatch(editClient, /Current Active Version/);
  assert.match(editClient, /Display Name/);
  const rawHtmlHeadingIndex = editClient.indexOf(
    '<h3 className="text-sm font-semibold text-foreground">Raw HTML</h3>',
  );
  const savedVersionsHeadingIndex = editClient.indexOf(
    '<h3 className="text-sm font-semibold text-foreground">Saved Versions</h3>',
  );
  assert.ok(rawHtmlHeadingIndex >= 0, "Raw HTML section present");
  assert.ok(savedVersionsHeadingIndex >= 0, "Saved Versions section present");
  assert.ok(
    rawHtmlHeadingIndex < savedVersionsHeadingIndex,
    "Raw HTML appears above Saved Versions",
  );
  assert.doesNotMatch(versionList, /RestoreRevisionButton/);
  assert.doesNotMatch(versionList, /Edit Current Version/);
  assert.match(versionList, /Make Active/);
  assert.match(versionList, /type="radio"/);
  assert.match(versionList, /formatDisplayVersion/);
});

test("activate revision API updates published pointer without creating a revision", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const activateBlock = service.slice(
    service.indexOf("setActiveDisplayRevision("),
    service.indexOf("renameDisplayRevision("),
  );
  assert.match(activateBlock, /publishedRevisionId: revisionId/);
  assert.doesNotMatch(activateBlock, /this\.revisions\.create/);
  assert.doesNotMatch(activateBlock, /publishDisplay\(/);
});

test("rename revision description API updates revision_name only", () => {
  const repo = readSrc("desktop/src/repositories/project-code-revisions-repository.ts");
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(repo, /updateRevisionName/);
  assert.match(service, /Renamed display version from/);
  assert.match(service, /Version description cannot be empty/);
});

test("unsaved HTML warning appears before activating another version", () => {
  const versionList = readSrc("src/components/developer-tools/DisplayVersionList.tsx");
  assert.match(versionList, /htmlDirty/);
  assert.match(versionList, /Unsaved HTML changes/);
  assert.match(versionList, /Discard Changes and Continue/);
});

test("save as new version requires a description", () => {
  const dialog = readSrc("src/components/developer-tools/PublishRevisionDialog.tsx");
  const editClient = readSrc("src/components/displays/DisplayEditClient.tsx");
  assert.match(dialog, /requireRevisionName/);
  assert.match(dialog, /Description is required/);
  assert.match(editClient, /Save New Display Version/);
  assert.match(editClient, /Version description is required/);
});

test("raw html editor reloads from activated revision", () => {
  const editClient = readSrc("src/components/displays/DisplayEditClient.tsx");
  assert.match(editClient, /handleVersionActivated/);
  assert.match(editClient, /applyActiveWorkingCopy\(input\.html/);
  assert.doesNotMatch(editClient, /historical-readonly/);
});

test("display version deletion is exposed in UI and backed by server guards", () => {
  const versionList = readSrc("src/components/developer-tools/DisplayVersionList.tsx");
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const routes = readSrc("desktop/src/services/developer-tools-routes.ts");
  const repo = readSrc("desktop/src/repositories/project-code-revisions-repository.ts");
  const api = readSrc("src/lib/local/developer-tools-api.ts");

  assert.match(versionList, /Delete Version/);
  assert.match(versionList, /localDeleteDisplayRevision/);
  assert.match(versionList, /The active version cannot be deleted/);
  assert.match(versionList, /At least one version must remain/);
  assert.match(versionList, /This action cannot be undone/);
  assert.match(service, /deleteDisplayRevision\(/);
  assert.match(service, /The active version cannot be deleted/);
  assert.match(service, /At least one version must remain/);
  assert.match(service, /developer-tools\.display-version-deleted/);
  assert.match(routes, /method === "DELETE"/);
  assert.match(routes, /deleteDisplayRevision/);
  assert.match(repo, /deleteById/);
  assert.match(api, /localDeleteDisplayRevision/);
});
