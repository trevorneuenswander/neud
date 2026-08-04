"use client";

export const DISPLAY_BRIDGE_ACK_TYPE = "NEUD_DISPLAY_BRIDGE_ACK";

export type DisplayBridgeAckMessage = {
  type: typeof DISPLAY_BRIDGE_ACK_TYPE;
  displayId?: string | null;
  projectId?: string | null;
  revision?: number | null;
};

export function isDisplayBridgeAckMessage(
  value: unknown,
  displayId?: string,
): value is DisplayBridgeAckMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as DisplayBridgeAckMessage;
  if (message.type !== DISPLAY_BRIDGE_ACK_TYPE) {
    return false;
  }

  if (displayId && message.displayId && message.displayId !== displayId) {
    return false;
  }

  return true;
}
