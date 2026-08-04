import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display toolbar selects use pointer cursor when enabled", () => {
  const refresh = read("src/components/displays/DisplayRefreshRateSelect.tsx");
  const size = read("src/components/displays/DisplaySizeSelect.tsx");

  assert.match(refresh, /cursor-pointer/);
  assert.match(refresh, /disabled:cursor-not-allowed/);
  assert.match(size, /cursor-pointer/);
  assert.match(size, /disabled:cursor-not-allowed/);
});

test("legacy pylon bridge references do not suppress NEUDDisplay injection", async () => {
  const { hasEmbeddedNeudDisplayRuntime, wrapStandaloneDisplayHtml } = await import(
    "../dist/developer-tools/templates.js"
  );
  const { applyHtmlDisplayRuntimeAdapters } = await import(
    "../dist/displays/html-display-runtime-adapters.js"
  );
  const legacyPylon = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  const bridge = read("desktop/src/displays/legacy-pylon-live-bridge.js");

  const adapted = applyHtmlDisplayRuntimeAdapters(legacyPylon, {
    projectId: "project",
    projectSlug: "broad-arrow-auctions",
    displayId: "display",
    slug: "legacy-pylon",
    displayKey: "legacy-pylon",
    settings: { runtimeAdapterKey: "broad-arrow-legacy-pylon" },
    runtimeAdapterKey: "broad-arrow-legacy-pylon",
  });
  assert.match(adapted, /window\.NEUDDisplay/);
  assert.equal(hasEmbeddedNeudDisplayRuntime(adapted), false);
  assert.equal(hasEmbeddedNeudDisplayRuntime(bridge), false);

  const wrapped = wrapStandaloneDisplayHtml({
    html: adapted,
    dataUrl: "/api/display/project/legacy-pylon/data?preview=1",
    displayInfo: { projectId: "project", displayId: "display", slug: "legacy-pylon" },
  });

  assert.match(wrapped, /window\.NEUDDisplay\s*=\s*window\.NEUDDisplay\s*\|\|/);
  assert.match(wrapped, /NEUD_DATA_UPDATE/);
});

test("runtime data url stays same-origin through the display api proxy", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(
    service,
    /const path = `\/api\/display\/\$\{encodeURIComponent\(projectId\)\}\/\$\{encodeURIComponent\(slug\)\}\/data`/,
  );
  assert.doesNotMatch(
    service.slice(service.indexOf("buildDisplayDataUrl"), service.indexOf("getRevisionSource")),
    /localApiBaseUrl.*\/api\/display/,
  );
});

test("management cards and runtime use the same proxied data endpoint shape", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(card, /\/api\/display\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(templates, /resolveCanonicalSnapshot/);
  assert.match(templates, /NEUD_DISPLAY_READY/);
});
