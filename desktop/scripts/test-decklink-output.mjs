import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MemoryOutputRouteStore,
  OutputEngine,
  mapComputerDisplays,
} from "../src/output/output-engine-core.ts";
import {
  compositeFillOverBlack,
  fitContainRect,
  formatDefaultOutputName,
  formatDisplayOnlyFps,
  formatOutputStartedAt,
  formatRationalFrameRate,
  normalizePaintBufferToBgra,
  sortDeckLinkModes,
} from "../src/output/decklink-model.ts";
import { DeckLinkOutputService, ScriptedFrameRenderer } from "../src/output/decklink-output-service.ts";
import { LIVE_ROUTING_EDIT_BLOCKED } from "../src/output/output-engine-core.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const mode5994 = {
  id: "1080p5994",
  name: "1080p59.94",
  width: 1920,
  height: 1080,
  frameRateNumerator: 60000,
  frameRateDenominator: 1001,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
};
const mode25 = {
  id: "1080p25",
  name: "1080p25",
  width: 1920,
  height: 1080,
  frameRateNumerator: 25,
  frameRateDenominator: 1,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
};

function duoEndpoints() {
  return [0, 1, 2, 3].map((endpointIndex) => ({
    persistentId: "duo-persistent",
    modelName: "DeckLink Duo 2",
    endpointName: `Output ${endpointIndex + 1}`,
    endpointIndex,
    available: true,
    modes: [mode5994, mode25],
  }));
}

function graphic() {
  return {
    projectId: "project-1",
    projectName: "Auction",
    displayId: "display-1",
    displayName: "Stream Bid",
    slug: "stream-bid-display",
    width: 1920,
    height: 1080,
    enabled: true,
    publishedRevisionId: "rev-1",
  };
}

function displaySource() {
  return {
    id: 2,
    label: "External",
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 40, width: 1920, height: 1040 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    rotation: 0,
    internal: false,
  };
}

function harness(endpoints, options = {}) {
  const renderer = new ScriptedFrameRenderer();
  renderer.holdFirstFrame = options.holdFirstFrame === true;
  const decklink = new DeckLinkOutputService(renderer, options.decklinkOptions);
  decklink.setEndpoints(endpoints);
  const opened = [];
  const engine = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: {
      async open(input) {
        opened.push(input);
        return { ok: true };
      },
      close() {},
    },
    discoverDevices: () => mapComputerDisplays([displaySource()], 9),
    resolveDisplay: () => graphic(),
    origin: () => "http://127.0.0.1:3000",
    decklink,
  });
  return { engine, decklink, renderer, opened };
}

test("decklink adapter registers beside computer displays", () => {
  const { engine } = harness(duoEndpoints());
  const devices = engine.discoverDevices();
  assert.equal(devices.filter((device) => device.adapterType === "display").length, 1);
  assert.equal(devices.filter((device) => device.adapterType === "decklink").length, 4);
});

test("sdk unavailable reports no decklink devices", () => {
  const { engine } = harness(duoEndpoints(), {
    decklinkOptions: { sdkAvailable: false, reason: "Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD." },
  });
  assert.equal(engine.decklinkAvailability().sdkAvailable, false);
  assert.match(engine.decklinkAvailability().reason, /Desktop Video/);
  assert.equal(engine.discoverDevices().some((device) => device.adapterType === "decklink"), false);
});

test("no devices leaves computer displays available", () => {
  const { engine } = harness([]);
  assert.equal(engine.decklinkAvailability().sdkAvailable, true);
  assert.equal(engine.discoverDevices().filter((device) => device.adapterType === "decklink").length, 0);
  assert.equal(engine.discoverDevices().some((device) => device.adapterType === "display"), true);
});

test("one device and multi-channel discovery keep endpoints separate", () => {
  const { engine } = harness(duoEndpoints().slice(0, 1));
  assert.equal(engine.discoverDevices().filter((device) => device.adapterType === "decklink").length, 1);
  const multi = harness(duoEndpoints());
  const names = multi.engine.discoverDevices().filter((device) => device.adapterType === "decklink").map((device) => device.name);
  assert.deepEqual(names, [
    "DeckLink Duo 2 Port 1",
    "DeckLink Duo 2 Port 2",
    "DeckLink Duo 2 Port 3",
    "DeckLink Duo 2 Port 4",
  ]);
});

