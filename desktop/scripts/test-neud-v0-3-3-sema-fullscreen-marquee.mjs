/**
 * v0.3.3 — SEMA Fullscreen Schedule UHD: fixed per-slot fonts + overflow marquee
 * that does not restart when unrelated highlights change.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const HTML_REL = "desktop/src/displays/bundled/sema-schedule-fullscreen-uhd-v1.html";
const PREVIOUS_V032_FULLSCREEN_HASH =
  "b5ad9fad25d4acaa5c927d221f3f0e0ed3cf14e0321e6d0c219fa3af0edbfb6d";
const PREVIOUS_V033_FULLSCREEN_40PX_HASH =
  "48da36be144a047bf3786e0766d297a69a67923a485770c2a54a5a09c07a8891";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function hashRuntimeDisplayBundle(html) {
  const normalized = html.replace(/\r\n/g, "\n").trimEnd();
  return crypto.createHash("sha256").update(`${normalized}\n\n\n`).digest("hex");
}

function electronBinary() {
  const electronPath = require.resolve("electron");
  const electronDir = path.dirname(electronPath);
  const relative = fs.readFileSync(path.join(electronDir, "path.txt"), "utf8").trim();
  return path.join(electronDir, "dist", relative);
}

test("fullscreen preserves per-slot original sizes and never shrinks", () => {
  const html = read(HTML_REL);
  assert.match(html, /TITLE_BASE = \{ now: 196, next: 128, later: 108 \}/);
  assert.match(html, /BODY_BASE = \{ now: 90, next: 74, later: 66 \}/);
  assert.match(html, /--now-title:\s*196px/);
  assert.match(html, /--next-title:\s*128px/);
  assert.match(html, /--later-title:\s*108px/);
  assert.doesNotMatch(html, /TITLE_MIN|BODY_MIN|SHRINK_STEP/);
  assert.doesNotMatch(html, /--title-min-|--body-min:/);
  assert.doesNotMatch(html, /var TITLE_BASE = 57/);
  assert.doesNotMatch(html, /var BODY_BASE = 52/);
});

test("fullscreen uses SEMA Ticker / Broad Arrow marquee kinematics", () => {
  const html = read(HTML_REL);
  assert.match(html, /var MARQUEE_PX_PER_SEC = 50/);
  assert.doesNotMatch(html, /var MARQUEE_PX_PER_SEC = 40/);
  assert.match(html, /var MARQUEE_EASE_SEC = 1/);
  assert.match(html, /var MARQUEE_PAUSE_MS = 4000/);
  assert.match(html, /function computeLoopKinematics/);
  assert.match(html, /phase = "prepause"/);
  assert.match(html, /highlightChanged && !contentChanged/);
  assert.match(html, /marqueeIsActive\(field\)/);
  assert.match(html, /sema-fullscreen-v0\.3\.3-marquee-50/);
});

test("fullscreen safe-upgrade registers prior packaged hash", () => {
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  assert.match(hydration, /SEMA_SCHEDULE_FULLSCREEN_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES/);
  assert.match(hydration, new RegExp(PREVIOUS_V032_FULLSCREEN_HASH));
  assert.match(hydration, new RegExp(PREVIOUS_V033_FULLSCREEN_40PX_HASH));
  assert.match(hydration, /schedule-fullscreen-uhd/);
  const current = hashRuntimeDisplayBundle(read(HTML_REL));
  assert.notEqual(current, PREVIOUS_V032_FULLSCREEN_HASH);
  assert.notEqual(current, PREVIOUS_V033_FULLSCREEN_40PX_HASH);
});

test("BrowserWindow: overflow marquee + highlight does not restart unrelated fields", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-fs-marquee-"));
  const htmlPath = path.join(tmpDir, "fullscreen.html");
  const probePath = path.join(tmpDir, "probe.cjs");
  fs.copyFileSync(path.join(repoRoot, HTML_REL), htmlPath);

  fs.writeFileSync(
    probePath,
    `'use strict';
const { app, BrowserWindow } = require("electron");

const htmlPath = ${JSON.stringify(htmlPath)};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1600,
    height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await win.loadFile(htmlPath);
  await win.webContents.executeJavaScript(
    "document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()",
  );

  const result = await win.webContents.executeJavaScript(\`(async () => {
    const api = window.__SEMA_SCHEDULE_FULLSCREEN_UHD__;
    const reports = [];

    function field(slot, kind) {
      return document.querySelector('[data-slot="' + slot + '"] [data-field="' + kind + '"]');
    }
    function primary(el) {
      return el.querySelector(".field-text:not([data-clone])");
    }
    function hasClone(el) {
      return Boolean(el.querySelector('[data-clone="1"]'));
    }
    function fontSizePx(el) {
      return parseFloat(getComputedStyle(primary(el)).fontSize);
    }
    function trackTransform(el) {
      const track = el.querySelector(".field-track");
      return track ? track.style.transform : "";
    }

    // Fullscreen type is large (196/90 etc.) — use wide columns for short copy,
    // and a constrained width only where overflow is intentional.
    document.querySelectorAll(".field").forEach((el) => {
      el.style.width = "1800px";
      el.style.maxWidth = "1800px";
    });

    const longTitle =
      "This is an extremely long SEMA fullscreen NOW title that must overflow and marquee without shrinking";
    const longDesc =
      "This is an extremely long SEMA fullscreen NEXT description that must overflow independently";

    // Constrain only the fields expected to overflow.
    field("now", "title").style.width = "520px";
    field("now", "title").style.maxWidth = "520px";
    field("next", "description").style.width = "520px";
    field("next", "description").style.maxWidth = "520px";

    api.render({
      schedule: {
        now: { title: longTitle, description: "OK", time: "10:00" },
        next: { title: "Next", description: longDesc },
        later: { title: "Later", description: "Body" },
        highlightActive: false,
        currentIndex: 1,
      },
    });

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 120));

    // Advance past initial prepause so transforms move.
    await new Promise((r) => setTimeout(r, api.MARQUEE_PAUSE_MS + 250));

    const nowTitle = field("now", "title");
    const nextDesc = field("next", "description");
    const laterTitle = field("later", "title");

    reports.push({
      step: "long-now-title-marquees",
      ok: hasClone(nowTitle) && Math.abs(fontSizePx(nowTitle) - api.TITLE_BASE.now) < 0.5,
      fontSize: fontSizePx(nowTitle),
      expected: api.TITLE_BASE.now,
      clone: hasClone(nowTitle),
    });
    reports.push({
      step: "short-now-desc-static",
      ok: !hasClone(field("now", "description")) &&
        Math.abs(fontSizePx(field("now", "description")) - api.BODY_BASE.now) < 0.5,
      fontSize: fontSizePx(field("now", "description")),
      clone: hasClone(field("now", "description")),
      viewport: field("now", "description").clientWidth,
      textWidth: primary(field("now", "description")).scrollWidth,
    });
    reports.push({
      step: "long-next-desc-marquees",
      ok: hasClone(nextDesc) && Math.abs(fontSizePx(nextDesc) - api.BODY_BASE.next) < 0.5,
      fontSize: fontSizePx(nextDesc),
      expected: api.BODY_BASE.next,
    });
    reports.push({
      step: "short-later-static",
      ok: !hasClone(laterTitle) && Math.abs(fontSizePx(laterTitle) - api.TITLE_BASE.later) < 0.5,
      fontSize: fontSizePx(laterTitle),
      clone: hasClone(laterTitle),
      viewport: laterTitle.clientWidth,
      textWidth: primary(laterTitle).scrollWidth,
    });

    const beforeNow = {
      transform: trackTransform(nowTitle),
      loop: api.getLoopState(nowTitle),
      el: nowTitle,
    };
    const beforeNext = {
      transform: trackTransform(nextDesc),
      loop: api.getLoopState(nextDesc),
      el: nextDesc,
    };

    // Highlight toggle with identical NOW/NEXT text — marquees must continue.
    api.render({
      schedule: {
        now: { title: longTitle, description: "OK", time: "10:00" },
        next: { title: "Next", description: longDesc },
        later: { title: "Later", description: "Body" },
        highlightActive: true,
        currentIndex: 1,
      },
    });
    await new Promise((r) => setTimeout(r, 40));

    const afterHighlightNow = api.getLoopState(nowTitle);
    const afterHighlightNext = api.getLoopState(nextDesc);
    reports.push({
      step: "highlight-preserves-now-epoch",
      ok:
        beforeNow.el === field("now", "title") &&
        beforeNow.loop &&
        afterHighlightNow &&
        beforeNow.loop.epoch === afterHighlightNow.epoch &&
        afterHighlightNow.hasRaf === true,
      beforeEpoch: beforeNow.loop && beforeNow.loop.epoch,
      afterEpoch: afterHighlightNow && afterHighlightNow.epoch,
    });
    reports.push({
      step: "highlight-preserves-next-epoch",
      ok:
        beforeNext.el === field("next", "description") &&
        beforeNext.loop &&
        afterHighlightNext &&
        beforeNext.loop.epoch === afterHighlightNext.epoch &&
        afterHighlightNext.hasRaf === true,
      beforeEpoch: beforeNext.loop && beforeNext.loop.epoch,
      afterEpoch: afterHighlightNext && afterHighlightNext.epoch,
    });
    reports.push({
      step: "highlight-attr-set",
      ok: document.querySelector('[data-slot="later"]').getAttribute("data-highlight") === "1",
    });

    // Mid-scroll transforms should still be non-identity (or briefly at hold — either way RAF alive).
    reports.push({
      step: "highlight-keeps-raf",
      ok: api.marqueeIsActive(nowTitle) && api.marqueeIsActive(nextDesc),
    });

    api.render({
      schedule: {
        now: { title: longTitle, description: "OK", time: "10:00" },
        next: { title: "Next", description: longDesc },
        later: { title: "Later", description: "Body" },
        highlightActive: false,
        currentIndex: 1,
      },
    });
    await new Promise((r) => setTimeout(r, 40));
    reports.push({
      step: "unhighlight-preserves-epochs",
      ok:
        api.getLoopState(nowTitle).epoch === beforeNow.loop.epoch &&
        api.getLoopState(nextDesc).epoch === beforeNext.loop.epoch &&
        api.marqueeIsActive(nowTitle) &&
        api.marqueeIsActive(nextDesc),
    });

    // Multiple highlight toggles in succession.
    for (let i = 0; i < 4; i++) {
      api.render({
        schedule: {
          now: { title: longTitle, description: "OK", time: "10:00" },
          next: { title: "Next", description: longDesc },
          later: { title: "Later", description: "Body" },
          highlightActive: i % 2 === 0,
          currentIndex: 1,
        },
      });
    }
    await new Promise((r) => setTimeout(r, 40));
    reports.push({
      step: "multi-highlight-preserves-epochs",
      ok:
        api.getLoopState(nowTitle).epoch === beforeNow.loop.epoch &&
        api.getLoopState(nextDesc).epoch === beforeNext.loop.epoch,
    });

    // Highlight later while later itself marquees — only later may restart if text unchanged should preserve.
    document.querySelectorAll('[data-slot="later"] .field').forEach((el) => {
      el.style.width = "420px";
      el.style.maxWidth = "420px";
    });
    const laterLong =
      "Later event with a very long title that overflows the later column and marquees";
    api.render({
      schedule: {
        now: { title: longTitle, description: "OK", time: "10:00" },
        next: { title: "Next", description: longDesc },
        later: { title: laterLong, description: "Body" },
        highlightActive: false,
        currentIndex: 2,
      },
    });
    await new Promise((r) => setTimeout(r, api.MARQUEE_PAUSE_MS + 200));
    const laterField = field("later", "title");
    const laterEpochBefore = api.getLoopState(laterField).epoch;
    const nowEpochBeforeLaterHighlight = api.getLoopState(field("now", "title")).epoch;
    api.render({
      schedule: {
        now: { title: longTitle, description: "OK", time: "10:00" },
        next: { title: "Next", description: longDesc },
        later: { title: laterLong, description: "Body" },
        highlightActive: true,
        currentIndex: 2,
      },
    });
    await new Promise((r) => setTimeout(r, 40));
    reports.push({
      step: "highlight-self-later-preserves-marquee",
      ok:
        api.getLoopState(laterField).epoch === laterEpochBefore &&
        api.marqueeIsActive(laterField) &&
        api.getLoopState(field("now", "title")).epoch === nowEpochBeforeLaterHighlight,
      laterEpochBefore,
      laterEpochAfter: api.getLoopState(laterField).epoch,
    });

    // Unrelated text change must not restart the other field.
    const nextEpochBeforeTextChange = api.getLoopState(field("next", "description")).epoch;
    api.render({
      schedule: {
        now: { title: "NOW", description: "OK", time: "10:00" },
        next: { title: "Next", description: longDesc },
        later: { title: laterLong, description: "Body" },
        highlightActive: true,
        currentIndex: 3,
      },
    });
    await new Promise((r) => setTimeout(r, 200));
    reports.push({
      step: "one-field-text-change-preserves-other",
      ok: api.getLoopState(field("next", "description")).epoch === nextEpochBeforeTextChange,
      before: nextEpochBeforeTextChange,
      after: api.getLoopState(field("next", "description")).epoch,
    });

    // Exact fit / slight overflow using later title base size.
    const probe = field("later", "title");
    const probeText = "ExactFitFS";
    probe.style.width = "2000px";
    probe.style.maxWidth = "2000px";
    api.fitField(probe, "later", probeText, { force: true });
    await new Promise((r) => setTimeout(r, 20));
    const tw = primary(probe).scrollWidth;
    probe.style.width = tw + "px";
    probe.style.maxWidth = tw + "px";
    api.fitField(probe, "later", probeText, { force: true });
    await new Promise((r) => setTimeout(r, 20));
    reports.push({
      step: "exact-fit-static",
      ok: !hasClone(probe) && Math.abs(fontSizePx(probe) - api.TITLE_BASE.later) < 0.5,
      clone: hasClone(probe),
      fontSize: fontSizePx(probe),
    });
    probe.style.width = Math.max(40, tw - 10) + "px";
    probe.style.maxWidth = Math.max(40, tw - 10) + "px";
    api.fitField(probe, "later", probeText, { force: true });
    await new Promise((r) => setTimeout(r, 20));
    reports.push({
      step: "slight-overflow-marquees",
      ok: hasClone(probe) && Math.abs(fontSizePx(probe) - api.TITLE_BASE.later) < 0.5,
      clone: hasClone(probe),
    });

    reports.push({
      step: "clipping",
      ok: getComputedStyle(field("now", "title")).overflow === "hidden",
    });
    reports.push({
      step: "kinematics",
      ok:
        api.MARQUEE_PX_PER_SEC === 50 &&
        api.MARQUEE_EASE_SEC === 1 &&
        api.MARQUEE_PAUSE_MS === 4000,
      speed: api.MARQUEE_PX_PER_SEC,
    });

    const failed = reports.filter((entry) => !entry.ok);
    return { ok: failed.length === 0, reports, failed };
  })()\`);

  process.stdout.write(JSON.stringify(result) + "\\n");
  app.exit(result && result.ok ? 0 : 1);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
`,
  );

  try {
    const run = spawnSync(electronBinary(), [probePath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
      timeout: 90000,
    });
    const lines = String(run.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const jsonLine = [...lines].reverse().find((line) => line.startsWith("{"));
    assert.ok(
      jsonLine,
      `Electron fullscreen marquee probe produced no JSON. status=${run.status} stderr=${run.stderr} stdout=${run.stdout}`,
    );
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(run.status, 0, `electron exit ${run.status}: ${run.stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
