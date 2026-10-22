import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  availablePresentationModes,
  mapDeckLinkCapabilitiesToExternal,
  modesAreCompatibleForKeyFill,
  validateKeyFillPortSelection,
} from "../src/output/external-output-capabilities.ts";
import { KeyFillSession } from "../src/output/key-fill-session.ts";
import {
  inferAlphaModeFromSample,
  keyLumaFromAlpha,
  premultiplyStraightRgb,
  preserveSourceFrame,
} from "../src/output/source-alpha-analysis.ts";
import { DeckLinkOutputService, ScriptedFrameRenderer } from "../src/output/decklink-output-service.ts";
import { MemoryOutputRouteStore, OutputEngine, mapComputerDisplays } from "../src/output/output-engine-core.ts";

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

function duoKeyFillEndpoints() {
  return [0, 1].map((endpointIndex) => ({
    persistentId: "duo-keyfill",
    modelName: "DeckLink Duo 2",
    endpointName: `Output ${endpointIndex + 1}`,
    endpointIndex,
    available: true,
    capabilities: {
      supportsInternalKeying: false,
      supportsExternalKeying: true,
      supportsDualLinkSdi: false,
      hasReferenceInput: true,
      supportsSynchronizeToPlaybackGroup: true,
      hasKeyerInterface: false,
      numberOfSubDevices: 2,
      deviceGroupId: 1,
      physicalKeyFillCandidate: true,
    },
    modes: [mode5994],
  }));
}

function miniFillOnlyEndpoint() {
  return [
    {
      persistentId: "mini-fill",
      modelName: "UltraStudio HD Mini",
      endpointName: "Output 1",
      endpointIndex: 0,
      available: true,
      capabilities: {
        supportsInternalKeying: false,
        supportsExternalKeying: false,
        supportsDualLinkSdi: false,
        hasReferenceInput: false,
        supportsSynchronizeToPlaybackGroup: false,
        hasKeyerInterface: false,
        numberOfSubDevices: 1,
        deviceGroupId: 0,
        physicalKeyFillCandidate: false,
      },
      modes: [mode5994],
    },
  ];
}

test("generic keyFill capability maps from DeckLink raw flags", () => {
  const fillOnly = mapDeckLinkCapabilitiesToExternal(
    {
      numberOfSubDevices: 1,
      physicalKeyFillCandidate: false,
      supportsExternalKeying: false,
      hasKeyerInterface: false,
    },
    { siblingPortCount: 1 },
  );
  assert.equal(fillOnly.fill, true);
  assert.equal(fillOnly.keyFill, false);
  assert.equal(fillOnly.keyFillTransport, null);
  assert.deepEqual(availablePresentationModes(fillOnly), ["fill"]);

  const native = mapDeckLinkCapabilitiesToExternal(
    {
      numberOfSubDevices: 1,
      supportsExternalKeying: true,
      hasKeyerInterface: true,
      nativeExternalKeyCandidate: true,
    },
    { siblingPortCount: 1 },
  );
  assert.equal(native.keyFill, true);
  assert.equal(native.keyFillTransport, "nativeExternalKey");

  const paired = mapDeckLinkCapabilitiesToExternal(
    {
      numberOfSubDevices: 2,
      physicalKeyFillCandidate: true,
      pairedPortsCandidate: true,
      supportsExternalKeying: false,
      hasKeyerInterface: false,
    },
    { siblingPortCount: 2 },
  );
  assert.equal(paired.keyFill, true);
  assert.equal(paired.keyFillTransport, "pairedPorts");
  assert.deepEqual(availablePresentationModes(paired), ["fill", "keyFill"]);
});

test("Fill-only device does not expose Key + Fill presentation mode", () => {
  const renderer = new ScriptedFrameRenderer();
  const decklink = new DeckLinkOutputService(renderer);
  decklink.setEndpoints(miniFillOnlyEndpoint());
  const device = decklink.discoverDevices()[0];
  assert.equal(device.capabilities.external.keyFill, false);
  assert.deepEqual(availablePresentationModes(device.capabilities.external), ["fill"]);
});

test("Key + Fill-capable device exposes keyFill", () => {
  const renderer = new ScriptedFrameRenderer();
  const decklink = new DeckLinkOutputService(renderer);
  decklink.setEndpoints(duoKeyFillEndpoints());
  const devices = decklink.discoverDevices();
  assert.equal(devices.length, 2);
  assert.equal(devices[0].capabilities.external.keyFill, true);
  assert.ok(availablePresentationModes(devices[0].capabilities.external).includes("keyFill"));
});