test("persistent endpoint identity survives enumeration order", () => {
  const reversed = [...duoEndpoints()].reverse();
  const { engine } = harness(reversed);
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:2",
    displayModeId: "1080p5994",
  });
  assert.equal(route.adapterType, "decklink");
  assert.equal(route.configuration.decklink.outputEndpointId, "decklink:duo-persistent:2");
  assert.equal(engine.list()[0].deviceName, "DeckLink Duo 2 Port 3");
});

test("video modes preserve rational frame rates", () => {
  const { engine } = harness(duoEndpoints());
  const endpoint = engine.discoverDevices().find((device) => device.id === "decklink:duo-persistent:0");
  const mode5994Sorted = endpoint.capabilities.modes.find((mode) => mode.id === "1080p5994");
  assert.ok(mode5994Sorted);
  assert.equal(mode5994Sorted.frameRateNumerator, 60000);
  assert.equal(mode5994Sorted.frameRateDenominator, 1001);
  assert.equal(formatRationalFrameRate(60000, 1001), "60000/1001");
  assert.notEqual(mode5994Sorted.frameRateNumerator / mode5994Sorted.frameRateDenominator, 60);
  // Sort places lower frame rates first; exact rationals stay on each mode object.
  assert.equal(endpoint.capabilities.modes[0].id, "1080p25");
  assert.equal(endpoint.capabilities.modes[1].id, "1080p5994");
});

test("decklink route configuration persists in the route store", () => {
  const { engine } = harness(duoEndpoints());
  const saved = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  assert.equal(saved.configuration.decklink.pixelFormat, "bgra8");
  assert.equal(saved.configuration.decklink.fillBackground, "#000000");
  assert.equal(saved.configuration.decklink.displayModeId, "1080p5994");
  assert.equal(saved.session.status, "stopped");
});

test("start validates device and mode before going live", async () => {
  const { engine, opened } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:missing",
    displayModeId: "1080p5994",
  });
  const missing = await engine.start(route.id);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /External device unavailable/);
  const real = engine.create({
    name: "Program 2",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "not-a-mode",
  });
  const mode = await engine.start(real.id);
  assert.equal(mode.ok, false);
  assert.match(mode.error, /Configured video mode is no longer available/);
  assert.equal(opened.length, 0);
});

test("start prerolls and begins scheduled playback only after the first frame", async () => {
  const { engine, decklink, renderer } = harness(duoEndpoints(), { holdFirstFrame: true });
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  const pending = engine.start(route.id);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(engine.list().find((entry) => entry.id === route.id).session.status, "starting");
  assert.equal(decklink.playbackStartedFor.includes(route.id), false);
  assert.match(renderer.opened[0].url, /surface=decklink/);
  assert.doesNotMatch(renderer.opened[0].url, /surface=computer/);
  renderer.releaseFirstFrame(route.id);
  const started = await pending;
  assert.equal(started.ok, true);
  assert.equal(started.route.session.status, "live");
  const metrics = decklink.metrics(route.id);
  assert.equal(metrics.scheduledFrames, 3);
  assert.equal(metrics.playbackStarted, true);
  assert.equal(metrics.outputEnabled, true);
  assert.equal(metrics.frameRateNumerator, 60000);
  assert.equal(metrics.frameRateDenominator, 1001);
});

test("completed callbacks reuse the latest frame until the graphic changes", async () => {
  const { engine, decklink } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  const before = decklink.metrics(route.id).scheduledFrames;
  decklink.completeScheduledFrame(route.id, "completed");
  const reused = decklink.metrics(route.id);
  assert.equal(reused.completedFrames, 1);
  assert.equal(reused.scheduledFrames, before + 1);
  assert.ok(reused.reusedFrames > 0);
  assert.equal(reused.lastScheduledRevision, 1);
  decklink.publishGraphic(route.id, 2);
  decklink.completeScheduledFrame(route.id, "completed");
  assert.equal(decklink.metrics(route.id).lastScheduledRevision, 2);
  assert.equal(decklink.metrics(route.id).rendererRevision, 2);
});

