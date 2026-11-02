import type { MicTallyStatus } from "./tally-state";

export type MicTallySlotPayload = {
  slot: 1 | 2 | 3;
  inputChannel: number | null;
  label: string;
  labelSource: "override" | "mixer" | "default";
  muted: boolean | null;
  fader14: number | null;
  faderNormalized: number | null;
  status: MicTallyStatus;
  lastUpdateAt: string | null;
};

export type MicTallyDisplayPayload = {
  dataSource: "mic-tally";
  manufacturer: "Allen & Heath";
  model: "SQ-5";
  connectionMode: "live" | "simulation" | "disconnected";
  connected: boolean;
  simulation: boolean;
  updatedAt: string;
  revision: number;
  contentHash: string;
  faderThreshold14: number;
  slots: MicTallySlotPayload[];
  diagnostics?: {
    lastMessageAt: string | null;
    lastSyncAt: string | null;
    lastSceneAt: string | null;
    lastSceneNumber: number | null;
    lastError: string | null;
  };
};

export function hashMicTallyContent(payload: Omit<MicTallyDisplayPayload, "contentHash">): string {
  const key = JSON.stringify({
    connectionMode: payload.connectionMode,
    connected: payload.connected,
    simulation: payload.simulation,
    faderThreshold14: payload.faderThreshold14,
    slots: payload.slots.map((s) => ({
      slot: s.slot,
      inputChannel: s.inputChannel,
      label: s.label,
      status: s.status,
      muted: s.muted,
      fader14: s.fader14,
    })),
    revision: payload.revision,
  });
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `mic-tally-${hash.toString(16)}`;
}
