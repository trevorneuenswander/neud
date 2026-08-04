import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("generic display bridge resolves active canonical snapshot", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /getGenericDisplayBridgeData/);
  assert.match(localData, /getActiveCanonicalProjectSnapshot/);
  assert.match(localData, /\.\.\.canonicalFields/);
  assert.match(localData, /snapshot,/);
});

test("runtime publishes canonical snapshot not wrapper object", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /resolveCanonicalSnapshot/);
  assert.match(templates, /payload\.snapshot && typeof payload\.snapshot === "object"/);
  assert.match(templates, /window\.NEUDDisplay\._publish\(snapshot/);
});

test("json preview and bridge both use canonical project snapshot helpers", () => {
  const preview = read("src/components/data-engines/webpage-scraper/BagLiveStateJsonPreview.tsx");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(preview, /canonicalSnapshot/);
  assert.match(localData, /serializeCanonicalProjectSnapshot/);
});

test("legacy display connection normalizes nested snapshot payloads", () => {
  const runtime = read("public/displays/shared/display-connection.js");
  assert.match(runtime, /normalizeDisplayPayload/);
  assert.match(runtime, /json\.snapshot/);
});

test("NEUDDisplay bridge exposes canonical aliases and legacy callback", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /window\.NEUD_DATA = snapshot/);
  assert.match(templates, /window\.displayData = snapshot/);
  assert.match(templates, /CustomEvent\("neud:data"/);
  assert.match(templates, /window\.updateDisplay/);
});

test("data endpoint serves preview mode while display disabled for management cards only", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  const proxy = read("src/lib/displays/project-display-api-proxy.ts");
  const dataRoute = read("src/app/api/display/[projectId]/[slug]/data/route.ts");
  assert.match(server, /!viewerState\.enabled && !previewMode/);
  assert.match(proxy, /proxyProjectDisplayDataRoute/);
  assert.match(dataRoute, /proxyProjectDisplayDataRoute/);
});

test("stored html is wrapped at serve time without mutation", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const resolveBlock = service.slice(
    service.indexOf("resolveDisplayViewer("),
    service.indexOf("buildDisplayViewerPath("),
  );
  assert.match(service, /wrapStandaloneDisplayHtml/);
  assert.doesNotMatch(resolveBlock, /writeDisplayPublished/);
});