test("stop disables output and closes the renderer", async () => {
  const { engine, decklink, renderer } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  engine.stop(route.id);
  assert.equal(engine.list()[0].session.status, "stopped");
  assert.equal(decklink.metrics(route.id), null);
  assert.ok(decklink.stoppedPlayback.includes(route.id));
  assert.ok(decklink.disabledEndpoints.includes("decklink:duo-persistent:0"));
  assert.ok(renderer.closed.includes(route.id));
});

test("device loss preserves the route and releases playback", async () => {
  const { engine, decklink, renderer } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:1",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  decklink.setEndpoints(duoEndpoints().filter((endpoint) => endpoint.endpointIndex !== 1));
  decklink.loseDevice("decklink:duo-persistent:1");
  const view = engine.list().find((entry) => entry.id === route.id);
  assert.equal(view.session.status, "device-unavailable");
  assert.match(view.session.lastError, /Device removed/);
  assert.equal(view.configuration.decklink.displayModeId, "1080p5994");
  assert.ok(renderer.closed.includes(route.id));
  const restart = await engine.start(route.id);
  assert.equal(restart.ok, false);
  assert.match(restart.error, /External device unavailable/);
});

test("two live routes cannot share one decklink endpoint", async () => {
  const { engine } = harness(duoEndpoints());
  const first = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  const second = engine.create({
    name: "Preview",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p25",
  });
  assert.equal((await engine.start(first.id)).ok, true);
  const busy = await engine.start(second.id);
  assert.equal(busy.ok, false);
  assert.match(busy.error, /DeckLink Duo 2 Port 1 is already in use by Program/);
});

test("stopAll covers decklink sessions for shutdown and sign-out", async () => {
  const { engine, renderer } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  engine.stopAll();
  assert.equal(engine.list()[0].session.status, "stopped");
  assert.ok(renderer.closed.includes(route.id));
  const main = fs.readFileSync(path.join(repoRoot, "desktop/src/main.ts"), "utf8");
  assert.match(main, /outputEngine\?\.stopAll\(\)/);
});

test("diagnostics include fill state without credentials", async () => {
  const { engine } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  engine.note = "secret";
  const entry = engine.diagnostics().find((item) => item.routeId === route.id);
  assert.equal(entry.decklink.pixelFormat, "bgra8");
  assert.equal(entry.decklink.displayModeId, "1080p5994");
  assert.equal(entry.decklink.scheduledFrames, 3);
  assert.equal(entry.renderUrl.includes("surface=decklink"), true);
  assert.equal(JSON.stringify(entry).includes("service_role"), false);
});

test("computer display output and mac presentation helper stay separate", async () => {
  const { engine, opened, decklink } = harness(duoEndpoints());
  const monitors = engine.discoverDevices().filter((device) => device.adapterType === "display");
  const route = engine.create({
    name: "Monitor",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: monitors[0].id,
  });
  const started = await engine.start(route.id);
  assert.equal(started.ok, true);
  assert.equal(route.adapterType, "display");
  assert.equal(opened.length, 1);
  assert.match(opened[0].url, /surface=computer/);
  assert.equal(decklink.playbackStartedFor.length, 0);
  const mac = fs.readFileSync(path.join(repoRoot, "desktop/native/mac-output/mac-output.mm"), "utf8");
  const deck = fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/decklink-sdk.cc"), "utf8");
  assert.doesNotMatch(mac, /DeckLink/);
  assert.match(deck, /ScheduleVideoFrame/);
  assert.match(deck, /StartScheduledPlayback/);
  assert.match(deck, /ScheduledFrameCompleted/);
  assert.doesNotMatch(deck, /1080p59\.94/);
  const winBuild = fs.readFileSync(path.join(repoRoot, "desktop/scripts/build-decklink-addon.mjs"), "utf8");
  assert.match(winBuild, /process\.platform === "darwin" \? "arm64" : "x64"/);
  assert.match(winBuild, /stageDeckLinkInclude/);
  assert.match(winBuild, /NEUD_DECKLINK_SDK=\$\{hasSdk \? "1" : "0"\}/);
  assert.match(winBuild, /isRealDeckLinkAddonBinary/);
  assert.match(winBuild, /Preserving existing real addon/);
  const macBuild = fs.readFileSync(path.join(repoRoot, "desktop/scripts/build-mac-output-addon.mjs"), "utf8");
  assert.match(macBuild, /process\.platform !== "darwin"/);
});

