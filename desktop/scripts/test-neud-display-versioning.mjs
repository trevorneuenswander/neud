import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display edit page loads versioning and revision history", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(client, /DisplayVersionList/);
  assert.match(client, /localPublishDisplayDraft/);
  assert.match(client, /localValidateDisplayDraft/);
});

test("description editing is separate from html versioning", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(client, /Description/);
  assert.match(client, /Save Description/);
  assert.match(client, /draftHtml !== savedBaselineHtml/);
});

test("active revision uses description and timestamp", () => {
  const labels = read("src/lib/developer-tools/revision-labels.ts");
  const client = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(labels, /formatRevisionDescription/);
  assert.match(client, /activeRevisionDescription/);
});

test("duplicate copies refresh rate and defaults to disabled", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /refreshRateMs: sourceDisplay.refreshRateMs/);
  assert.match(service, /enabled: false/);
});

test("archive uses soft archive confirmation copy", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /HTML version history/);
  assert.match(menu, /Activity history/);
});
