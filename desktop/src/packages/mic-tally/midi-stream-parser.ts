/**
 * Incremental MIDI byte stream parser with running-status support.
 * Feeds complete channel messages to a callback; does not interpret SQ semantics.
 */

export type MidiChannelMessage =
  | { kind: "cc"; channel: number; controller: number; value: number }
  | { kind: "pc"; channel: number; program: number }
  | { kind: "note"; channel: number; note: number; velocity: number; on: boolean }
  | { kind: "other"; status: number; data: number[] };

export class MidiStreamParser {
  private buffer: number[] = [];
  private runningStatus: number | null = null;

  push(chunk: Uint8Array | Buffer | number[]): MidiChannelMessage[] {
    for (const byte of chunk) {
      this.buffer.push(byte & 0xff);
    }
    return this.drain();
  }

  reset(): void {
    this.buffer = [];
    this.runningStatus = null;
  }

  private drain(): MidiChannelMessage[] {
    const out: MidiChannelMessage[] = [];
    while (this.buffer.length > 0) {
      const first = this.buffer[0]!;
      if (first >= 0xf8) {
        // Real-time — ignore
        this.buffer.shift();
        continue;
      }
      if (first >= 0xf0) {
        // SysEx / system common — drop until next status or consume one byte
        this.buffer.shift();
        this.runningStatus = null;
        continue;
      }

      let status: number;
      let dataStart: number;
      if (first >= 0x80) {
        status = first;
        this.runningStatus = status >= 0xf0 ? null : status;
        dataStart = 1;
      } else if (this.runningStatus != null) {
        status = this.runningStatus;
        dataStart = 0;
      } else {
        this.buffer.shift();
        continue;
      }

      const dataLen = channelMessageDataLength(status);
      if (this.buffer.length < dataStart + dataLen) {
        break;
      }
      const data = this.buffer.slice(dataStart, dataStart + dataLen);
      this.buffer.splice(0, dataStart + dataLen);
      const channel = (status & 0x0f) + 1;
      const high = status & 0xf0;
      if (high === 0xb0 && dataLen === 2) {
        out.push({ kind: "cc", channel, controller: data[0]! & 0x7f, value: data[1]! & 0x7f });
      } else if (high === 0xc0 && dataLen === 1) {
        out.push({ kind: "pc", channel, program: data[0]! & 0x7f });
      } else if ((high === 0x90 || high === 0x80) && dataLen === 2) {
        out.push({
          kind: "note",
          channel,
          note: data[0]! & 0x7f,
          velocity: data[1]! & 0x7f,
          on: high === 0x90 && (data[1]! & 0x7f) > 0,
        });
      } else {
        out.push({ kind: "other", status, data });
      }
    }
    return out;
  }
}

function channelMessageDataLength(status: number): number {
  const high = status & 0xf0;
  if (high === 0xc0 || high === 0xd0) return 1;
  return 2;
}

/** Assembles SQ NRPN absolute and get-response style CC sequences. */
export class SqNrpnAssembler {
  private pending: { channel: number; msb?: number; lsb?: number; coarse?: number } | null =
    null;
  private lastBank: { channel: number; bank: number } | null = null;

  push(message: MidiChannelMessage): import("./sq-midi-protocol").ParsedSqMidiEvent[] {
    const events: import("./sq-midi-protocol").ParsedSqMidiEvent[] = [];
    if (message.kind === "cc" && message.controller === 0x00) {
      this.lastBank = { channel: message.channel, bank: message.value };
      return events;
    }
    if (message.kind === "pc") {
      if (this.lastBank && this.lastBank.channel === message.channel) {
        const bank = this.lastBank.bank;
        events.push({
          type: "scene",
          midiChannel: message.channel,
          bank,
          program: message.program,
          sceneNumber: bank * 128 + message.program + 1,
        });
        this.lastBank = null;
      }
      return events;
    }
    if (message.kind !== "cc") {
      return events;
    }

    if (message.controller === 0x63) {
      this.pending = { channel: message.channel, msb: message.value };
      return events;
    }
    if (!this.pending || this.pending.channel !== message.channel) {
      return events;
    }
    if (message.controller === 0x62) {
      this.pending.lsb = message.value;
      return events;
    }
    if (this.pending.msb == null || this.pending.lsb == null) {
      return events;
    }
    if (message.controller === 0x06) {
      this.pending.coarse = message.value;
      return events;
    }
    if (message.controller === 0x26 && this.pending.coarse != null) {
      const msb = this.pending.msb;
      const lsb = this.pending.lsb;
      const coarse = this.pending.coarse;
      const fine = message.value;
      this.pending = null;
      const inputFromMute =
        msb === 0x00 && lsb <= 0x2f ? lsb + 1 : null;
      if (coarse === 0x00 && (fine === 0x00 || fine === 0x01) && inputFromMute != null) {
        events.push({
          type: "mute",
          midiChannel: message.channel,
          msb,
          lsb,
          muted: fine === 0x01,
          inputChannel: inputFromMute,
        });
        return events;
      }
      const inputFromLevel = msb === 0x40 && lsb <= 0x2f ? lsb + 1 : null;
      events.push({
        type: "level",
        midiChannel: message.channel,
        msb,
        lsb,
        coarse,
        fine,
        value14: (coarse << 7) | fine,
        inputChannel: inputFromLevel,
      });
      return events;
    }
    if (message.controller === 0x60) {
      // Increment / get — ignore value here (outgoing get uses 0x7F)
      this.pending = null;
    }
    return events;
  }

  reset(): void {
    this.pending = null;
    this.lastBank = null;
  }
}
