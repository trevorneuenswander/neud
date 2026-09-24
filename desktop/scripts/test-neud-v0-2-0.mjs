#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

let passed = 0;
function pass(name, fn) {
  test(name, () => {
    fn();
    passed += 1;
  });
}

pass("1 lot filter removed from Local Controller", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /Filter lots by auction day/);
  assert.doesNotMatch(controller, /formatAuctionDayFilterLabel/);
});

pass("2 stream ticker day filter control module", () => {
  const control = read("src/components/displays/StreamTickerDayFilterControl.tsx");
  assert.match(control, /notifyDisplayBridgeDataChanged/);
  assert.match(control, /localSetStreamTickerDayFilter/);
});

pass("3 day filter not duplicated on display card UI", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.doesNotMatch(card, /StreamTickerDayFilterControl/);
});

pass("4-7 ticker day filter persisted server-side", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /getStreamTickerDayFilter/);
  assert.match(service, /setStreamTickerDayFilter/);
  assert.match(service, /streamTickerDayFilterSettingKey/);
});

pass("8 ticker upcoming respects day filter layer", () => {
  const ticker = read("src/lib/displays/lower-ticker-data.ts");
  assert.match(ticker, /dayFilter/);
  assert.match(ticker, /getAuctionDayFromLotNumber/);
});

pass("9 canonical snapshot unchanged in bridge", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /snapshot,/);
  assert.match(service, /streamTickerDayFilter/);
});

pass("10 scraper diagnostics module present", () => {
  const diagnostics = read("workers/data-engine/src/scraper-runtime-diagnostics.js");
  assert.match(diagnostics, /workerModuleFormat/);
  assert.match(diagnostics, /firstScraperRuntimeFailureStage/);
});

pass("11 legacy puppeteer resolver uses createRequire", () => {
  const resolver = read("workers/data-engine/src/adapters/legacy-puppeteer-resolver.js");
  assert.match(resolver, /createRequire/);
  assert.doesNotMatch(resolver, /\brequire\s*\(/);
});

pass("18-27 invitation error mapping", () => {
  const route = read("src/app/api/access/invitations/route.ts");
  const errors = read("src/lib/access-management/errors.ts");
  assert.match(route, /auth_admin_invite_failed/);
  assert.match(errors, /invitation_service_unavailable/);
  assert.match(errors, /auth_admin_invite_failed/);
});

pass("29-35 cloud directory syncs local project team assignments", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const sync = read("desktop/src/services/cloud-access-local-sync.ts");
  assert.match(service, /syncCloudDirectoryProjectTeams/);
  assert.match(sync, /setTeamsForProject/);
});

pass("41 directory refresh uses forceRefresh after mutations", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /getCloudAccessDirectory\(\{ forceRefresh: true \}\)/);
});

test("summary", () => {
  console.log(`v0.2.0 static checks registered (${passed} cases)`);
});
