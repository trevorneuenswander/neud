/**
 * Allen & Heath SQ-series MIDI protocol helpers (Issue 5 / Firmware V1.6 docs).
 * Source: https://www.allen-heath.com/content/uploads/2023/11/SQ-MIDI-Protocol-Issue5.pdf
 * Support article: SQ MIDI Protocol - Firmware V1.6 (TCP port 51325).
 *
 * Read-only Mic Tally may send only documented "get" queries (BN 63 MB BN 62 LB BN 60 7F).
 * Never emit mute set, level set, scene recall, or other control messages from this module's
 * control builders — only parsers and get-request builders are exported for the adapter.
 */

/** Documented TCP MIDI port for SQ network MIDI clients. */
export const SQ_MIDI_TCP_PORT = 51325;

/** SQ-5 input channel count covered by mute/level tables (Ip1–Ip48). */
export const SQ5_INPUT_CHANNEL_COUNT = 48;

/** Default SQ mixer MIDI channel (1–16). DAW strip channel is always one higher. */
export const SQ_DEFAULT_MIXER_MIDI_CHANNEL = 1;

/**
 * Linear-taper 14-bit level for approximately −40 dB from A&H Issue 5 table (VC=0x51, VF=0x4F).
 * Used as the default Mic Tally "fader down" threshold (inclusive).
 */
export const SQ_LINEAR_TAPER_NEG_40_DB_14BIT = (0x51 << 7) | 0x4f;

export const SQ_LINEAR_TAPER_MAX_14BIT = (0x7f << 7) | 0x7f;

export type SqMuteParameter = { msb: number; lsb: number };
export type SqLevelParameter = { msb: number; lsb: number };

/** Mute parameter numbers — Inputs (IpN → MB=0x00, LB=N-1). */
export function muteParameterForInput(inputChannel: number): SqMuteParameter {
  assertInputChannel(inputChannel);
  return { msb: 0x00, lsb: inputChannel - 1 };
}

/** Level parameter numbers — Input N to LR (first column): MB=0x40, LB=N-1. */
export function levelToLrParameterForInput(inputChannel: number): SqLevelParameter {
  assertInputChannel(inputChannel);
  return { msb: 0x40, lsb: inputChannel - 1 };
}

function assertInputChannel(inputChannel: number): void {
  if (
    !Number.isInteger(inputChannel) ||
    inputChannel < 1 ||
    inputChannel > SQ5_INPUT_CHANNEL_COUNT
  ) {
    throw new Error(`SQ input channel must be 1–${SQ5_INPUT_CHANNEL_COUNT}, got ${inputChannel}`);
  }
}

function midiChannelNibble(midiChannel: number): number {
  if (!Number.isInteger(midiChannel) || midiChannel < 1 || midiChannel > 16) {
    throw new Error(`MIDI channel must be 1–16, got ${midiChannel}`);
  }
  return midiChannel - 1;
}

/** Build a documented read-only NRPN "get" request. */
export function buildNrpnGetRequest(
  midiChannel: number,
  parameter: { msb: number; lsb: number },
): number[] {
  const n = midiChannelNibble(midiChannel);
  const status = 0xb0 | n;
  return [status, 0x63, parameter.msb & 0x7f, status, 0x62, parameter.lsb & 0x7f, status, 0x60, 0x7f];
}

export function buildMuteGetRequest(midiChannel: number, inputChannel: number): number[] {
  return buildNrpnGetRequest(midiChannel, muteParameterForInput(inputChannel));
}

export function buildLevelToLrGetRequest(midiChannel: number, inputChannel: number): number[] {
  return buildNrpnGetRequest(midiChannel, levelToLrParameterForInput(inputChannel));
}

export type ParsedSqMidiEvent =
  | {
      type: "mute";
      midiChannel: number;
      msb: number;
      lsb: number;
      muted: boolean;
      inputChannel: number | null;
    }
  | {
      type: "level";
      midiChannel: number;
      msb: number;
      lsb: number;
      coarse: number;
      fine: number;
      value14: number;
      inputChannel: number | null;
    }
  | {
      type: "scene";
      midiChannel: number;
      bank: number;
      program: number;
      sceneNumber: number;
    }
  | { type: "ignored" };

export function level14ToNormalized(value14: number): number {
  const clamped = Math.max(0, Math.min(SQ_LINEAR_TAPER_MAX_14BIT, value14));
  return clamped / SQ_LINEAR_TAPER_MAX_14BIT;
}

export function defaultInputLabel(inputChannel: number): string {
  return `Input ${inputChannel}`;
}