test("Fill and Key port selection validation", () => {
  assert.equal(validateKeyFillPortSelection({ fillEndpointId: "a", keyEndpointId: "a" }).ok, false);
  assert.equal(validateKeyFillPortSelection({ fillEndpointId: "a", keyEndpointId: "b" }).ok, true);
  assert.equal(validateKeyFillPortSelection({ fillEndpointId: "", keyEndpointId: "b" }).ok, false);
});

test("mode compatibility requires identical timing and raster", () => {
  assert.equal(
    modesAreCompatibleForKeyFill(mode5994, { ...mode5994 }),
    true,
  );
  assert.equal(
    modesAreCompatibleForKeyFill(mode5994, { ...mode5994, frameRateNumerator: 50 }),
    false,
  );
});

test("one logical master timeline with paired preroll timestamps", () => {
  const session = new KeyFillSession({ prerollFrames: 3, frameDuration: 1001, timeScale: 60000 });
  const plan = session.planPreroll();
  assert.deepEqual(
    plan.map((entry) => entry.displayTime),
    [0, 1001, 2002],
  );
  assert.ok(plan.every((entry) => entry.timeScale === 60000 && entry.displayDuration === 1001));
  assert.equal(session.beginPlayback("2026-10-04T12:00:00.000Z").ok, true);
  assert.equal(session.diagnostics().mode, "keyFill");
});

test("Fill and Key completion tracking detects sync faults", () => {
  const session = new KeyFillSession({ prerollFrames: 1, frameDuration: 1001, timeScale: 60000 });
  session.schedulePairedFrame(0, 0);
  session.markFillCompleted(0, "completed");
  session.markKeyCompleted(0, "late");
  assert.equal(session.syncFaultCount, 1);
  assert.match(session.lastSyncFault.reason, /sync fault/);
});

test("partial Start rollback and Stop cleanup both sides", () => {
  let fillStopped = false;
  let keyStopped = false;
  const rolled = KeyFillSession.rollbackPartialStart({
    fillEnabled: true,
    keyEnabled: false,
    fillStop: () => {
      fillStopped = true;
    },
    keyStop: () => {
      keyStopped = true;
    },
  });
  assert.equal(rolled.fillStopped, true);
  assert.equal(rolled.keyStopped, false);
  assert.equal(fillStopped, true);

  const stopped = KeyFillSession.stopBoth({
    fillStop: () => {
      throw new Error("fill stop failed");
    },
    keyStop: () => {
      keyStopped = true;
    },
  });
  assert.match(stopped.fillError, /fill stop failed/);
  assert.equal(stopped.keyError, null);
  assert.equal(keyStopped, true);
});

test("occupied Fill or Key port is rejected via exclusivity helper semantics", async () => {
  const renderer = new ScriptedFrameRenderer();
  const decklink = new DeckLinkOutputService(renderer);
  decklink.setEndpoints(duoKeyFillEndpoints());
  const engine = new OutputEngine({
    store: new MemoryOutputRouteStore(),
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => mapComputerDisplays([], 9),
    resolveDisplay: () => ({
      projectId: "p1",
      projectName: "P",
      displayId: "d1",
      displayName: "Stream Bid",
      slug: "stream-bid-display",
      width: 1920,
      height: 1080,
      enabled: true,
      publishedRevisionId: "r1",
    }),
    origin: () => "http://127.0.0.1:3000",
    decklink,
  });
  const first = engine.create({
    name: "Output 1",
    projectId: "p1",
    displayId: "d1",
    deviceId: "decklink:duo-keyfill:0",
    displayModeId: "1080p5994",
  });
  assert.equal((await engine.start(first.id)).ok, true);
  const second = engine.create({
    name: "Output 2",
    projectId: "p1",
    displayId: "d1",
    deviceId: "decklink:duo-keyfill:0",
    displayModeId: "1080p5994",
  });
  const busy = await engine.start(second.id);
  assert.equal(busy.ok, false);
  assert.match(busy.error, /DeckLink Duo 2 Port 1 is already in use by Output 1/);
});

