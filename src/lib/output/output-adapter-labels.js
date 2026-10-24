"use strict";
/**
 * Operator-facing labels for Output Engine adapters.
 * Internal adapterType values (display, decklink, …) stay vendor-specific;
 * these helpers keep the Outputs UI generic for future external I/O adapters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.operatorFacingExternalDeviceUnavailable = operatorFacingExternalDeviceUnavailable;
exports.EXTERNAL_NO_DEVICES =
  exports.EXTERNAL_NATIVE_ADDON_FAILED =
  exports.EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE =
  exports.EXTERNAL_DEVICE_STUB_BUILD =
  exports.EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE =
    void 0;
exports.adapterTypeToOperatorLabel = adapterTypeToOperatorLabel;
exports.formatExternalPortLabel = formatExternalPortLabel;
function adapterTypeToOperatorLabel(adapterType) {
  switch (adapterType) {
    case "display":
      return "Computer Display";
    case "decklink":
      return "External Device";
    case "disk":
      return "Record to Disk";
    default:
      return "External Device";
  }
}
/** Operator port label: "<Device Model> Port <n>" (1-based). */
function formatExternalPortLabel(modelName, endpointIndex) {
  const model = modelName.trim() || "External Device";
  const portNumber = Number.isFinite(endpointIndex) ? Math.max(1, Math.floor(endpointIndex) + 1) : 1;
  return `${model} Port ${portNumber}`;
}
exports.EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE =
  "External device support is unavailable on this computer.";
exports.EXTERNAL_DEVICE_STUB_BUILD =
  "External device support was not compiled into this NEUD build (DeckLink SDK missing at build time).";
exports.EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE =
  "Desktop Video runtime is unavailable. Install or update Blackmagic Desktop Video and restart NEUD.";
exports.EXTERNAL_NATIVE_ADDON_FAILED =
  "Native external-device helper failed to load. The packaged DeckLink module may be missing or incompatible.";
exports.EXTERNAL_NO_DEVICES = "No external output devices detected.";
function operatorFacingExternalDeviceUnavailable(reason) {
  const text = (reason ?? "").trim();
  if (!text) return exports.EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
  if (
    text === exports.EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE ||
    text === exports.EXTERNAL_DEVICE_STUB_BUILD ||
    text === exports.EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE ||
    text === exports.EXTERNAL_NATIVE_ADDON_FAILED ||
    text === exports.EXTERNAL_NO_DEVICES
  ) {
    return text;
  }
  if (/stub/i.test(text) || /built without/i.test(text)) {
    return exports.EXTERNAL_DEVICE_STUB_BUILD;
  }
  if (/failed to load|native helper|addon/i.test(text)) {
    return exports.EXTERNAL_NATIVE_ADDON_FAILED;
  }
  if (/Desktop Video|CreateDeckLinkIterator|runtime/i.test(text)) {
    return exports.EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE;
  }
  return exports.EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
}
