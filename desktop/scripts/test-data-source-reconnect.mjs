import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display data source subscription stays live across selector and controller", () => {
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const client = readSrc("src/lib/desktop/display-data-source-client.ts");
  const resolver = readSrc("src/lib/displays/resolve-effective-display-data.ts");
  const desktopResolver = readSrc("desktop/src/displays/resolve-effective-display-data.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(selector.includes("subscribeToDesktopDisplayDataSource"));
  assert.ok(controller.includes("subscribeToDesktopDisplayDataSource"));
  assert.ok(client.includes("onChanged"));
  assert.ok(!client.includes("data-source.changed"));
  assert.ok(resolver.includes("displayCurrencies"));
  assert.ok(desktopResolver.includes("manualBidConversions"));
  assert.ok(localData.includes("displayDataRevision"));
  assert.ok(localData.includes("resolveEffectiveDisplayData"));
});

test("pylon feed currencies come from scraper auction display snapshot", () => {
  const pylon = readSrc("src/lib/displays/pylon-data.ts");
  const resolver = readSrc("src/lib/displays/resolve-effective-display-data.ts");

  assert.ok(pylon.includes("currencies: asStringArray(raw.currencies)"));
  assert.ok(resolver.includes("readScraperCurrencies"));
  assert.ok(!resolver.includes("currentLot?.currentBidLabel"));
});
