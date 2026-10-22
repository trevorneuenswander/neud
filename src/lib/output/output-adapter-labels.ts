/**
 * Operator-facing labels for Output Engine adapters.
 * Internal adapterType values (display, decklink, …) stay vendor-specific;
 * these helpers keep the Outputs UI generic for future external I/O adapters.
 */

export function adapterTypeToOperatorLabel(adapterType: string | null | undefined): string {
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
export function formatExternalPortLabel(modelName: string, endpointIndex: number): string {
  const model = modelName.trim() || "External Device";
  const portNumber = Number.isFinite(endpointIndex) ? Math.max(1, Math.floor(endpointIndex) + 1) : 1;
  return `${model} Port ${portNumber}`;
}

export const EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE =
  "External device support is unavailable on this computer.";
/** Operator-facing: real addon loaded but Desktop Video runtime / iterator unavailable. */
export const EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE = "Desktop Video runtime is unavailable.";
/** Operator-facing: native .node failed to load (path/ABI). */
export const EXTERNAL_NATIVE_ADDON_FAILED = "Native external-device helper failed to load.";
export const EXTERNAL_NO_DEVICES = "No external output devices detected.";

/** Map probe/load diagnostics to a short operator-facing message. */
export function operatorFacingExternalDeviceUnavailable(
  reason: string | null | undefined,
): string {
  const text = (reason ?? "").trim();
  if (!text) return EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
  if (
    text === EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE ||
    text === EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE ||
    text === EXTERNAL_NATIVE_ADDON_FAILED ||
    text === EXTERNAL_NO_DEVICES
  ) {
    return text;
  }
  if (/stub/i.test(text) || /built without/i.test(text)) {
    return EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
  }
  if (/failed to load|native helper|addon/i.test(text)) {
    return EXTERNAL_NATIVE_ADDON_FAILED;
  }
  if (/Desktop Video|CreateDeckLinkIterator|runtime/i.test(text)) {
    return EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE;
  }
  return EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
}
