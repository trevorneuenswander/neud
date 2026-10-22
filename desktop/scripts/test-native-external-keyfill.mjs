/**
 * Phase 2B.2B — nativeExternalKey capability + UI/engine wiring tests.
 * Does not require live Key+Fill SDI observation to pass.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  availablePresentationModes,
  mapDeckLinkCapabilitiesToExternal,
  requiresPairedPortSelection,
  resolveKeyFillTransport,
  validateKeyFillPortSelection,
} from "../src/output/external-output-capabilities.ts";
import { unpremultiplyChannel } from "../src/output/key-fill-processor.ts";
import { KEY_FILL_NOT_IMPLEMENTED } from "../src/output/output-engine-core.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");

test("HD Mini-style one-endpoint external-key capability maps to nativeExternalKey", () => {
  const caps = mapDeckLinkCapabilitiesToExternal(
    {
      supportsExternalKeying: true,
      hasKeyerInterface: true,
      numberOfSubDevices: 1,
      nativeExternalKeyCandidate: true,
      pairedPortsCandidate: false,
      physicalKeyFillCandidate: true,
    },
    { siblingPortCount: 1 },
  );
  assert.equal(caps.keyFill, true);
  assert.equal(caps.keyFillTransport, "nativeExternalKey");
  assert.deepEqual(availablePresentationModes(caps), ["fill", "keyFill"]);
  assert.equal(requiresPairedPortSelection(caps), false);
});

test("two subdevices are NOT required for nativeExternalKey", () => {
  assert.equal(
    resolveKeyFillTransport({
      supportsExternalKeying: true,
      hasKeyerInterface: true,
      numberOfSubDevices: 1,
    }),
    "nativeExternalKey",
  );
});

test("pairedPorts still supported architecturally", () => {
  const caps = mapDeckLinkCapabilitiesToExternal(
    {
      supportsExternalKeying: false,
      hasKeyerInterface: false,
      numberOfSubDevices: 2,
      pairedPortsCandidate: true,
      physicalKeyFillCandidate: true,
    },
    { siblingPortCount: 2 },
  );
  assert.equal(caps.keyFill, true);
  assert.equal(caps.keyFillTransport, "pairedPorts");
  assert.equal(requiresPairedPortSelection(caps), true);
  assert.equal(
    validateKeyFillPortSelection({
      fillEndpointId: "a",
      keyEndpointId: "b",
      transport: "pairedPorts",
    }).ok,
    true,
  );
});

test("nativeExternalKey port selection does not require a second port", () => {
  assert.equal(
    validateKeyFillPortSelection({
      fillEndpointId: "decklink:1:0",
      keyEndpointId: "",
      transport: "nativeExternalKey",
    }).ok,
    true,
  );
});

test("operator UI: Key Port selectors only for pairedPorts", () => {
  const ui = fs.readFileSync(path.join(repoRoot, "src/components/output/OutputManager.tsx"), "utf8");
  assert.match(ui, /needsPairedKeyPort/);
  assert.match(ui, /keyFillTransport === \"pairedPorts\"/);
  assert.match(ui, /Key \+ Fill/);
  assert.doesNotMatch(ui, /IDeckLinkKeyer|BMDKeyerMode|SupportsExternalKeying/);
  assert.doesNotMatch(ui, /live Key output is not enabled/);
});

test("native addon implements keyer Enable/SetLevel/Disable lifecycle", () => {
  const sdk = fs.readFileSync(path.join(desktopRoot, "native/decklink/decklink-sdk.cc"), "utf8");
  assert.match(sdk, /IDeckLinkKeyer/);
  assert.match(sdk, /Enable\(true\)/);
  assert.match(sdk, /SetLevel\(255\)/);
  assert.match(sdk, /ReleaseKeyerLocked/);
  assert.match(sdk, /FitKeyFillStraightFromPremul/);
  assert.match(sdk, /WriteStraightFromPremultipliedPixel/);
  assert.match(sdk, /nativeExternalKeyCandidate/);
  assert.match(sdk, /bmdSupportedVideoModeKeying/);
  // Fill-only must not enable keyer when externalKeying is false.
  assert.match(sdk, /if \(externalKeying\)/);
});

test("start API accepts externalKeying flag", () => {
  const addon = fs.readFileSync(path.join(desktopRoot, "native/decklink/decklink-addon.cc"), "utf8");
  assert.match(addon, /externalKeying/);
  const port = fs.readFileSync(path.join(desktopRoot, "src/output/native-decklink-port.ts"), "utf8");
  assert.match(port, /presentationMode === \"keyFill\"/);
  assert.match(port, /externalKeying/);
});

test("premul→straight conversion matches DeckLink sample expectation", () => {
  // 50% premul white → straight white with A=128
  assert.equal(unpremultiplyChannel(128, 128), 255);
  assert.equal(unpremultiplyChannel(64, 64), 255);
  assert.equal(unpremultiplyChannel(0, 0), 0);
  assert.equal(unpremultiplyChannel(200, 255), 200);
  assert.equal(unpremultiplyChannel(1, 1), 255);
});

test("pairedPorts start remains blocked; native path is wired in engine", () => {
  const engine = fs.readFileSync(path.join(desktopRoot, "src/output/output-engine-core.ts"), "utf8");
  assert.match(engine, /nativeExternalKey/);
  assert.match(engine, /KEY_FILL_NOT_IMPLEMENTED/);
  assert.match(engine, /presentationMode/);
  assert.equal(typeof KEY_FILL_NOT_IMPLEMENTED, "string");
});

test("hardware validation fixture exists", () => {
  const fixture = fs.readFileSync(
    path.join(__dirname, "fixtures/key-fill-hardware-validation.html"),
    "utf8",
  );
  assert.match(fixture, /75%|0\.75/);
  assert.match(fixture, /50%|0\.5/);
  assert.match(fixture, /25%|0\.25/);
  assert.match(fixture, /text-shadow|box-shadow/);
  assert.match(fixture, /@keyframes|animation/);
});
