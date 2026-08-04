/**
 * Static and optional live parity checks for the direct legacy runtime module.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createBagAuctionLegacyRuntime,
  LEGACY_RUNTIME_VERSION,
} from "../src/adapters/bag-auction-legacy-runtime.js";

test("production legacy runtime exposes the required version marker", () => {
  assert.equal(LEGACY_RUNTIME_VERSION, "legacy-v5.1-direct-port");
  const runtime = createBagAuctionLegacyRuntime({
    engineId: "static-test",
    config: {
      AUCTION_URL: "https://example.test/vehicles",
      LOGIN_URL: "https://example.test/users/sign_in",
      AUCTIONS_DISPLAY_URL: "https://example.test/auctions",
      AUCTION_EMAIL: "test@example.com",
      AUCTION_PASSWORD: "test-password",
      COOKIES_FILE: "cookies.json",
    },
  });
  assert.equal(runtime.version, "legacy-v5.1-direct-port");
  assert.equal(typeof runtime.start, "function");
  assert.equal(typeof runtime.scrapeOnce, "function");
  assert.equal(typeof runtime.stop, "function");
  assert.equal(typeof runtime.login, "function");
  assert.equal(typeof runtime.scrape, "function");
});

test("bag-auction adapter imports the direct legacy runtime only", () => {
  const adapterSource = fs.readFileSync(
    new URL("../src/adapters/bag-auction.js", import.meta.url),
    "utf8",
  );
  assert.match(adapterSource, /bag-auction-legacy-runtime\.js/);
  assert.doesNotMatch(adapterSource, /bag-login-flow\.js/);
  assert.doesNotMatch(adapterSource, /performBagLogin/);
});

test("legacy runtime source preserves server.js login sequence markers", () => {
  const source = fs.readFileSync(
    new URL("../src/adapters/bag-auction-legacy-runtime.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /waitUntil: "networkidle2"/);
  assert.match(source, /page\.evaluate\(/);
  assert.match(source, /dispatchEvent\(new Event\("input"\)\)/);
  assert.match(source, /#main-container table tbody/);
  assert.match(source, /page\.reload\(\{ waitUntil: "networkidle2"/);
  assert.match(source, /#vehicle_sold/);
  assert.match(source, /#vehicle-content/);
  assert.doesNotMatch(source, /clearStoredCookies/);
  assert.doesNotMatch(source, /fillLoginField/);
});
