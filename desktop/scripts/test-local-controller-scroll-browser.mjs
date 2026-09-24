#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const puppeteerPath = path.join(
  repoRoot,
  "workers",
  "data-engine",
  "node_modules",
  "puppeteer",
  "lib",
  "esm",
  "puppeteer",
  "puppeteer.js",
);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("controller scroll browser harness is wired", () => {
  assert.match(read("src/lib/portal/controller-scroll-diagnostics.ts"), /ControllerScrollProbe/);
  assert.match(read("src/lib/portal/project-scroll-container.ts"), /preserveProjectScrollPosition/);
  const photos = read("src/components/bag-graphics/LotPhotoThumbnails.tsx");
  assert.match(photos, /preloadPhotoUrl/);
  assert.match(photos, /panelMinHeight/);
  assert.match(photos, /controller-photo-transition-diagnostics/);
});

test("browser e2e scroll when NEUD_RUN_BROWSER_TESTS=1", async () => {
  if (process.env.NEUD_RUN_BROWSER_TESTS !== "1") {
    return;
  }
  const baseUrl = process.env.NEUD_CONTROLLER_TEST_URL ?? "http://127.0.0.1:3000";
  const projectSlug = process.env.NEUD_CONTROLLER_TEST_SLUG ?? "broad-arrow-auctions";
  if (!fs.existsSync(puppeteerPath)) {
    throw new Error("Puppeteer not found in workers/data-engine.");
  }
  const puppeteer = await import(pathToFileURL(puppeteerPath).href);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/projects/${projectSlug}/controller`, {
    waitUntil: "networkidle2",
    timeout: 120_000,
  });
  const before = await page.evaluate(() => {
    const container = document.querySelector(".project-layout-frame");
    const photoPanel = document.querySelector("[aria-label='Downloaded Photos']")
      ?.closest(".grid")
      ?? document.querySelector(".grid.min-h-\\[6\\.5rem\\]");
    if (!(container instanceof HTMLElement)) {
      return null;
    }
    container.scrollTop = Math.max(240, Math.floor(container.scrollHeight * 0.5));
    const photoHeight = photoPanel instanceof HTMLElement ? photoPanel.offsetHeight : 0;
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      photoHeight,
      scrollbarPresent: container.scrollHeight > container.clientHeight + 1,
    };
  });
  assert.ok(before && before.scrollTop > 100);
  await page.click('button:has-text("Next Lot")').catch(() => page.click("text=Next Lot"));
  await page.waitForTimeout(400);
  const during = await page.evaluate(() => {
    const container = document.querySelector(".project-layout-frame");
    const photoPanel = document.querySelector(".grid.min-h-\\[6\\.5rem\\]");
    if (!(container instanceof HTMLElement)) {
      return null;
    }
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      photoHeight: photoPanel instanceof HTMLElement ? photoPanel.offsetHeight : 0,
      scrollbarPresent: container.scrollHeight > container.clientHeight + 1,
    };
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const container = document.querySelector(".project-layout-frame");
    const photoPanel = document.querySelector(".grid.min-h-\\[6\\.5rem\\]");
    if (!(container instanceof HTMLElement)) {
      return null;
    }
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      photoHeight: photoPanel instanceof HTMLElement ? photoPanel.offsetHeight : 0,
      scrollbarPresent: container.scrollHeight > container.clientHeight + 1,
    };
  });
  assert.ok(during && after);
  assert.ok(during.scrollbarPresent, "scrollbar disappeared during transition");
  assert.ok(after.scrollbarPresent, "scrollbar disappeared after transition");
  assert.ok(
    Math.abs(after.scrollTop - before.scrollTop) <= 12,
    `scroll jumped from ${before.scrollTop} to ${after.scrollTop}`,
  );
  if (before.photoHeight > 40) {
    assert.ok(
      during.photoHeight >= before.photoHeight * 0.85,
      `photo panel collapsed during transition (${during.photoHeight} vs ${before.photoHeight})`,
    );
  }
  await browser.close();
});
