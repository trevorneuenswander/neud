import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display editor uses draft and baseline html state", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");

  assert.match(client, /draftHtml/);
  assert.match(client, /savedBaselineHtml/);
  assert.match(client, /draftHtml !== savedBaselineHtml/);
  assert.match(client, /readOnly=\{!isEditable\}/);
});

test("display editor separates editable and historical read-only modes", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");

  assert.match(client, /historical-readonly/);
  assert.match(client, /Return to Active Version/);
  assert.match(client, /localGetDeveloperRevisionSource/);
});

test("display editor does not hide editor during save", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");

  assert.match(client, /loadState === "loaded"/);
  assert.doesNotMatch(client, /await loadDisplay\(\)/);
});

test("active revision label includes version and timestamp with seconds", () => {
  const labels = read("src/lib/developer-tools/revision-labels.ts");
  const client = read("src/components/displays/DisplayEditClient.tsx");

  assert.match(labels, /formatActiveRevisionLabel/);
  assert.match(labels, /second: "2-digit"/);
  assert.match(client, /formatActiveRevisionLabel/);
  assert.match(client, /Active Revision/);
});

test("revision download filename sanitizes timestamp characters", () => {
  const labels = read("src/lib/developer-tools/revision-labels.ts");
  const client = read("src/components/displays/DisplayEditClient.tsx");

  assert.match(labels, /formatRevisionDownloadTimestamp/);
  assert.match(client, /formatRevisionDownloadTimestamp/);
  assert.match(labels, /hour12: false/);
});

test("revision source endpoint supports historical html viewing", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const routes = read("desktop/src/services/developer-tools-routes.ts");
  const api = read("src/lib/local/developer-tools-api.ts");

  assert.match(service, /getRevisionSource/);
  assert.match(routes, /revisionSourceMatch/);
  assert.match(api, /localGetDeveloperRevisionSource/);
});
