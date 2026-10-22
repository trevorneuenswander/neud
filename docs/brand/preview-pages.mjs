#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("../../workers/data-engine/node_modules/puppeteer");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "brand-style-guide.html");
const outDir = "/tmp/neud-brand-preview";

fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--font-render-hinting=none", "--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(htmlPath).href, {
    waitUntil: ["load", "networkidle0"],
    timeout: 120000,
  });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 400));

  const pages = await page.$$(".page");
  for (let i = 0; i < pages.length; i++) {
    const file = path.join(
      outDir,
      `page-${String(i + 1).padStart(2, "0")}.png`,
    );
    await pages[i].screenshot({ path: file, type: "png" });
    console.log(file);
  }
} finally {
  await browser.close();
}
