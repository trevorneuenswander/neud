#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("../../../workers/data-engine/node_modules/puppeteer");

const cdpUrl = process.env.NEUD_ELECTRON_CDP?.trim() || "http://127.0.0.1:9333";
const origin = process.env.NEUD_DIAG_ORIGIN?.trim() || "http://127.0.0.1:3000";

const browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("/displays")) ?? pages[0];
if (!page) {
  console.error("No Electron page found");
  process.exit(1);
}

if (!page.url().includes("/displays")) {
  await page.goto(`${origin}/projects/broad-arrow-auctions/displays`, {
    waitUntil: "networkidle2",
    timeout: 120_000,
  });
}

const labels = [
  "New Ticker v1 display enabled",
  "Stream Ticker display enabled",
  "Stream Ticker v1 display enabled",
];
let toggled = false;
for (const label of labels) {
  const handle = await page.$(`[aria-label="${label}"]`);
  if (!handle) continue;
  const checked = await handle.evaluate((el) => el.getAttribute("aria-checked"));
  if (checked !== "true") {
    await handle.click();
    toggled = true;
  }
  break;
}

if (!toggled) {
  const fallback = await page.evaluate(() => {
    const switches = [...document.querySelectorAll('[role="switch"]')];
    const match = switches.find((el) => {
      const card = el.closest("article, [data-slot], .rounded-lg, div");
      const text = card?.textContent ?? "";
      return /new ticker|stream ticker/i.test(text);
    });
    if (!match) return { ok: false, reason: "switch_not_found" };
    if (match.getAttribute("aria-checked") === "true") return { ok: true, already: true };
    match.click();
    return { ok: true, clicked: true };
  });
  console.log(JSON.stringify({ toggled: fallback }, null, 2));
} else {
  console.log(JSON.stringify({ toggled: true }, null, 2));
}

await new Promise((r) => setTimeout(r, 2500));
const enabledResponse = await fetch(`${origin}/api/displays/new-ticker-v1/enabled`, {
  cache: "no-store",
});
console.log(
  JSON.stringify({ enabledApi: await enabledResponse.json() }, null, 2),
);
await browser.disconnect();
