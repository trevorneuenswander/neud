import { localFetch } from "@/lib/local/api";

export type MicTallyStatus = "LIVE" | "MUTED" | "FADER_DOWN" | "UNKNOWN";

export type MicTallySlot = {
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

export type MicTallyOperatorState = {
  connected: boolean;
  simulation: boolean;
  simulationEnabled: boolean;
  connectionStatus: string;
  mixerHost: string;
  mixerPort: number;
  midiChannel: number;
  faderThreshold14: number;
  freshnessTimeoutMs: number;
  reconnectEnabled: boolean;
  lastError: string | null;
  /** Last inbound MIDI activity (diagnostic only; does not expire channel status). */
  lastMidiReceivedAt?: string | null;
  /** Last successful application-level mixer health-check response. */
  lastHealthResponseAt?: string | null;
  lastHealthQueryAt?: string | null;
  /** Latest mute/fader update across watched channels (diagnostic only). */
  lastStateUpdateAt?: string | null;
  lastSyncAt?: string | null;
  reconnectAttemptCount?: number;
  autoReconnectDesired?: boolean;
  healthCheck?: { intervalMs: number; timeoutMs: number; mechanism: string };
  slots: MicTallySlot[];
  inputChannelOptions: Array<{ value: number; label: string }>;
  diagnostics: Array<{ at: string; level: string; message: string }>;
  protocolNotes?: Record<string, unknown>;
  revision: number;
};

function base(slug: string): string {
  return `/api/projects/${encodeURIComponent(slug)}/mic-tally`;
}

export function fetchMicTallyState(slug: string): Promise<MicTallyOperatorState> {
  return localFetch<MicTallyOperatorState>(`${base(slug)}/state`);
}

export function postMicTallyAction(
  slug: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<MicTallyOperatorState> {
  return localFetch<MicTallyOperatorState>(`${base(slug)}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: action === "connect" || action === "reconnect" ? 20_000 : undefined,
  });
}
