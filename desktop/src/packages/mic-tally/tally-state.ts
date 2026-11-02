/**
 * Mic Tally effective status rules (software-only; protocol-agnostic).
 *
 * Idle MIDI silence must not invalidate known channel state while TCP is healthy.
 * Freshness timestamps are diagnostic only — see resolveTallyStatus.
 */

export type MicTallyStatus = "LIVE" | "MUTED" | "FADER_DOWN" | "UNKNOWN";

export type ChannelFieldConfidence = "known" | "unknown" | "stale";

export type MicChannelRuntimeState = {
  inputChannel: number;
  mixerName: string | null;
  labelOverride: string | null;
  muted: boolean | null;
  muteConfidence: ChannelFieldConfidence;
  fader14: number | null;
  faderNormalized: number | null;
  faderConfidence: ChannelFieldConfidence;
  lastMuteAt: string | null;
  lastFaderAt: string | null;
  lastUpdateAt: string | null;
};

export type ResolveTallyStatusInput = {
  connected: boolean;
  muted: boolean | null;
  muteConfidence: ChannelFieldConfidence;
  fader14: number | null;
  faderConfidence: ChannelFieldConfidence;
  faderThreshold14: number;
  /** Wall-clock for diagnostics / tests; not used to expire known state. */
  nowMs: number;
  lastUpdateMs: number | null;
  /**
   * Legacy field retained for config/API compatibility.
   * Idle elapsed time must never force UNKNOWN when mute+fader are known.
   * Pass 0 or any value — ignored for status resolution.
   */
  freshnessTimeoutMs: number;
};

/**
 * Resolve display/operator status for one channel.
 *
 * Connected + synchronized (mute+fader known) → retain LIVE/MUTED/FADER_DOWN
 * indefinitely until disconnect, explicit invalidation, or field confidence loss.
 * Connected but not yet synchronized → UNKNOWN.
 * Disconnected / transport failure → UNKNOWN.
 */
export function resolveTallyStatus(input: ResolveTallyStatusInput): MicTallyStatus {
  if (!input.connected) {
    return "UNKNOWN";
  }
  const muteOk = input.muteConfidence === "known" && input.muted != null;
  const faderOk = input.faderConfidence === "known" && input.fader14 != null;
  if (!muteOk || !faderOk) {
    return "UNKNOWN";
  }
  // Intentionally ignore freshnessTimeoutMs / idle elapsed time.
  // An idle mixer with known mute+fader is still synchronized.
  void input.nowMs;
  void input.lastUpdateMs;
  void input.freshnessTimeoutMs;

  if (input.muted) {
    return "MUTED";
  }
  if ((input.fader14 as number) <= input.faderThreshold14) {
    return "FADER_DOWN";
  }
  return "LIVE";
}

/** True when mute+fader have been synchronized for this channel (independent of idle age). */
export function channelIsSynchronized(input: {
  muted: boolean | null;
  muteConfidence: ChannelFieldConfidence;
  fader14: number | null;
  faderConfidence: ChannelFieldConfidence;
}): boolean {
  return (
    input.muteConfidence === "known" &&
    input.muted != null &&
    input.faderConfidence === "known" &&
    input.fader14 != null
  );
}

export function displayLabelForChannel(state: {
  inputChannel: number;
  mixerName: string | null;
  labelOverride: string | null;
}): { label: string; labelSource: "override" | "mixer" | "default" } {
  const override = state.labelOverride?.trim();
  if (override) {
    return { label: override, labelSource: "override" };
  }
  const mixer = state.mixerName?.trim();
  if (mixer) {
    return { label: mixer, labelSource: "mixer" };
  }
  return { label: `Input ${state.inputChannel}`, labelSource: "default" };
}

export function assertUniqueSlotChannels(
  slots: Array<{ slot: number; inputChannel: number | null }>,
): { ok: true } | { ok: false; error: string } {
  const seen = new Map<number, number>();
  for (const entry of slots) {
    if (entry.inputChannel == null) continue;
    const prior = seen.get(entry.inputChannel);
    if (prior != null) {
      return {
        ok: false,
        error: `Input ${entry.inputChannel} is assigned to both Mic Slot ${prior} and Mic Slot ${entry.slot}.`,
      };
    }
    seen.set(entry.inputChannel, entry.slot);
  }
  return { ok: true };
}
