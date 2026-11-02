/**
 * Read-only Allen & Heath SQ-5 MIDI-over-TCP client.
 * Only transmits documented NRPN "get" queries — never mute/level/scene control.
 *
 * Transport health: TCP keepalive alone does not detect Ethernet blackholes quickly.
 * This client optionally runs an application-level health monitor that issues a
 * documented mute "get" and requires any inbound MIDI before the response deadline.
 */
import net from "node:net";
import {
  defaultMicTallyHealthClock,
  MIC_TALLY_HEALTH_INTERVAL_MS,
  MIC_TALLY_HEALTH_TIMEOUT_MS,
  type MicTallyHealthClock,
} from "./mic-tally-connection-health";
import {
  buildLevelToLrGetRequest,
  buildMuteGetRequest,
  type ParsedSqMidiEvent,
} from "./sq-midi-protocol";
import { MidiStreamParser, SqNrpnAssembler } from "./midi-stream-parser";

export type Sq5TcpClientOptions = {
  host: string;
  port: number;
  midiChannel: number;
  onEvent: (event: ParsedSqMidiEvent) => void;
  onConnectionChange: (connected: boolean, detail: string) => void;
  onRawActivity?: (info: {
    direction: "in" | "out";
    byteLength: number;
    at: string;
    kind?: "midi" | "health-query" | "health-response";
  }) => void;
  /** Fired when the health monitor declares the mixer unreachable (blackhole / timeout). */
  onHealthFailure?: (detail: string) => void;
  /** Fired when a health query receives inbound MIDI within the deadline. */
  onHealthSuccess?: (info: { at: string; latencyMs: number }) => void;
  clock?: MicTallyHealthClock;
  healthIntervalMs?: number;
  healthTimeoutMs?: number;
};

export class Sq5TcpClient {
  private socket: net.Socket | null = null;
  private readonly parser = new MidiStreamParser();
  private readonly assembler = new SqNrpnAssembler();
  private intentionalClose = false;
  private healthTimer: unknown = null;
  private healthDeadlineTimer: unknown = null;
  private healthPendingSinceMs: number | null = null;
  private healthChannel = 1;
  private healthEnabled = false;
  private readonly clock: MicTallyHealthClock;
  private readonly healthIntervalMs: number;
  private readonly healthTimeoutMs: number;
  private lastInboundAtMs: number | null = null;
  private readonly options: Sq5TcpClientOptions;

  constructor(options: Sq5TcpClientOptions) {
    this.options = options;
    this.clock = options.clock ?? defaultMicTallyHealthClock;
    this.healthIntervalMs = options.healthIntervalMs ?? MIC_TALLY_HEALTH_INTERVAL_MS;
    this.healthTimeoutMs = options.healthTimeoutMs ?? MIC_TALLY_HEALTH_TIMEOUT_MS;
  }

  get connected(): boolean {
    return this.socket != null && !this.socket.destroyed && (this.socket as net.Socket).readable;
  }

  get lastInboundAt(): number | null {
    return this.lastInboundAtMs;
  }

  connect(): Promise<void> {
    // disconnect() marks intentionalClose; clear it after teardown so peer closes notify.
    this.disconnect();
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      const socket = net.connect(
        { host: this.options.host, port: this.options.port },
        () => {
          this.options.onConnectionChange(true, "TCP connected");
          resolve();
        },
      );
      this.socket = socket;
      // Short initial delay — still OS-dependent for probe interval/count; not sufficient alone.
      socket.setKeepAlive(true, 1_000);
      try {
        socket.setNoDelay(true);
      } catch {
        /* ignore */
      }
      socket.on("data", (buf) => this.handleInbound(buf));
      socket.on("error", (err) => {
        this.stopHealthMonitor();
        this.options.onConnectionChange(false, err.message);
        if (!socket.destroyed) socket.destroy();
      });
      socket.on("close", () => {
        this.stopHealthMonitor();
        this.socket = null;
        this.parser.reset();
        this.assembler.reset();
        if (!this.intentionalClose) {
          this.options.onConnectionChange(false, "TCP closed");
        }
      });
      socket.once("error", (err) => {
        reject(err);
      });
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHealthMonitor();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.parser.reset();
    this.assembler.reset();
  }

