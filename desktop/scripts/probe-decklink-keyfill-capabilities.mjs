#!/usr/bin/env node
/**
 * Probe real DeckLink endpoints for Key + Fill capability discovery.
 * Usage (after desktop build with NEUD_DECKLINK_SDK):
 *   node desktop/scripts/probe-decklink-keyfill-capabilities.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapDeckLinkCapabilitiesToExternal } from "../src/output/external-output-capabilities.ts";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const addonPath = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.node");

let addon;
try {
  addon = require(addonPath);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: String(error), addonPath }, null, 2));
  process.exit(1);
}

const probe = addon.probe();
const endpoints = JSON.parse(addon.discover() || "[]");
const mapped = endpoints.map((endpoint) => {
  const external = mapDeckLinkCapabilitiesToExternal(endpoint.capabilities, {
    siblingPortCount: endpoints.length,
  });
  return {
    modelName: endpoint.modelName,
    persistentId: endpoint.persistentId,
    endpointIndex: endpoint.endpointIndex,
    capabilities: endpoint.capabilities ?? null,
    external,
    modeCount: (endpoint.modes ?? []).length,
    bgraModeCount: (endpoint.modes ?? []).filter((mode) => (mode.pixelFormats ?? []).includes("bgra8")).length,
    yuvModeCount: (endpoint.modes ?? []).filter((mode) =>
      (mode.pixelFormats ?? []).some((format) => String(format).startsWith("yuv")),
    ).length,
    sampleModes: (endpoint.modes ?? [])
      .filter((mode) => /1080p59|720p59|525i|625i/i.test(mode.name))
      .map((mode) => ({
        id: mode.id,
        name: mode.name,
        pixelFormats: mode.pixelFormats,
        supportsKeyingBgra: mode.supportsKeyingBgra,
        supportsKeyingYuv8: mode.supportsKeyingYuv8,
      })),
  };
});

const report = {
  ok: true,
  probe,
  endpointCount: endpoints.length,
  endpoints: mapped,
  neudKeyFillSupported: mapped.some((endpoint) => endpoint.external.keyFill),
  neudNativeExternalKeySupported: mapped.some(
    (endpoint) => endpoint.external.keyFillTransport === "nativeExternalKey",
  ),
  neudPairedPortsSupported: mapped.some((endpoint) => endpoint.external.keyFillTransport === "pairedPorts"),
  note:
    "nativeExternalKey = SupportsExternalKeying + IDeckLinkKeyer (HD Mini Fill/Key SDI pair). pairedPorts = >=2 scheduleable subdevices.",
};

console.log(JSON.stringify(report, null, 2));
