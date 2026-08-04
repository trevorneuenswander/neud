import test from "node:test";
import assert from "node:assert/strict";
import {
  BROAD_ARROW_CANONICAL_PROJECT,
  BROAD_ARROW_PHASE_SETTING_KEY,
  readBroadArrowEnvironmentUrls,
} from "../dist/bag/broad-arrow-phase.js";

test("canonical Broad Arrow project matches development phase spec", () => {
  assert.equal(BROAD_ARROW_CANONICAL_PROJECT.name, "Broad Arrow Auctions");
  assert.equal(BROAD_ARROW_CANONICAL_PROJECT.slug, "broad-arrow-auctions");
  assert.equal(BROAD_ARROW_CANONICAL_PROJECT.projectType, "bag-graphics");
  assert.equal(BROAD_ARROW_PHASE_SETTING_KEY, "phase.broad_arrow_focus_v1");
});

test("environment URL readers prefer legacy auction env names", () => {
  const original = {
    AUCTION_URL: process.env.AUCTION_URL,
    LOGIN_URL: process.env.LOGIN_URL,
    AUCTIONS_DISPLAY_URL: process.env.AUCTIONS_DISPLAY_URL,
  };

  process.env.AUCTION_URL = "https://example.test/vehicles";
  process.env.LOGIN_URL = "https://example.test/sign_in";
  process.env.AUCTIONS_DISPLAY_URL = "https://example.test/auctions";

  const urls = readBroadArrowEnvironmentUrls();
  assert.equal(urls.vehicles, "https://example.test/vehicles");
  assert.equal(urls.login, "https://example.test/sign_in");
  assert.equal(urls.auctionDisplay, "https://example.test/auctions");

  if (original.AUCTION_URL === undefined) delete process.env.AUCTION_URL;
  else process.env.AUCTION_URL = original.AUCTION_URL;
  if (original.LOGIN_URL === undefined) delete process.env.LOGIN_URL;
  else process.env.LOGIN_URL = original.LOGIN_URL;
  if (original.AUCTIONS_DISPLAY_URL === undefined) {
    delete process.env.AUCTIONS_DISPLAY_URL;
  } else {
    process.env.AUCTIONS_DISPLAY_URL = original.AUCTIONS_DISPLAY_URL;
  }
});
