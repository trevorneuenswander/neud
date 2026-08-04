import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAdapter } from "../src/adapters/registry.js";
import { validateGenericScrapeConfig } from "../src/adapters/generic-webpage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "test-fixtures", "sample-page.html");
const fixtureUrl = pathToFileURL(fixturePath).href;

test("missing adapter is rejected by registry", () => {
  assert.throws(
    () => getAdapter({ config: {} }),
    /No scraper adapter is configured/,
  );
});

test("unknown adapter is rejected by registry", () => {
  assert.throws(
    () => getAdapter({ config: { adapter: "unknown-adapter" } }),
    /Unsupported adapter: unknown-adapter/,
  );
});

test("bag-auction adapter resolves", () => {
  const adapter = getAdapter({ config: { adapter: "bag-auction" } });
  assert.equal(typeof adapter.scrapeOnce, "function");
});

test("generic-webpage adapter resolves", () => {
  const adapter = getAdapter({ config: { adapter: "generic-webpage" } });
  assert.equal(typeof adapter.scrapeOnce, "function");
});

test("generic validation requires page url", () => {
  assert.throws(
    () =>
      validateGenericScrapeConfig({
        engine: { config: { adapter: "generic-webpage", fields: [{ key: "headline", selector: "h1", extraction: "text" }] } },
        sources: [],
      }),
    /Page URL is not configured/,
  );
});

test("generic validation requires fields", () => {
  assert.throws(
    () =>
      validateGenericScrapeConfig({
        engine: { config: { adapter: "generic-webpage", fields: [] } },
        sources: [{ source_key: "page", url: fixtureUrl, enabled: true }],
      }),
    /at least one extraction field/,
  );
});

test("generic validation requires login selectors when login url present", () => {
  assert.throws(
    () =>
      validateGenericScrapeConfig({
        engine: {
          config: {
            adapter: "generic-webpage",
            fields: [{ key: "headline", selector: "h1", extraction: "text" }],
          },
        },
        sources: [
          { source_key: "page", url: fixtureUrl, enabled: true },
          { source_key: "login", url: "https://example.com/login", enabled: true },
        ],
      }),
    /login selectors are missing/,
  );
});

test("generic adapter extracts configured fields from local fixture", async () => {
  const adapter = getAdapter({ config: { adapter: "generic-webpage" } });
  await adapter.start({
    settings: { headless: true },
    engine: {
      config: {
        adapter: "generic-webpage",
        fields: [
          { key: "headline", selector: "#headline", extraction: "text" },
          { key: "summary", selector: ".summary", extraction: "text" },
          { key: "hero", selector: ".hero", extraction: "attribute", attribute: "src" },
          { key: "missing", selector: ".does-not-exist", extraction: "text" },
        ],
      },
    },
    sources: [{ source_key: "page", url: fixtureUrl, enabled: true }],
  });

  const snapshot = await adapter.scrapeOnce({
    settings: { headless: true },
    engine: {
      config: {
        adapter: "generic-webpage",
        fields: [
          { key: "headline", selector: "#headline", extraction: "text" },
          { key: "summary", selector: ".summary", extraction: "text" },
          { key: "hero", selector: ".hero", extraction: "attribute", attribute: "src" },
          { key: "missing", selector: ".does-not-exist", extraction: "text" },
        ],
      },
    },
    sources: [{ source_key: "page", url: fixtureUrl, enabled: true }],
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.adapter, "generic-webpage");
  assert.equal(snapshot.values.headline.value, "Sample Headline");
  assert.equal(snapshot.values.summary.value, "Summary text for testing.");
  assert.equal(snapshot.values.hero.value, "/images/hero.png");
  assert.equal(snapshot.values.missing.found, false);

  await adapter.stop();
});

test("remote worker bundle includes generic adapter file", () => {
  const adapterFile = path.join(__dirname, "..", "src", "adapters", "generic-webpage.js");
  assert.equal(fs.existsSync(adapterFile), true);
});