  /**
   * Start periodic read-only mute GET health checks.
   * `inputChannel` should be an assigned Mic Tally slot when available (else Input 1).
   */
  startHealthMonitor(inputChannel: number): void {
    this.healthChannel = Math.max(1, Math.min(48, Math.floor(inputChannel) || 1));
    this.healthEnabled = true;
    this.stopHealthTimersOnly();
    // First probe shortly after connect/sync so detection isn't delayed a full interval.
    this.healthTimer = this.clock.setTimeout(() => {
      this.tickHealth();
      this.healthTimer = this.clock.setInterval(() => this.tickHealth(), this.healthIntervalMs);
    }, Math.min(500, this.healthIntervalMs));
  }

  stopHealthMonitor(): void {
    this.healthEnabled = false;
    this.stopHealthTimersOnly();
    this.healthPendingSinceMs = null;
  }

  /** Send documented get queries for mute + LR level for each watched input. */
  requestChannelState(inputChannels: number[]): void {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    const chunks: number[] = [];
    for (const input of inputChannels) {
      chunks.push(...buildMuteGetRequest(this.options.midiChannel, input));
      chunks.push(...buildLevelToLrGetRequest(this.options.midiChannel, input));
    }
    if (chunks.length === 0) return;
    this.writeOutbound(Buffer.from(chunks), "midi");
  }

  /** Test helper — force a single health query now. */
  sendHealthQueryForTests(): void {
    this.sendHealthQuery();
  }

  private handleInbound(buf: Buffer): void {
    const atMs = this.clock.now();
    this.lastInboundAtMs = atMs;
    const at = new Date(atMs).toISOString();
    const wasPending = this.healthPendingSinceMs != null;
    if (wasPending) {
      const latencyMs = atMs - (this.healthPendingSinceMs as number);
      this.clearHealthDeadline();
      this.healthPendingSinceMs = null;
      this.options.onRawActivity?.({
        direction: "in",
        byteLength: buf.length,
        at,
        kind: "health-response",
      });
      this.options.onHealthSuccess?.({ at, latencyMs });
    } else {
      this.options.onRawActivity?.({
        direction: "in",
        byteLength: buf.length,
        at,
        kind: "midi",
      });
    }

    const messages = this.parser.push(buf);
    for (const message of messages) {
      for (const event of this.assembler.push(message)) {
        this.options.onEvent(event);
      }
    }
  }

  private tickHealth(): void {
    if (!this.healthEnabled || !this.connected) return;
    if (this.healthPendingSinceMs != null) return;
    this.sendHealthQuery();
  }

  private sendHealthQuery(): void {
    if (!this.socket || this.socket.destroyed) return;
    const bytes = Buffer.from(
      buildMuteGetRequest(this.options.midiChannel, this.healthChannel),
    );
    const atMs = this.clock.now();
    this.healthPendingSinceMs = atMs;
    this.writeOutbound(bytes, "health-query");
    this.clearHealthDeadline();
    this.healthDeadlineTimer = this.clock.setTimeout(() => {
      if (this.healthPendingSinceMs == null) return;
      const detail = `Mixer health-check timeout after ${this.healthTimeoutMs}ms (no MIDI response to mute get on Input ${this.healthChannel})`;
      this.healthPendingSinceMs = null;
      this.stopHealthMonitor();
      // Suppress close→onConnectionChange so health failure is reported once.
      this.intentionalClose = true;
      this.options.onHealthFailure?.(detail);
      if (this.socket && !this.socket.destroyed) {
        this.socket.destroy();
      }
      this.socket = null;
      this.parser.reset();
      this.assembler.reset();
    }, this.healthTimeoutMs);
  }

  private writeOutbound(
    buf: Buffer,
    kind: "midi" | "health-query",
  ): void {
    if (!this.socket || this.socket.destroyed) return;
    this.socket.write(buf);
    this.options.onRawActivity?.({
      direction: "out",
      byteLength: buf.length,
      at: new Date(this.clock.now()).toISOString(),
      kind,
    });
  }

  private stopHealthTimersOnly(): void {
    if (this.healthTimer != null) {
      this.clock.clearTimeout(this.healthTimer);
      this.clock.clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.clearHealthDeadline();
  }

  private clearHealthDeadline(): void {
    if (this.healthDeadlineTimer != null) {
      this.clock.clearTimeout(this.healthDeadlineTimer);
      this.healthDeadlineTimer = null;
    }
  }
}
