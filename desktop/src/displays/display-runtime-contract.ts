/** Canonical NEUD display runtime message contract (iframe + injected runtime). */

export const NEUD_DISPLAY_MESSAGE_SOURCE = "neud-display" as const;
export const NEUD_RUNTIME_MESSAGE_SOURCE = "neud-runtime" as const;

export const NEUD_DISPLAY_READY_TYPE = "NEUD_DISPLAY_READY" as const;
export const NEUD_DATA_UPDATE_TYPE = "NEUD_DATA_UPDATE" as const;
export const NEUD_DISPLAY_BRIDGE_ACK_TYPE = "NEUD_DISPLAY_BRIDGE_ACK" as const;

export const NEUD_DATA_UPDATE_VERSION = 1;

export type NeudDisplayReadyMessage = {
  source: typeof NEUD_DISPLAY_MESSAGE_SOURCE;
  type: typeof NEUD_DISPLAY_READY_TYPE;
};

export type NeudDataUpdateMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_DATA_UPDATE_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  payload: Record<string, unknown>;
  revision?: number | null;
};

export type NeudDisplayBridgeAckMessage = {
  type: typeof NEUD_DISPLAY_BRIDGE_ACK_TYPE;
  displayId?: string | null;
  projectId?: string | null;
  revision?: number | null;
};