test("pairedPorts keyFill start remains blocked; nativeExternalKey is the HD Mini path", async () => {
  const renderer = new ScriptedFrameRenderer();
  const decklink = new DeckLinkOutputService(renderer);
  decklink.setEndpoints(duoKeyFillEndpoints());
  const store = new MemoryOutputRouteStore();
  const engine = new OutputEngine({
    store,
    windows: { async open() { return { ok: true }; }, close() {} },
    discoverDevices: () => mapComputerDisplays([], 9),
    resolveDisplay: () => ({
      projectId: "p1",
      projectName: "P",
      displayId: "d1",
      displayName: "Stream Bid",
      slug: "stream-bid-display",
      width: 1920,
      height: 1080,
      enabled: true,
      publishedRevisionId: "r1",
    }),
    origin: () => "http://127.0.0.1:3000",
    decklink,
  });
  const route = engine.create({
    name: "Output 1",
    projectId: "p1",
    displayId: "d1",
    deviceId: "decklink:duo-keyfill:0",
    displayModeId: "1080p5994",
  });
  const existing = store.get(route.id);
  store.save({
    ...existing,
    configuration: {
      ...existing.configuration,
      decklink: {
        ...existing.configuration.decklink,
        presentationMode: "keyFill",
        keyFillTransport: "pairedPorts",
        keyEndpointId: "decklink:duo-keyfill:1",
      },
    },
  });
  const started = await engine.start(route.id);
  assert.equal(started.ok, false);
  assert.equal(started.code, "key-fill-not-implemented");

  // HD Mini-style nativeExternalKey can start (mock port) without a second Key Port.
  decklink.setEndpoints([
    {
      persistentId: "mini-keyfill",
      modelName: "UltraStudio HD Mini",
      endpointName: "Output 1",
      endpointIndex: 0,
      available: true,
      capabilities: {
        supportsInternalKeying: true,
        supportsExternalKeying: true,
        supportsDualLinkSdi: true,
        hasReferenceInput: true,
        supportsSynchronizeToPlaybackGroup: true,
        hasKeyerInterface: true,
        numberOfSubDevices: 1,
        deviceGroupId: 1,
        nativeExternalKeyCandidate: true,
        pairedPortsCandidate: false,
        physicalKeyFillCandidate: true,
      },
      modes: [mode5994],
    },
  ]);
  const mini = engine.create({
    name: "Output Mini",
    projectId: "p1",
    displayId: "d1",
    deviceId: "decklink:mini-keyfill:0",
    displayModeId: "1080p5994",
    presentationMode: "keyFill",
  });
  assert.equal(mini.configuration.decklink?.presentationMode, "keyFill");
  assert.equal(mini.configuration.decklink?.keyFillTransport, "nativeExternalKey");
  const miniStart = await engine.start(mini.id);
  assert.equal(miniStart.ok, true);
});

test("source alpha preserved before Fill-only composite helpers", () => {
  const source = Uint8Array.from([255, 255, 255, 128, 0, 0, 0, 0]);
  const preserved = preserveSourceFrame(source);
  source[0] = 1;
  assert.equal(preserved[0], 255);
  assert.equal(inferAlphaModeFromSample({ r: 255, g: 255, b: 255, a: 128 }), "straight");
  assert.equal(inferAlphaModeFromSample({ r: 128, g: 128, b: 128, a: 128 }), "premultiplied");
  assert.equal(keyLumaFromAlpha(128), 128);
  assert.deepEqual(premultiplyStraightRgb(255, 255, 255, 128), { r: 128, g: 128, b: 128, a: 128 });
});

test("operator UI remains generic and capability-driven for Key + Fill", () => {
  const ui = fs.readFileSync(path.join(repoRoot, "src/components/output/OutputManager.tsx"), "utf8");
  assert.match(ui, /Key \+ Fill/);
  assert.match(ui, /keyFillCapable/);
  assert.match(ui, /Fill Port/);
  assert.match(ui, /Key Port/);
  assert.doesNotMatch(ui, /BMDKeyerMode/);
  assert.doesNotMatch(ui, /SupportsExternalKeying/);
  assert.doesNotMatch(ui, /Blackmagic DeckLink/);
  assert.match(
    fs.readFileSync(path.join(repoRoot, "docs/output-engine/key-fill-alpha-contract.md"), "utf8"),
    /premultiplied/,
  );
  assert.match(
    fs.readFileSync(path.join(repoRoot, "desktop/native/decklink/decklink-sdk.cc"), "utf8"),
    /physicalKeyFillCandidate/,
  );
});
