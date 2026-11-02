/**
 * Application-level SQ-5 reachability settings.
 *
 * Physical Ethernet unplug often leaves TCP ESTABLISHED with no FIN/RST; OS
 * keepalive alone can take far longer than a live tally can tolerate. Mic Tally
 * therefore pairs short TCP keepalive with documented read-only NRPN "get"
 * queries and requires inbound MIDI (any bytes) before the response deadline.
 *
 * Idle unsolicited MIDI silence is NOT treated as disconnection — only a missed
 * health-check response (or socket close/error) is.
 */

export const MIC_TALLY_HEALTH_INTERVAL_MS = 2_000;
export const MIC_TALLY_HEALTH_TIMEOUT_MS = 3_000;

/** Soft target for Owner SOP measurement — not a hard guarantee under all OS stacks. */
export const MIC_TALLY_CONNECTION_LOSS_DETECTION_TARGET_MS = 5_000;

export type MicTallyTransportStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "connection-lost"
  | "reconnecting"
  | "simulation"
  | "simulation-disconnected";

export type MicTallyHealthClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
};

export const defaultMicTallyHealthClock: MicTallyHealthClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as NodeJS.Timeout),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as NodeJS.Timeout),
};

export function isMicTallyTransportLive(status: string | null | undefined): boolean {
  return status === "connected" || status === "simulation";
}
