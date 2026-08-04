import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("duplicate dialog has no slug field", () => {
  const modal = read("src/components/developer-tools/DuplicateDisplayModal.tsx");
  assert.doesNotMatch(modal, /duplicate-display-slug/);
  assert.doesNotMatch(modal, /Display slug/);
  assert.match(modal, /Display name/);
});

test("duplicate request does not send slug", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  const api = read("src/lib/local/developer-tools-api.ts");
  assert.doesNotMatch(menu, /slug:/);
  assert.match(api, /localDuplicateDeveloperDisplay/);
  assert.doesNotMatch(api.slice(api.indexOf("localDuplicateDeveloperDisplay")), /slug\?:/);
});

test("backend generates unique duplicate slug", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /resolveDuplicateSlug/);
  assert.match(service, /resolveUniqueCopyName/);
  assert.match(service, /-copy/);
});

test("list project displays includes custom html displays", () => {
  const data = read("desktop/src/services/local-data-service.ts");
  assert.match(data, /REGISTRY_DISPLAY_KEYS/);
  assert.match(data, /toCustomPortalDisplay/);
  assert.match(data, /insertDisplayAfterInUserOrder/);
});

test("duplicate list cache updates immediately in displays list client", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /handleDisplayDuplicated/);
  assert.match(list, /onDuplicated/);
});
