import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("standalone uploaded HTML is wrapped with runtime bootstrap at serve time", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(service, /wrapStandaloneDisplayHtml/);
  assert.match(templates, /wrapStandaloneDisplayHtml/);
  assert.match(templates, /buildDisplayRuntimeScript/);
});

test("runtime bridge exposes canonical snapshot and readiness handshake", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /window\.NEUDDisplay/);
  assert.match(templates, /subscribe\(callback\)/);
  assert.match(templates, /window\.NEUD_DATA = snapshot/);
  assert.match(templates, /CustomEvent\("neud:data"/);
  assert.match(templates, /NEUD_DISPLAY_BRIDGE_ACK/);
  assert.match(templates, /resolveCanonicalSnapshot/);
});

test("display data endpoint serves canonical snapshot", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /getGenericDisplayBridgeData/);
  assert.match(localData, /getActiveCanonicalProjectSnapshot/);
  assert.match(localData, /\.\.\.canonicalFields/);
});

test("html data contract documentation exists", () => {
  const doc = read("docs/displays/html-data-contract.md");
  assert.match(doc, /NEUDDisplay\.subscribe/);
  assert.match(doc, /neud:data/);
});
