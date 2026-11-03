/**
 * v0.3.3 — SEMA Schedule Ticker: fixed font size + Broad Arrow–style overflow marquee.
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
const HTML_REL = "desktop/src/displays/bundled/sema-schedule-ticker-v1.html";
const PREVIOUS_V032_TICKER_HASH =
  "9a86a7fb874f4aaae16a4520c754856ec72c556b42742a32948b9168a474449e";
const PREVIOUS_V033_INTERMEDIATE_TICKER_HASH =
  "bede95a1314ba30531340e5757aa2d35da9220adb3a80ed10d171ff6c536edd6";

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

test("SEMA ticker keeps original font sizes and never shrinks", () => {
  const html = read(HTML_REL);
  assert.match(html, /var TITLE_BASE = 57/);
  assert.match(html, /var BODY_BASE = 52/);
  assert.match(html, /--title-size:\s*57px/);
  assert.match(html, /--body-size:\s*52px/);
  assert.doesNotMatch(html, /TITLE_MIN|BODY_MIN|SHRINK_STEP/);
  assert.doesNotMatch(html, /--title-min:|--body-min:/);
  assert.doesNotMatch(html, /size = Math\.max\(min,\s*size - SHRINK_STEP\)/);
  assert.doesNotMatch(html, /while \(primary\.scrollWidth > viewport/);
});

test("SEMA ticker uses Broad Arrow marquee kinematics on overflow", () => {
  const html = read(HTML_REL);
  assert.match(html, /var MARQUEE_PX_PER_SEC = 40/);
  assert.match(html, /var MARQUEE_EASE_SEC = 1/);
  assert.match(html, /var MARQUEE_PAUSE_MS = 4000/);
  assert.match(html, /var OVERFLOW_TOLERANCE_PX = 2/);
  assert.match(html, /function computeLoopKinematics/);
  assert.match(html, /function distanceAt/);
  assert.match(html, /phase = "prepause"/);
  assert.match(html, /phase = "scroll"/);
  assert.match(html, /overflowPx <= OVERFLOW_TOLERANCE_PX/);
  assert.match(html, /scheduleStableRemeasure/);
  assert.match(html, /ResizeObserver|addEventListener\("resize"/);
  assert.match(html, /highlightToggled && !contentChanged && !advanced/);
  assert.match(html, /marqueeIsActive\(field\)/);
  assert.match(html, /prev\.mode === "marquee" && marqueeIsActive\(field\)/);
});

test("title and description are fitted independently", () => {
  const html = read(HTML_REL);
  assert.match(
    html,
    /if \(titleField\) fitField\(titleField, slot, textOf\(row, "title"\), options\);\s*if \(descField\) fitField\(descField, slot, textOf\(row, "description"\), options\)/,
  );
  assert.match(html, /data-kind="title"/);
  assert.match(html, /data-kind="description"/);
});

test("SEMA ticker safe-upgrade registers prior packaged hash", () => {
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  assert.match(hydration, /SEMA_SCHEDULE_TICKER_PREVIOUS_PACKAGED_SOURCE_HASHES/);
  assert.match(hydration, new RegExp(PREVIOUS_V032_TICKER_HASH));
  assert.match(hydration, new RegExp(PREVIOUS_V033_INTERMEDIATE_TICKER_HASH));
  assert.match(hydration, /definition\.slug === "schedule-ticker"/);
  assert.match(hydration, /leaving published \$\{label\} content unchanged/);
  const current = hashRuntimeDisplayBundle(read(HTML_REL));
  assert.notEqual(current, PREVIOUS_V032_TICKER_HASH);
  assert.notEqual(current, PREVIOUS_V033_INTERMEDIATE_TICKER_HASH);
  assert.match(read(HTML_REL), /sema-ticker-v0\.3\.3-hl-stable-1/);
});

test("BrowserWindow: short text stays static; long text marquees at base font size", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-marquee-"));
  const htmlPath = path.join(tmpDir, "ticker.html");
  const probePath = path.join(tmpDir, "probe.cjs");
  fs.copyFileSync(path.join(repoRoot, HTML_REL), htmlPath);

  fs.writeFileSync(
    probePath,
    `'use strict';
const { app, BrowserWindow } = require("electron");
const path = require("path");

const htmlPath = ${JSON.stringify(htmlPath)};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await win.loadFile(htmlPath);
  await win.webContents.executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()");

  const result = await win.webContents.executeJavaScript(\`(async () => {
    const api = window.__SEMA_SCHEDULE_TICKER__;
    const reports = [];

    function field(slot, kind) {
      return document.querySelector('[data-group="' + slot + '"] [data-field="' + kind + '"]');
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

    // Constrain viewport so overflow is deterministic in the hidden window.
    document.querySelectorAll(".field").forEach((el) => {
      el.style.width = "420px";
      el.style.maxWidth = "420px";
    });

    api.render({
      schedule: {
        now: {
          title: "Short",
          description: "OK",
        },
        next: {
          title: "This is an extremely long SEMA event title that must overflow the ticker field and activate marquee",
          description: "Short desc",
        },
        later: {
          title: "Later short",
          description: "This is an extremely long SEMA event description that must overflow independently of the title field width",
        },
        currentIndex: 1,
      },
    });

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));

    const nowTitle = field("now", "title");
    const nowDesc = field("now", "description");
    const nextTitle = field("next", "title");
    const nextDesc = field("next", "description");
    const laterTitle = field("later", "title");
    const laterDesc = field("later", "description");

    reports.push({
      step: "short-title-static",
      ok: !hasClone(nowTitle) && Math.abs(fontSizePx(nowTitle) - api.TITLE_BASE) < 0.5,
      fontSize: fontSizePx(nowTitle),
      clone: hasClone(nowTitle),
    });
    reports.push({
      step: "short-desc-static",
      ok: !hasClone(nowDesc) && Math.abs(fontSizePx(nowDesc) - api.BODY_BASE) < 0.5,
      fontSize: fontSizePx(nowDesc),
      clone: hasClone(nowDesc),
    });
    reports.push({
      step: "long-title-marquees",
      ok: hasClone(nextTitle) && Math.abs(fontSizePx(nextTitle) - api.TITLE_BASE) < 0.5,
      fontSize: fontSizePx(nextTitle),
      clone: hasClone(nextTitle),
      textWidth: primary(nextTitle).scrollWidth,
      viewport: nextTitle.clientWidth,
    });
    reports.push({
      step: "paired-short-desc-static",
      ok: !hasClone(nextDesc) && Math.abs(fontSizePx(nextDesc) - api.BODY_BASE) < 0.5,
      fontSize: fontSizePx(nextDesc),
      clone: hasClone(nextDesc),
    });
    reports.push({
      step: "long-desc-marquees",
      ok: hasClone(laterDesc) && Math.abs(fontSizePx(laterDesc) - api.BODY_BASE) < 0.5,
      fontSize: fontSizePx(laterDesc),
      clone: hasClone(laterDesc),
    });
    reports.push({
      step: "paired-short-title-static",
      ok: !hasClone(laterTitle) && Math.abs(fontSizePx(laterTitle) - api.TITLE_BASE) < 0.5,
      fontSize: fontSizePx(laterTitle),
      clone: hasClone(laterTitle),
    });

    // Exact-fit / slight overflow gate around tolerance.
    const exact = field("now", "title");
    const exactText = "ExactFitToken";
    exact.style.width = "2000px";
    exact.style.maxWidth = "2000px";
    api.fitField(exact, "now", exactText);
    await new Promise((r) => setTimeout(r, 20));
    const exactTextWidth = primary(exact).scrollWidth;
    exact.style.width = exactTextWidth + "px";
    exact.style.maxWidth = exactTextWidth + "px";
    api.fitField(exact, "now", exactText);
    await new Promise((r) => setTimeout(r, 20));
    reports.push({
      step: "exact-fit-no-marquee",
      ok: !hasClone(exact) && Math.abs(fontSizePx(exact) - api.TITLE_BASE) < 0.5,
      clone: hasClone(exact),
      textWidth: primary(exact).scrollWidth,
      viewport: exact.clientWidth,
    });

    exact.style.width = Math.max(40, exactTextWidth - 8) + "px";
    exact.style.maxWidth = Math.max(40, exactTextWidth - 8) + "px";
    api.fitField(exact, "now", exactText);
    await new Promise((r) => setTimeout(r, 20));
    reports.push({
      step: "slight-overflow-marquees",
      ok: hasClone(exact) && Math.abs(fontSizePx(exact) - api.TITLE_BASE) < 0.5,
      clone: hasClone(exact),
      textWidth: primary(exact).scrollWidth,
      viewport: exact.clientWidth,
      fontSize: fontSizePx(exact),
    });

    // Clipping: field overflow hidden, track must not paint outside without clip.
    const clip = getComputedStyle(nextTitle).overflow;
    reports.push({
      step: "clipping-area",
      ok: clip === "hidden",
      overflow: clip,
    });

    // Motion contract exposed for ease + pause.
    reports.push({
      step: "kinematics-contract",
      ok:
        api.MARQUEE_PX_PER_SEC === 40 &&
        api.MARQUEE_EASE_SEC === 1 &&
        api.MARQUEE_PAUSE_MS === 4000 &&
        api.OVERFLOW_TOLERANCE_PX === 2,
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
      timeout: 45000,
    });
    const lines = String(run.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const jsonLine = [...lines].reverse().find((line) => line.startsWith("{"));
    assert.ok(
      jsonLine,
      `Electron marquee probe produced no JSON. status=${run.status} stderr=${run.stderr} stdout=${run.stdout}`,
    );
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(run.status, 0, `electron exit ${run.status}: ${run.stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("BrowserWindow: production render() highlight toggles do not restart unrelated marquees", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-ticker-hl-"));
  const htmlPath = path.join(tmpDir, "ticker.html");
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
    width: 1280,
    height: 400,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await win.loadFile(htmlPath);
  await win.webContents.executeJavaScript(
    "document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()",
  );

  const result = await win.webContents.executeJavaScript(\`(async () => {
    const api = window.__SEMA_SCHEDULE_TICKER__;
    const reports = [];
    function field(slot, kind) {
      return document.querySelector('[data-group="' + slot + '"] [data-field="' + kind + '"]');
    }
    function trackTransform(el) {
      const track = el.querySelector(".field-track");
      return track ? track.style.transform : "";
    }
    function parseTx(transform) {
      const raw = String(transform || "");
      const start = raw.indexOf("translate3d(");
      if (start < 0) return 0;
      const after = raw.slice(start + "translate3d(".length);
      const end = after.indexOf("px");
      if (end < 0) return 0;
      return Number(after.slice(0, end)) || 0;
    }

    document.querySelectorAll(".field").forEach((el) => {
      el.style.width = "420px";
      el.style.maxWidth = "420px";
    });

    const longTitle =
      "This is an extremely long SEMA event title that must overflow the ticker field and activate marquee";
    const longDesc =
      "This is an extremely long SEMA event description that must overflow independently of the title field width";

    // Mirrors buildSemaDisplaySchedule: highlight replaces LATER title/description only.
    const scheduledLater = { title: "Later short", description: longDesc };
    const highlightLater = {
      title: "Highlight event with a different long title that also overflows the ticker",
      description:
        "Highlight description copy that also overflows and is distinct from the scheduled later text",
    };
    const payload = (highlightActive, laterOverride) => ({
      schedule: {
        now: { title: "Short", description: "OK" },
        next: { title: longTitle, description: "Short desc" },
        later: laterOverride || (highlightActive ? highlightLater : scheduledLater),
        highlightActive: highlightActive === true,
        currentRowId: "sel-1",
        currentIndex: 1,
      },
    });

    // Production path: NEUDDisplay.subscribe → render(payload)
    api.render(payload(false));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));
    // Enter mid-scroll past the 4s start hold.
    await new Promise((r) => setTimeout(r, api.MARQUEE_PAUSE_MS + 350));

    const nextTitle = field("next", "title");
    const laterDesc = field("later", "description");
    const before = {
      nextEl: nextTitle,
      laterEl: laterDesc,
      nextLoop: api.getLoopState(nextTitle),
      laterLoop: api.getLoopState(laterDesc),
      nextTx: trackTransform(nextTitle),
      laterTx: trackTransform(laterDesc),
    };

    reports.push({
      step: "preconditions-mid-scroll",
      ok:
        before.nextLoop &&
        before.laterLoop &&
        before.nextLoop.mode === "marquee" &&
        before.laterLoop.mode === "marquee" &&
        before.nextLoop.phase === "scroll" &&
        before.laterLoop.phase === "scroll" &&
        before.nextLoop.hasRaf &&
        before.laterLoop.hasRaf,
      next: before.nextLoop,
      later: before.laterLoop,
      nextTx: before.nextTx,
      laterTx: before.laterTx,
    });

    // Chrome-only highlight (identical later text) — every marquee must continue.
    api.render(payload(true, scheduledLater));
    await new Promise((r) => setTimeout(r, 50));

    const afterChrome = {
      nextEl: field("next", "title"),
      laterEl: field("later", "description"),
      nextLoop: api.getLoopState(field("next", "title")),
      laterLoop: api.getLoopState(field("later", "description")),
      nextTx: trackTransform(field("next", "title")),
      laterTx: trackTransform(field("later", "description")),
    };

    reports.push({
      step: "chrome-highlight-dom-identity",
      ok: before.nextEl === afterChrome.nextEl && before.laterEl === afterChrome.laterEl,
    });
    reports.push({
      step: "chrome-highlight-epochs-preserved",
      ok:
        afterChrome.nextLoop.epoch === before.nextLoop.epoch &&
        afterChrome.laterLoop.epoch === before.laterLoop.epoch &&
        afterChrome.nextLoop.hasRaf &&
        afterChrome.laterLoop.hasRaf,
      beforeNextEpoch: before.nextLoop.epoch,
      afterNextEpoch: afterChrome.nextLoop.epoch,
      beforeLaterEpoch: before.laterLoop.epoch,
      afterLaterEpoch: afterChrome.laterLoop.epoch,
    });
    reports.push({
      step: "highlight-attr",
      ok: document.querySelector('[data-slot="later"]').getAttribute("data-highlight") === "1",
    });

    // Continuity: transforms must keep progressing (not reset to 0 / restart hold).
    await new Promise((r) => setTimeout(r, 120));
    const progressed = {
      nextTx: trackTransform(field("next", "title")),
      laterTx: trackTransform(field("later", "description")),
      nextLoop: api.getLoopState(field("next", "title")),
      laterLoop: api.getLoopState(field("later", "description")),
    };
    const nextMoved =
      Math.abs(parseTx(progressed.nextTx) - parseTx(afterChrome.nextTx)) > 0.5 ||
      progressed.nextLoop.startedAt !== afterChrome.nextLoop.startedAt;
    const laterMoved =
      Math.abs(parseTx(progressed.laterTx) - parseTx(afterChrome.laterTx)) > 0.5 ||
      progressed.laterLoop.startedAt !== afterChrome.laterLoop.startedAt;
    reports.push({
      step: "chrome-highlight-animation-progresses",
      ok:
        progressed.nextLoop.epoch === before.nextLoop.epoch &&
        progressed.laterLoop.epoch === before.laterLoop.epoch &&
        nextMoved &&
        laterMoved &&
        progressed.nextLoop.phase === "scroll" &&
        progressed.laterLoop.phase === "scroll",
      nextTxBefore: afterChrome.nextTx,
      nextTxAfter: progressed.nextTx,
      laterTxBefore: afterChrome.laterTx,
      laterTxAfter: progressed.laterTx,
    });

    // Production highlight: later text is replaced — NOW/NEXT must still continue
    // after later's exit/enter advance + remasureAllFields({force:false}).
    const nextEpochBeforeSwap = api.getLoopState(field("next", "title")).epoch;
    const nextTxBeforeSwap = trackTransform(field("next", "title"));
    api.render(payload(true)); // later → highlightLater
    // EXIT_MS(360) + later stagger(320) + remasure rAF budget.
    await new Promise((r) => setTimeout(r, 900));
    const afterSwap = {
      nextLoop: api.getLoopState(field("next", "title")),
      nextTx: trackTransform(field("next", "title")),
    };
    reports.push({
      step: "later-swap-preserves-next-epoch",
      ok:
        afterSwap.nextLoop.epoch === nextEpochBeforeSwap &&
        afterSwap.nextLoop.hasRaf &&
        (afterSwap.nextLoop.phase === "scroll" || afterSwap.nextLoop.phase === "prepause"),
      before: nextEpochBeforeSwap,
      after: afterSwap.nextLoop.epoch,
      phase: afterSwap.nextLoop.phase,
    });
    await new Promise((r) => setTimeout(r, 150));
    const nextTxAfterSwapProgress = trackTransform(field("next", "title"));
    const nextLoopAfterSwapProgress = api.getLoopState(field("next", "title"));
    reports.push({
      step: "later-swap-next-keeps-progressing",
      ok:
        nextLoopAfterSwapProgress.epoch === nextEpochBeforeSwap &&
        nextLoopAfterSwapProgress.hasRaf &&
        (Math.abs(parseTx(nextTxAfterSwapProgress) - parseTx(nextTxBeforeSwap)) > 0.5 ||
          Math.abs(parseTx(nextTxAfterSwapProgress) - parseTx(afterSwap.nextTx)) > 0.5 ||
          nextLoopAfterSwapProgress.startedAt !== afterSwap.nextLoop.startedAt),
      beforeTx: nextTxBeforeSwap,
      midTx: afterSwap.nextTx,
      afterTx: nextTxAfterSwapProgress,
    });

    // Remove highlight (later restores scheduled text) — next still uninterrupted.
    api.render(payload(false));
    await new Promise((r) => setTimeout(r, 900));
    reports.push({
      step: "highlight-off-preserves-next",
      ok:
        api.getLoopState(field("next", "title")).epoch === nextEpochBeforeSwap &&
        api.getLoopState(field("next", "title")).hasRaf,
      before: nextEpochBeforeSwap,
      after: api.getLoopState(field("next", "title")).epoch,
    });

    // Re-establish both marquees mid-scroll, then rapid chrome toggles.
    api.render(payload(false));
    await new Promise((r) => setTimeout(r, api.MARQUEE_PAUSE_MS + 300));
    const rapidBefore = {
      next: api.getLoopState(field("next", "title")).epoch,
      later: api.getLoopState(field("later", "description")).epoch,
    };
    for (let i = 0; i < 6; i++) {
      api.render(payload(i % 2 === 0, scheduledLater));
    }
    await new Promise((r) => setTimeout(r, 40));
    reports.push({
      step: "rapid-chrome-highlight-epochs-preserved",
      ok:
        api.getLoopState(field("next", "title")).epoch === rapidBefore.next &&
        api.getLoopState(field("later", "description")).epoch === rapidBefore.later,
    });

    // Unrelated later text change must restart later only.
    const nextEpochBeforeLaterEdit = api.getLoopState(field("next", "title")).epoch;
    const laterEpochBeforeEdit = api.getLoopState(field("later", "description")).epoch;
    api.render({
      schedule: {
        now: { title: "Short", description: "OK" },
        next: { title: longTitle, description: "Short desc" },
        later: {
          title: "Later short",
          description:
            longDesc + " and then more unique later copy that forces a later-only restart",
        },
        highlightActive: false,
        currentRowId: "sel-1",
        currentIndex: 1,
      },
    });
    await new Promise((r) => setTimeout(r, 250));
    reports.push({
      step: "unrelated-later-edit-preserves-next",
      ok: api.getLoopState(field("next", "title")).epoch === nextEpochBeforeLaterEdit,
      before: nextEpochBeforeLaterEdit,
      after: api.getLoopState(field("next", "title")).epoch,
      laterEpoch: api.getLoopState(field("later", "description")).epoch,
    });
    reports.push({
      step: "later-edit-restarts-later",
      ok: api.getLoopState(field("later", "description")).epoch !== laterEpochBeforeEdit,
      before: laterEpochBeforeEdit,
      after: api.getLoopState(field("later", "description")).epoch,
    });

    // Identical poll payload must not restart.
    const nextEpochBeforePoll = api.getLoopState(field("next", "title")).epoch;
    const laterEpochBeforePoll = api.getLoopState(field("later", "description")).epoch;
    api.render({
      schedule: {
        now: { title: "Short", description: "OK" },
        next: { title: longTitle, description: "Short desc" },
        later: {
          title: "Later short",
          description:
            longDesc + " and then more unique later copy that forces a later-only restart",
        },
        highlightActive: false,
        currentRowId: "sel-1",
        currentIndex: 1,
      },
    });
    await new Promise((r) => setTimeout(r, 40));
    reports.push({
      step: "identical-poll-preserves-epochs",
      ok:
        api.getLoopState(field("next", "title")).epoch === nextEpochBeforePoll &&
        api.getLoopState(field("later", "description")).epoch === laterEpochBeforePoll,
    });

    // No duplicate marquee tracks (one gap + one clone max per overflowing field).
    const nextClones = field("next", "title").querySelectorAll('[data-clone="1"]').length;
    const laterClones = field("later", "description").querySelectorAll('[data-clone="1"]').length;
    reports.push({
      step: "no-duplicate-tracks",
      ok: nextClones === 1 && laterClones === 1,
      nextClones,
      laterClones,
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
      `Electron highlight continuity probe produced no JSON. status=${run.status} stderr=${run.stderr} stdout=${run.stdout}`,
    );
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(run.status, 0, `electron exit ${run.status}: ${run.stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
