import test from "node:test";
import assert from "node:assert/strict";
import { validateImportPackage, countImportTotals } from "../dist/import/import-validator.js";
import { buildImportPackage } from "../dist/import/import-normalizer.js";
import { buildCopySlug, buildCopyName } from "../dist/import/import-writer.js";

const baseProject = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Auction Project",
  slug: "auction-project",
  description: null,
  project_type: "bag-graphics",
  status: "active",
  settings: {},
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const baseEngine = {
  id: "22222222-2222-4222-8222-222222222222",
  project_id: baseProject.id,
  name: "Webpage Scraper",
  engine_key: "webpage-scraper",
  engine_type: "webpage-scraper",
  enabled: true,
  desired_state: "stopped",
  execution_mode: "local-desktop",
  config: { adapter: "bag-auction" },
};

test("validateImportPackage rejects unsupported version", () => {
  const pkg = buildImportPackage({
    projects: [baseProject],
    engines: [baseEngine],
    settings: [],
    scraperSources: [],
    snapshots: [],
  });

  const invalid = { ...pkg, version: 99 };
  const result = validateImportPackage(invalid);
  assert.equal(result.valid, false);
});

test("validateImportPackage detects duplicate engine IDs", () => {
  const pkg = buildImportPackage({
    projects: [
      baseProject,
      {
        ...baseProject,
        id: "33333333-3333-4333-8333-333333333333",
        slug: "other-project",
      },
    ],
    engines: [baseEngine, { ...baseEngine }],
    settings: [],
    scraperSources: [],
    snapshots: [],
  });

  const result = validateImportPackage(pkg);
  assert.equal(result.valid, false);
});

test("countImportTotals summarizes package contents", () => {
  const pkg = buildImportPackage({
    projects: [baseProject],
    engines: [baseEngine],
    settings: [
      {
        engine_id: baseEngine.id,
        poll_interval_ms: 5000,
        details_ttl_ms: 300000,
        max_detail_checks_per_poll: 3,
        headless: true,
      },
    ],
    scraperSources: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        engine_id: baseEngine.id,
        name: "Auction",
        source_key: "auction",
        url: "https://example.com",
        source_type: "bag-auction",
        enabled: true,
        position: 0,
      },
    ],
    snapshots: [
      {
        engine_id: baseEngine.id,
        data: { lots: [] },
        record_count: 0,
        payload_size_bytes: 10,
        duration_ms: 100,
        captured_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  const totals = countImportTotals(pkg);
  assert.equal(totals.projects, 1);
  assert.equal(totals.engines, 1);
  assert.equal(totals.scraperSources, 1);
  assert.equal(totals.snapshots, 1);
});

test("buildCopySlug avoids reserved slugs", () => {
  const reserved = new Set(["auction-project-imported-copy"]);
  assert.equal(
    buildCopySlug("auction-project", reserved),
    "auction-project-imported-copy-2",
  );
});

test("buildCopyName adds imported suffix", () => {
  assert.equal(buildCopyName("Auction Project"), "Auction Project (Imported Copy)");
});