test("sdk 16 mac string and video-buffer contracts", () => {
  const deck = fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/decklink-sdk.cc"), "utf8");
  assert.match(deck, /GetModelName\(&cfName\)/);
  assert.match(deck, /TakeCfString\(cfName\)/);
  assert.match(deck, /DisplayModeName\(/);
  assert.match(deck, /IID_IDeckLinkVideoBuffer/);
  assert.match(deck, /StartAccess\(bmdBufferAccessWrite\)/);
  assert.match(deck, /buffer->GetBytes\(&bytes\)/);
  assert.match(deck, /EndAccess\(bmdBufferAccessWrite\)/);
  assert.match(deck, /NEUD_IID_IUNKNOWN/);
  assert.match(deck, /CFUUIDGetUUIDBytes\(IUnknownUUID\)/);
  assert.match(deck, /operator==\(const REFIID&/);
  assert.match(deck, /FitCompositeFill/);
  assert.match(deck, /GetRowBytes\(\)/);
  assert.match(deck, /RowBytesForPixelFormat/);
  assert.match(deck, /DoesSupportVideoMode/);
  assert.match(deck, /bmdFormat8BitBGRA/);
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/src/output/decklink-model.ts"), "utf8"),
    /Configured video mode is no longer available/,
  );
  assert.match(deck, /frameDuration/);
  assert.match(deck, /frameTimescale/);
  assert.match(deck, /StartScheduledPlayback\(0, gTimeScale, 1\.0\)/);
  assert.doesNotMatch(deck, /setInterval/);
  assert.doesNotMatch(deck, /completedFrame->GetBytes/);
  assert.doesNotMatch(deck, /frame->GetBytes\(/);
  assert.match(deck, /BLACKMAGIC_DECKLINK_API_VERSION_STRING/);
  assert.match(deck, /getAdapterInfo|DeckLinkAdapterInfoJson/);
  const binding = fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/binding.gyp"), "utf8");
  assert.match(binding, /DeckLinkAPIDispatch\.cpp/);
  assert.match(binding, /CoreFoundation/);
  const stub = fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/decklink-stub.cc"), "utf8");
  assert.match(stub, /stub\\":true/);
});

test("exact 1080p59.94 rational timing is preserved for display and scheduling identity", async () => {
  const { engine } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  assert.equal(route.configuration.decklink.modeName, "1080p59.94");
  assert.equal(route.configuration.decklink.frameRateNumerator, 60000);
  assert.equal(route.configuration.decklink.frameRateDenominator, 1001);
  assert.equal(formatRationalFrameRate(60000, 1001), "60000/1001");
  assert.equal(formatDisplayOnlyFps(60000, 1001), "59.94");
  assert.notEqual(formatDisplayOnlyFps(60000, 1001), "60");
  await engine.start(route.id);
  const metrics = engine.list()[0].decklink;
  assert.equal(metrics.frameTimescale, 60000);
  assert.equal(metrics.frameDuration, 1001);
  assert.equal(metrics.computedFpsForDisplayOnly, "59.94");
  assert.equal(metrics.displayModeName, "1080p59.94");
});

test("paint buffer channel order normalizes to BGRA for DeckLink", () => {
  const rgbaRed = Buffer.from([255, 0, 0, 255]);
  const bgra = normalizePaintBufferToBgra(rgbaRed, "rgba");
  assert.deepEqual([...bgra], [0, 0, 255, 255]);
  const alreadyBgra = normalizePaintBufferToBgra(Buffer.from([0, 0, 255, 255]), "bgra");
  assert.deepEqual([...alreadyBgra], [0, 0, 255, 255]);
});

test("sdk include paths with spaces stage to a space-free symlink", async () => {
  const { resolveDeckLinkIncludeDir, stageDeckLinkInclude } = await import("./build-decklink-addon.mjs");
  const spacedRoot = path.join(os.tmpdir(), "Blackmagic DeckLink SDK 16.0");
  const spacedInclude = path.join(spacedRoot, "Mac", "include");
  fs.mkdirSync(spacedInclude, { recursive: true });
  fs.writeFileSync(path.join(spacedInclude, "DeckLinkAPI.h"), "// test header\n");
  const resolved = resolveDeckLinkIncludeDir(spacedRoot);
  assert.equal(resolved, spacedInclude);
  const stageDir = path.join(os.tmpdir(), `neud-decklink-stage-${Date.now()}`);
  const staged = stageDeckLinkInclude(resolved, stageDir);
  assert.ok(staged);
  assert.doesNotMatch(staged, / /);
  assert.ok(fs.existsSync(path.join(staged, "DeckLinkAPI.h")));
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.rmSync(spacedRoot, { recursive: true, force: true });
});

test("fill composite keeps opaque white and turns transparency black", () => {
  const white = compositeFillOverBlack(Uint8Array.from([255, 255, 255, 255]));
  assert.deepEqual([...white], [255, 255, 255, 255]);
  const clear = compositeFillOverBlack(Uint8Array.from([10, 20, 30, 0]));
  assert.deepEqual([...clear], [0, 0, 0, 255]);
  // Premultiplied 50% white must not be darkened to ~64 (old double-premul bug).
  const half = compositeFillOverBlack(Uint8Array.from([128, 128, 128, 128]));
  assert.deepEqual([...half], [128, 128, 128, 255]);
  const fitted = fitContainRect(1280, 720, 1920, 1080);
  assert.equal(fitted.width, 1920);
  assert.equal(fitted.height, 1080);
  const letterbox = fitContainRect(1920, 1080, 1280, 720);
  assert.ok(letterbox.width <= 1280);
  assert.ok(letterbox.height <= 720);
  assert.equal(fitContainRect(1920, 1080, 1920, 1080).x, 0);
});

test("underrun is recorded without dropping the route", async () => {
  const { engine, decklink } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  decklink.noteUnderrun(route.id);
  assert.equal(decklink.metrics(route.id).underruns, 1);
  assert.equal(engine.list()[0].session.status, "live");
});

test("preroll schedule path assigns output before ScheduleVideoFrame and keeps mode raster", () => {
  const deck = fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/decklink-sdk.cc"), "utf8");
  assert.match(deck, /gOutput = output;/);
  assert.match(deck, /ScheduleFilledFrame\(output, frame, index\)/);
  assert.match(deck, /gModeWidth/);
  assert.match(deck, /gRendererWidth/);
  assert.match(deck, /FitCompositeFill/);
  assert.match(deck, /hresultHex/);
  assert.match(deck, /E_INVALIDARG/);
  assert.match(deck, /E_ACCESSDENIED/);
  assert.match(deck, /E_OUTOFMEMORY/);
  assert.match(deck, /prerollDisplayTimes/);
  assert.match(deck, /bufferAccessEnded/);
  assert.match(deck, /gOwnedFrames/);
  assert.match(deck, /EndAccess\(bmdBufferAccessWrite\)/);
  assert.match(deck, /CreateVideoFrame\(gModeWidth, gModeHeight, gRowBytes, bmdFormat8BitBGRA/);
  assert.match(deck, /validateFrameForMode|DeckLinkValidateFrameForModeJson/);
  // pushFrame must not overwrite mode dimensions used by CreateVideoFrame
  assert.doesNotMatch(deck, /gModeWidth = width;/);
  assert.match(deck, /gRendererWidth = width;/);
});

test("exact 720p59.94 preroll timestamps are 0\/1001\/2002 with duration 1001 timescale 60000", () => {
  const duration = 1001;
  const timescale = 60000;
  const times = [0, 1, 2].map((index) => index * duration);
  assert.deepEqual(times, [0, 1001, 2002]);
  assert.equal(timescale, 60000);
  assert.equal(formatDisplayOnlyFps(timescale, duration), "59.94");
  assert.equal(formatRationalFrameRate(timescale, duration), "60000/1001");
});

test("sd modes keep sdk raster and interlaced flags for sorting", () => {
  const modes = sortDeckLinkModes([
    {
      id: "1080p60",
      name: "1080p60",
      width: 1920,
      height: 1080,
      frameRateNumerator: 60000,
      frameRateDenominator: 1000,
      interlaced: false,
      fieldDominance: "progressive",
      pixelFormats: ["bgra8"],
    },
    {
      id: "525i",
      name: "525i59.94 NTSC",
      width: 720,
      height: 486,
      frameRateNumerator: 30000,
      frameRateDenominator: 1001,
      interlaced: true,
      fieldDominance: "lower",
      pixelFormats: ["bgra8"],
    },
    {
      id: "1080i5994",
      name: "1080i59.94",
      width: 1920,
      height: 1080,
      frameRateNumerator: 30000,
      frameRateDenominator: 1001,
      interlaced: true,
      fieldDominance: "upper",
      pixelFormats: ["bgra8"],
    },
    {
      id: "1080p30",
      name: "1080p30",
      width: 1920,
      height: 1080,
      frameRateNumerator: 30000,
      frameRateDenominator: 1000,
      interlaced: false,
      fieldDominance: "progressive",
      pixelFormats: ["bgra8"],
    },
    {
      id: "625i",
      name: "625i50 PAL",
      width: 720,
      height: 576,
      frameRateNumerator: 25000,
      frameRateDenominator: 1000,
      interlaced: true,
      fieldDominance: "upper",
      pixelFormats: ["bgra8"],
    },
  ]);
  assert.deepEqual(
    modes.map((mode) => mode.name),
    ["525i59.94 NTSC", "625i50 PAL", "1080i59.94", "1080p30", "1080p60"],
  );
  assert.equal(modes[0].width, 720);
  assert.equal(modes[0].height, 486);
  assert.equal(modes[1].width, 720);
  assert.equal(modes[1].height, 576);
  assert.equal(modes[2].interlaced, true);
  assert.equal(modes[3].interlaced, false);
});

test("default output names never reuse deleted sequence numbers", () => {
  let sequence = 1;
  const renderer = new ScriptedFrameRenderer();
  const decklink = new DeckLinkOutputService(renderer);
  decklink.setEndpoints(duoEndpoints());
  const sequenced = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => mapComputerDisplays([displaySource()], 9),
    resolveDisplay: () => graphic(),
    origin: () => "http://127.0.0.1:3000",
    decklink,
    getOutputSequence: () => sequence,
    setOutputSequence: (next) => {
      sequence = next;
    },
  });
  assert.equal(sequenced.nextDefaultOutputName(), "Output 1");
  const first = sequenced.create({
    name: "",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  assert.equal(first.name, "Output 1");
  const second = sequenced.create({
    name: "",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:1",
    displayModeId: "1080p5994",
  });
  assert.equal(second.name, "Output 2");
  const third = sequenced.create({
    name: "",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p25",
  });
  assert.equal(third.name, "Output 3");
  sequenced.update(second.id, { name: "Program SDI" });
  sequenced.delete(second.id);
  assert.equal(sequenced.nextDefaultOutputName(), "Output 4");
  const fourth = sequenced.create({
    name: "",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:1",
    displayModeId: "1080p5994",
  });
  assert.equal(fourth.name, "Output 4");
  assert.equal(formatDefaultOutputName(sequence), "Output 5");
});

test("decklink card resolution uses selected mode not first device mode", () => {
  const { engine } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  assert.equal(route.resolutionLabel, "1920×1080");
  assert.equal(route.configuration.decklink.width, 1920);
  assert.equal(route.configuration.decklink.height, 1080);
});

test("live routing edits are blocked until stop", async () => {
  const { engine } = harness(duoEndpoints());
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994",
  });
  await engine.start(route.id);
  assert.throws(
    () => engine.update(route.id, { displayModeId: "1080p25" }),
    (error) => error instanceof Error && error.message === LIVE_ROUTING_EDIT_BLOCKED,
  );
  const renamed = engine.update(route.id, { name: "Program SDI" });
  assert.equal(renamed.name, "Program SDI");
});

test("local start time formatting avoids raw UTC ISO", () => {
  const label = formatOutputStartedAt("2026-10-04T18:19:54.091Z");
  assert.ok(label);
  assert.match(label, /^Started /);
  assert.doesNotMatch(label, /T18:19:54/);
  assert.doesNotMatch(label, /Z$/);
});

test("operator ui copy and diagnostics contracts", () => {
  const ui = fs.readFileSync(path.join(repoRoot, "src/components/output/OutputManager.tsx"), "utf8");
  assert.match(ui, /Route a published display to an extended monitor or external output on this computer\. Hardware/);
  assert.match(ui, /whitespace-nowrap/);
  assert.match(ui, /Refresh Devices/);
  assert.match(ui, /Add Output/);
  assert.match(ui, /NeudModal/);
  assert.match(ui, /variant=\"destructive\"/);
  assert.match(ui, /Switch/);
  assert.match(ui, /adapterTypeToOperatorLabel\(\"decklink\"\)/);
  assert.match(ui, /Fill Port|Port/);
  assert.match(ui, /Fill Port|Port/);
  assert.match(ui, /needsPairedKeyPort/);
  assert.doesNotMatch(ui, /Blackmagic DeckLink/);
  assert.doesNotMatch(ui, /DeckLink output/);
  assert.doesNotMatch(ui, /rowBytes/);
  assert.doesNotMatch(ui, /paint unknown/);
  assert.doesNotMatch(ui, /Scheduled \$\{/);
  // 60000/1001 appears in Record-to-Disk frame-rate option ids (59.94), not as live DeckLink debug dump.
  assert.match(ui, /RECORDING_FRAME_RATE_OPTIONS/);
  // Mode picker may note BGRA support; live cards must not dump pixel-format metrics.
  assert.doesNotMatch(ui, /· bgra8/);
  assert.doesNotMatch(ui, /rowBytes \$\{/);
  assert.doesNotMatch(ui, /59\.94 fps \(display only\)/);
  const deck = fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/decklink-sdk.cc"), "utf8");
  assert.match(deck, /bmdColorspaceRec601/);
  assert.match(deck, /gModeWidth == 720/);
  const model = fs.readFileSync(path.join(repoRoot, "desktop/src/output/decklink-model.ts"), "utf8");
  assert.match(model, /Blackmagic DeckLink is unavailable/);
  assert.match(model, /formatExternalPortLabel/);
  const renderer = fs.readFileSync(path.join(repoRoot, "desktop/src/output/offscreen-output-renderer.ts"), "utf8");
  assert.match(renderer, /normalizePaintToTargetRaster/);
  assert.match(renderer, /quality: \"good\"/);
  assert.match(renderer, /setImmediate/);
  assert.match(renderer, /flushConvert/);
  assert.doesNotMatch(renderer, /\.enableDeviceEmulation\s*\(/);
  const canvas = fs.readFileSync(path.join(repoRoot, "src/components/displays/DisplayViewerScaledCanvas.tsx"), "utf8");
  assert.match(canvas, /paintScaleWithZoom/);
  assert.match(canvas, /zoom: scale/);
  const fitClient = fs.readFileSync(path.join(repoRoot, "src/components/displays/DisplayWindowFitClient.tsx"), "utf8");
  assert.match(fitClient, /paintScaleWithZoom=\{surface === \"decklink\"\}/);
});

test("start stops when selected mode has no BGRA support", async () => {
  const endpoints = duoEndpoints();
  endpoints[0].modes = [
    {
      id: "1080p5994-nobgra",
      name: "1080p59.94",
      width: 1920,
      height: 1080,
      frameRateNumerator: 60000,
      frameRateDenominator: 1001,
      interlaced: false,
      fieldDominance: "progressive",
      pixelFormats: [],
    },
  ];
  const { engine } = harness(endpoints);
  const route = engine.create({
    name: "Program",
    projectId: "project-1",
    displayId: "display-1",
    deviceId: "decklink:duo-persistent:0",
    displayModeId: "1080p5994-nobgra",
  });
  const started = await engine.start(route.id);
  assert.equal(started.ok, false);
  assert.equal(started.code, "pixel-format-unsupported");
  assert.match(started.error, /BGRA 8-bit is not supported/);
  assert.equal(engine.list()[0].session.status, "error");
});
