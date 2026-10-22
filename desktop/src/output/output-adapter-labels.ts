/**
 * Re-export operator terminology helpers for desktop Output Engine code.
 * Keep in sync with src/lib/output/output-adapter-labels.ts (UI package).
 */
export {
  adapterTypeToOperatorLabel,
  EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE,
  EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE,
  EXTERNAL_NATIVE_ADDON_FAILED,
  EXTERNAL_NO_DEVICES,
  formatExternalPortLabel,
  operatorFacingExternalDeviceUnavailable,
} from "./decklink-model.ts";
