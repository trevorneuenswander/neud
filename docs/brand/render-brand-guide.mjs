#!/usr/bin/env node
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("../../workers/data-engine/node_modules/puppeteer");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "brand-style-guide.html");
const outPath = path.join(__dirname, "..", "..", "NEUD_Brand_Style_Guide.pdf");
const alsoCopy = path.join(__dirname, "NEUD_Brand_Style_Guide.pdf");

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

const executablePath =
  chromeCandidates.find((p) => {
    try {
      require("node:fs").accessSync(p);
      return true;
    } catch {
      return false;
    }
  }) || undefined;

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: ["--font-render-hinting=none", "--disable-gpu", "--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1275, height: 1650, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(htmlPath).href, {
    waitUntil: ["load", "networkidle0"],
    timeout: 120000,
  });

  // Ensure webfonts are ready before print
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 500));

  const pageCount = await page.evaluate(
    () => document.querySelectorAll(".page").length,
  );

  await page.pdf({
    path: outPath,
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Duplicate into docs/brand for easy discovery
  const fs = await import("node:fs/promises");
  await fs.copyFile(outPath, alsoCopy);

  const stats = await fs.stat(outPath);
  console.log(
    JSON.stringify(
      {
        ok: true,
        pages: pageCount,
        bytes: stats.size,
        path: outPath,
        brandCopy: alsoCopy,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
