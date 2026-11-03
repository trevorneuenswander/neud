import type { LocalDatabase } from "../../database/connection";
import {
  hashMicTallyContent,
  type MicTallyDisplayPayload,
  type MicTallySlotPayload,
} from "./canonical-mic-tally";
import {
  isMicTallyTransportLive,
  MIC_TALLY_HEALTH_INTERVAL_MS,
  MIC_TALLY_HEALTH_TIMEOUT_MS,
} from "./mic-tally-connection-health";
import { Sq5TcpClient } from "./sq5-tcp-client";
import {
  SQ_DEFAULT_MIXER_MIDI_CHANNEL,
  SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
  SQ_MIDI_TCP_PORT,
  SQ5_INPUT_CHANNEL_COUNT,
  level14ToNormalized,
  type ParsedSqMidiEvent,
} from "./sq-midi-protocol";
import {
  assertUniqueSlotChannels,
  displayLabelForChannel,
  resolveTallyStatus,
  type ChannelFieldConfidence,
  type MicTallyStatus,
} from "./tally-state";

export type MicTallyConnectionMode = "live" | "simulation";

export type MicTallyConfigUpdate = {
  mixerHost?: string;
  mixerPort?: number;
  midiChannel?: number;
  simulationEnabled?: boolean;
  autoConnect?: boolean;
  slot1InputChannel?: number | null;
  slot2InputChannel?: number | null;
  slot3InputChannel?: number | null;
  slot1LabelOverride?: string | null;
  slot2LabelOverride?: string | null;
  slot3LabelOverride?: string | null;
  faderThreshold14?: number;
  freshnessTimeoutMs?: number;
  reconnectEnabled?: boolean;
};

type ChannelRuntime = {
  muted: boolean | null;
  muteConfidence: ChannelFieldConfidence;
  fader14: number | null;
  faderNormalized: number | null;
  faderConfidence: ChannelFieldConfidence;
  lastMuteAt: string | null;
  lastFaderAt: string | null;
  lastUpdateAt: string | null;
};

type DiagnosticEntry = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

type PersistedRow = {
  project_id: string;
  mixer_host: string;
  mixer_port: number;
  midi_channel: number;
  simulation_enabled: number;
  auto_connect: number;
  slot1_input_channel: number | null;
  slot2_input_channel: number | null;
  slot3_input_channel: number | null;
  slot1_label_override: string | null;
  slot2_label_override: string | null;
  slot3_label_override: string | null;
  fader_threshold_14: number;
  freshness_timeout_ms: number;
  reconnect_enabled: number;
  connection_status: string;
  last_message_at: string | null;
  last_sync_at: string | null;
  last_scene_at: string | null;
  last_scene_number: number | null;
  last_error: string | null;
  last_health_response_at: string | null;
  last_health_query_at: string | null;
  reconnect_attempt_count: number;
  channel_state_json: string;
  diagnostics_json: string;
  state_revision: number;
  updated_at: string;
};

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export class MicTallyService {
  private clients = new Map<string, Sq5TcpClient>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private reconnectAttempts = new Map<string, number>();
  /** Operator wants to stay connected (Connect); cleared by manual Disconnect. */
  private autoReconnectDesired = new Map<string, boolean>();
  private onChange:
    | ((event: { projectId: string; revision: number; contentHash: string }) => void)
    | null = null;

  constructor(private readonly db: LocalDatabase) {}

  setChangeHandler(
    handler: ((event: { projectId: string; revision: number; contentHash: string }) => void) | null,
  ): void {
    this.onChange = handler;
  }

  ensureStateRow(projectId: string): void {
    const existing = this.getRow(projectId);
    if (existing) return;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mic_tally_state (
          project_id, mixer_host, mixer_port, midi_channel, updated_at
        ) VALUES (?, '', ?, ?, ?)`,
      )
      .run(projectId, SQ_MIDI_TCP_PORT, SQ_DEFAULT_MIXER_MIDI_CHANNEL, now);
  }

  getOperatorState(projectId: string): Record<string, unknown> {
    this.ensureStateRow(projectId);
    const row = this.getRow(projectId)!;
    const payload = this.toDisplayPayload(projectId);
    return {
      ...payload,
      mixerHost: row.mixer_host,
      mixerPort: row.mixer_port,
      midiChannel: row.midi_channel,
      simulationEnabled: row.simulation_enabled === 1,
      autoConnect: row.auto_connect === 1,
      reconnectEnabled: row.reconnect_enabled === 1,
      freshnessTimeoutMs: row.freshness_timeout_ms,
      // Runtime-gated: never report Connected without a verified live socket.
      connectionStatus: this.effectiveConnectionStatus(projectId, row),
      lastError: row.last_error,
      inputChannelOptions: Array.from({ length: SQ5_INPUT_CHANNEL_COUNT }, (_, i) => ({
        value: i + 1,
        label: `Input ${i + 1}`,
      })),
      // Diagnostic timestamps — idle MIDI silence does not invalidate channel status.
      lastMidiReceivedAt: row.last_message_at,
      lastHealthResponseAt: row.last_health_response_at ?? null,
      lastHealthQueryAt: row.last_health_query_at ?? null,
      lastStateUpdateAt: this.latestChannelUpdateAt(row),
      lastSyncAt: row.last_sync_at,
      reconnectAttemptCount:
        row.reconnect_attempt_count ?? this.reconnectAttempts.get(projectId) ?? 0,
      autoReconnectDesired: this.autoReconnectDesired.get(projectId) === true,
      healthCheck: {
        intervalMs: MIC_TALLY_HEALTH_INTERVAL_MS,
        timeoutMs: MIC_TALLY_HEALTH_TIMEOUT_MS,
        mechanism: "nrpn-mute-get",
      },
      diagnostics: this.readDiagnostics(row),
      protocolNotes: {
        tcpPortDefault: SQ_MIDI_TCP_PORT,
        channelNamesViaMidi: false,
        readOnlyGetsAllowed: true,
        sceneRefreshStrategy: "invalidate-then-get",
        stateRetention: "retain-known-while-connected",
        connectionHealth:
          "Application mute-get health check + TCP keepalive; idle MIDI silence is not disconnect",
        documentation: [
          "https://www.allen-heath.com/content/uploads/2023/11/SQ-MIDI-Protocol-Issue5.pdf",
          "https://support.allen-heath.com/hc/en-gb/articles/47793519540497-SQ-MIDI-Protocol-Firmware-V1-6",
        ],
      },
    };
  }

  updateConfig(projectId: string, patch: MicTallyConfigUpdate): Record<string, unknown> {
    this.ensureStateRow(projectId);
    const row = this.getRow(projectId)!;
    const next = {
      mixerHost: patch.mixerHost ?? row.mixer_host,
      mixerPort: patch.mixerPort ?? row.mixer_port,
      midiChannel: patch.midiChannel ?? row.midi_channel,
      simulationEnabled:
        patch.simulationEnabled != null
          ? patch.simulationEnabled
            ? 1
            : 0
          : row.simulation_enabled,
      autoConnect:
        patch.autoConnect != null ? (patch.autoConnect ? 1 : 0) : row.auto_connect,
      slot1: patch.slot1InputChannel !== undefined ? patch.slot1InputChannel : row.slot1_input_channel,
      slot2: patch.slot2InputChannel !== undefined ? patch.slot2InputChannel : row.slot2_input_channel,
      slot3: patch.slot3InputChannel !== undefined ? patch.slot3InputChannel : row.slot3_input_channel,
      label1:
        patch.slot1LabelOverride !== undefined
          ? patch.slot1LabelOverride
          : row.slot1_label_override,
      label2:
        patch.slot2LabelOverride !== undefined
          ? patch.slot2LabelOverride
          : row.slot2_label_override,
      label3:
        patch.slot3LabelOverride !== undefined
          ? patch.slot3LabelOverride
          : row.slot3_label_override,
      faderThreshold14: patch.faderThreshold14 ?? row.fader_threshold_14,
      freshnessTimeoutMs: patch.freshnessTimeoutMs ?? row.freshness_timeout_ms,
      reconnectEnabled:
        patch.reconnectEnabled != null
          ? patch.reconnectEnabled
            ? 1
            : 0
          : row.reconnect_enabled,
    };

    this.validateHostPort(next.mixerHost, next.mixerPort);
    this.validateMidiChannel(next.midiChannel);
    for (const ch of [next.slot1, next.slot2, next.slot3]) {
      if (ch != null) this.validateInputChannel(ch);
    }
    const unique = assertUniqueSlotChannels([
      { slot: 1, inputChannel: next.slot1 },
      { slot: 2, inputChannel: next.slot2 },
      { slot: 3, inputChannel: next.slot3 },
    ]);
    if (!unique.ok) {
      throw new Error(unique.error);
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE mic_tally_state SET
          mixer_host = ?, mixer_port = ?, midi_channel = ?,
          simulation_enabled = ?, auto_connect = ?,
          slot1_input_channel = ?, slot2_input_channel = ?, slot3_input_channel = ?,
          slot1_label_override = ?, slot2_label_override = ?, slot3_label_override = ?,
          fader_threshold_14 = ?, freshness_timeout_ms = ?, reconnect_enabled = ?,
          state_revision = state_revision + 1, updated_at = ?
        WHERE project_id = ?`,
      )
      .run(
        next.mixerHost.trim(),
        next.mixerPort,
        next.midiChannel,
        next.simulationEnabled,
        next.autoConnect,
        next.slot1,
        next.slot2,
        next.slot3,
        next.label1,
        next.label2,
        next.label3,
        next.faderThreshold14,
        next.freshnessTimeoutMs,
        next.reconnectEnabled,
        now,
        projectId,
      );

    this.pushDiagnostic(projectId, "info", "Configuration updated");
    this.publish(projectId);
    return this.getOperatorState(projectId);
  }

  async connect(projectId: string): Promise<Record<string, unknown>> {
    this.ensureStateRow(projectId);
    const row = this.getRow(projectId)!;
    if (row.simulation_enabled === 1) {
      throw new Error("Disable simulation mode before connecting to the SQ-5.");
    }
    this.validateHostPort(row.mixer_host, row.mixer_port);
    this.autoReconnectDesired.set(projectId, true);
    this.clearReconnect(projectId);
    this.disconnectSocket(projectId);
    this.setConnectionStatus(projectId, "connecting", "Connecting…");
    const client = new Sq5TcpClient({
      host: row.mixer_host.trim(),
      port: row.mixer_port,
      midiChannel: row.midi_channel,
      onEvent: (event) => this.handleMixerEvent(projectId, event),
      onConnectionChange: (connected, detail) => {
        if (connected) {
          this.reconnectAttempts.set(projectId, 0);
          this.setReconnectAttemptCount(projectId, 0);
          this.setConnectionStatus(projectId, "connected", null);
          this.pushDiagnostic(projectId, "info", detail);
          this.syncSelectedChannels(projectId);
          this.startClientHealthMonitor(projectId, client);
          this.publish(projectId);
        } else {
          this.handleTransportLoss(projectId, detail);
        }
      },
      onHealthFailure: (detail) => {
        this.handleTransportLoss(projectId, detail);
      },
      onHealthSuccess: (info) => {
        this.db
          .prepare(
            `UPDATE mic_tally_state SET last_health_response_at = ?, last_message_at = ? WHERE project_id = ?`,
          )
          .run(info.at, info.at, projectId);
      },
      onRawActivity: (info) => {
        if (info.direction === "out" && info.kind === "health-query") {
          this.db
            .prepare(`UPDATE mic_tally_state SET last_health_query_at = ? WHERE project_id = ?`)
            .run(info.at, projectId);
          return;
        }
        if (info.direction === "in") {
          this.db
            .prepare(`UPDATE mic_tally_state SET last_message_at = ? WHERE project_id = ?`)
            .run(info.at, projectId);
        }
      },
    });
    this.clients.set(projectId, client);
    try {
      await client.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.handleTransportLoss(projectId, message);
      throw error;
    }
    return this.getOperatorState(projectId);
  }

  disconnect(projectId: string): Record<string, unknown> {
    // Manual disconnect — do not auto-reconnect until Connect is clicked again.
    this.autoReconnectDesired.set(projectId, false);
    this.clearReconnect(projectId);
    this.disconnectSocket(projectId);
    this.invalidateAllChannels(projectId);
    this.setConnectionStatus(projectId, "disconnected", null);
    this.pushDiagnostic(projectId, "info", "Disconnected (manual)");
    this.publish(projectId);
    return this.getOperatorState(projectId);
  }

  async reconnect(projectId: string): Promise<Record<string, unknown>> {
    this.autoReconnectDesired.set(projectId, true);
    this.clearReconnect(projectId);
    this.disconnectSocket(projectId);
    this.invalidateAllChannels(projectId);
    return this.connect(projectId);
  }

  simulate(
    projectId: string,
    action: {
      type:
        | "enable"
        | "disable"
        | "mute"
        | "fader"
        | "scene"
        | "disconnect"
        | "unknown";
      slot?: 1 | 2 | 3;
      muted?: boolean;
      fader14?: number;
      sceneNumber?: number;
    },
  ): Record<string, unknown> {
    this.ensureStateRow(projectId);
    if (action.type === "enable") {
      this.disconnectSocket(projectId);
      this.clearReconnect(projectId);
      this.db
        .prepare(
          `UPDATE mic_tally_state SET simulation_enabled = 1, connection_status = 'simulation', last_error = NULL, state_revision = state_revision + 1, updated_at = ? WHERE project_id = ?`,
        )
        .run(new Date().toISOString(), projectId);
      this.pushDiagnostic(projectId, "info", "Simulation mode enabled");
      this.publish(projectId);
      return this.getOperatorState(projectId);
    }
    if (action.type === "disable") {
      this.db
        .prepare(
          `UPDATE mic_tally_state SET simulation_enabled = 0, connection_status = 'disconnected', state_revision = state_revision + 1, updated_at = ? WHERE project_id = ?`,
        )
        .run(new Date().toISOString(), projectId);
      this.invalidateAllChannels(projectId);
      this.pushDiagnostic(projectId, "info", "Simulation mode disabled");
      this.publish(projectId);
      return this.getOperatorState(projectId);
    }

    const row = this.getRow(projectId)!;
    if (row.simulation_enabled !== 1) {
      throw new Error("Enable simulation mode first.");
    }

    if (action.type === "disconnect") {
      this.invalidateAllChannels(projectId);
      this.setConnectionStatus(projectId, "simulation-disconnected", "Simulated disconnect");
      this.publish(projectId);
      return this.getOperatorState(projectId);
    }
    if (action.type === "scene") {
      this.invalidateAllChannels(projectId);
      const now = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE mic_tally_state SET last_scene_at = ?, last_scene_number = ?, connection_status = 'simulation', last_error = NULL WHERE project_id = ?`,
        )
        .run(now, action.sceneNumber ?? 1, projectId);
      this.pushDiagnostic(
        projectId,
        "info",
        `Simulated scene recall ${action.sceneNumber ?? 1} — state invalidated`,
      );
      this.publish(projectId);
      return this.getOperatorState(projectId);
    }
    if (action.type === "unknown") {
      this.invalidateAllChannels(projectId);
      this.publish(projectId);
      return this.getOperatorState(projectId);
    }

    const slot = action.slot ?? 1;
    const input = this.slotInput(row, slot);
    if (input == null) {
      throw new Error(`Mic Slot ${slot} has no input channel assigned.`);
    }
    if (action.type === "mute" && action.muted != null) {
      this.applyMute(projectId, input, action.muted);
    }
    if (action.type === "fader" && action.fader14 != null) {
      this.applyFader(projectId, input, action.fader14);
    }
    this.setConnectionStatus(projectId, "simulation", null);
    this.publish(projectId);
    return this.getOperatorState(projectId);
  }

  toDisplayPayload(projectId: string): MicTallyDisplayPayload {
    this.ensureStateRow(projectId);
    const row = this.getRow(projectId)!;
    const simulation = row.simulation_enabled === 1;
    // Live SQ-5 transport requires a verified in-process socket. Persisted
    // connection_status alone must never present stale LIVE/MUTED as connected.
    const connected = this.isTransportLiveForProject(projectId, row);
    const slots: MicTallySlotPayload[] = [1, 2, 3].map((slot) => {
      const inputChannel = this.slotInput(row, slot as 1 | 2 | 3);
      const override = this.slotLabel(row, slot as 1 | 2 | 3);
      const runtime = inputChannel != null ? this.readChannelRuntime(row, inputChannel) : null;
      const labelInfo = displayLabelForChannel({
        inputChannel: inputChannel ?? slot,
        mixerName: null,
        labelOverride: override,
      });
      const status: MicTallyStatus = resolveTallyStatus({
        connected,
        muted: runtime?.muted ?? null,
        muteConfidence: runtime?.muteConfidence ?? "unknown",
        fader14: runtime?.fader14 ?? null,
        faderConfidence: runtime?.faderConfidence ?? "unknown",
        faderThreshold14: row.fader_threshold_14 || SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
        nowMs: Date.now(),
        lastUpdateMs: runtime?.lastUpdateAt ? Date.parse(runtime.lastUpdateAt) : null,
        freshnessTimeoutMs: row.freshness_timeout_ms,
      });
      return {
        slot: slot as 1 | 2 | 3,
        inputChannel,
        label: labelInfo.label,
        labelSource: labelInfo.labelSource,
        muted: runtime?.muted ?? null,
        fader14: runtime?.fader14 ?? null,
        faderNormalized: runtime?.faderNormalized ?? null,
        status,
        lastUpdateAt: runtime?.lastUpdateAt ?? null,
      };
    });

    const base = {
      dataSource: "mic-tally" as const,
      manufacturer: "Allen & Heath" as const,
      model: "SQ-5" as const,
      connectionMode: (!connected
        ? "disconnected"
        : simulation
          ? "simulation"
          : "live") as MicTallyDisplayPayload["connectionMode"],
      connected,
      simulation,
      updatedAt: row.updated_at,
      revision: row.state_revision,
      faderThreshold14: row.fader_threshold_14,
      slots,
      diagnostics: {
        lastMessageAt: row.last_message_at,
        lastSyncAt: row.last_sync_at,
        lastSceneAt: row.last_scene_at,
        lastSceneNumber: row.last_scene_number,
        lastError: row.last_error,
      },
    };
    return {
      ...base,
      contentHash: hashMicTallyContent(base),
    };
  }

  /**
   * Application quit / process teardown.
   * Closes sockets, stops reconnect/health timers, invalidates live channel
   * confidence, and persists Disconnected — silently (no UI prompts).
   */
  shutdown(): void {
    const projectIds = new Set<string>([
      ...this.clients.keys(),
      ...this.reconnectTimers.keys(),
      ...this.listProjectIdsWithTransientTransport(),
    ]);
    for (const projectId of projectIds) {
      this.markProcessDisconnected(projectId, "Application exit");
    }
  }

  /**
   * Fresh process launch: connection status is transient runtime state.
   * Never restore Connected / Connecting / Reconnecting from SQLite.
   * Preserves host/port/slots/labels/auto_connect settings and simulation mode.
   * Does not start auto-connect (column exists but launch auto-connect is not wired).
   */
  reconcileStaleTransportOnStartup(): void {
    for (const projectId of this.listProjectIdsWithTransientTransport()) {
      this.markProcessDisconnected(projectId, "Startup — no live SQ-5 session");
    }
  }

  private handleMixerEvent(projectId: string, event: ParsedSqMidiEvent): void {
    if (event.type === "ignored") return;
    if (event.type === "scene") {
      this.invalidateAllChannels(projectId);
      const now = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE mic_tally_state SET last_scene_at = ?, last_scene_number = ?, last_message_at = ? WHERE project_id = ?`,
        )
        .run(now, event.sceneNumber, now, projectId);
      this.pushDiagnostic(
        projectId,
        "warn",
        `Scene ${event.sceneNumber} recalled — refreshing selected channels`,
      );
      this.syncSelectedChannels(projectId);
      this.publish(projectId);
      return;
    }
    if (event.type === "mute" && event.inputChannel != null) {
      this.applyMute(projectId, event.inputChannel, event.muted);
      this.publish(projectId);
      return;
    }
    if (event.type === "level" && event.inputChannel != null) {
      this.applyFader(projectId, event.inputChannel, event.value14);
      this.publish(projectId);
    }
  }

  private syncSelectedChannels(projectId: string): void {
    const row = this.getRow(projectId);
    const client = this.clients.get(projectId);
    if (!row || !client) return;
    const channels = [row.slot1_input_channel, row.slot2_input_channel, row.slot3_input_channel]
      .filter((v): v is number => typeof v === "number");
    if (channels.length === 0) return;
    // Invalidate before refresh so stale LIVE cannot linger during sync.
    for (const ch of channels) {
      this.invalidateChannel(projectId, ch);
    }
    client.requestChannelState(channels);
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE mic_tally_state SET last_sync_at = ? WHERE project_id = ?`)
      .run(now, projectId);
    this.pushDiagnostic(projectId, "info", `Requested state for inputs ${channels.join(", ")}`);
  }

  private applyMute(projectId: string, inputChannel: number, muted: boolean): void {
    const row = this.getRow(projectId)!;
    const map = this.readChannelMap(row);
    const prev = map[String(inputChannel)] ?? emptyRuntime();
    const now = new Date().toISOString();
    map[String(inputChannel)] = {
      ...prev,
      muted,
      muteConfidence: "known",
      lastMuteAt: now,
      lastUpdateAt: now,
    };
    this.writeChannelMap(projectId, map, now);
  }

  private applyFader(projectId: string, inputChannel: number, fader14: number): void {
    const row = this.getRow(projectId)!;
    const map = this.readChannelMap(row);
    const prev = map[String(inputChannel)] ?? emptyRuntime();
    const now = new Date().toISOString();
    map[String(inputChannel)] = {
      ...prev,
      fader14,
      faderNormalized: level14ToNormalized(fader14),
      faderConfidence: "known",
      lastFaderAt: now,
      lastUpdateAt: now,
    };
    this.writeChannelMap(projectId, map, now);
  }

  private invalidateAllChannels(projectId: string): void {
    const row = this.getRow(projectId);
    if (!row) return;
    const map = this.readChannelMap(row);
    for (const key of Object.keys(map)) {
      map[key] = {
        ...map[key]!,
        muted: null,
        muteConfidence: "unknown",
        fader14: null,
        faderNormalized: null,
        faderConfidence: "unknown",
      };
    }
    this.writeChannelMap(projectId, map, new Date().toISOString());
  }

  private invalidateChannel(projectId: string, inputChannel: number): void {
    const row = this.getRow(projectId)!;
    const map = this.readChannelMap(row);
    const prev = map[String(inputChannel)] ?? emptyRuntime();
    map[String(inputChannel)] = {
      ...prev,
      muted: null,
      muteConfidence: "unknown",
      fader14: null,
      faderNormalized: null,
      faderConfidence: "unknown",
    };
    this.writeChannelMap(projectId, map, new Date().toISOString());
  }

  /**
   * Confirmed transport failure (socket close/error or health-check timeout).
   * Invalidates channel confidence immediately so the graphic cannot linger on LIVE.
   */
  private handleTransportLoss(projectId: string, detail: string): void {
    this.disconnectSocket(projectId);
    this.invalidateAllChannels(projectId);
    const wantReconnect =
      this.autoReconnectDesired.get(projectId) === true &&
      this.getRow(projectId)?.reconnect_enabled === 1 &&
      this.getRow(projectId)?.simulation_enabled !== 1;
    this.setConnectionStatus(
      projectId,
      wantReconnect ? "connection-lost" : "disconnected",
      detail,
    );
    this.pushDiagnostic(projectId, "error", detail);
    this.publish(projectId);
    if (wantReconnect) {
      this.scheduleReconnect(projectId);
    }
  }

  /**
   * Quiet process-boundary disconnect: stop timers/sockets, invalidate live
   * mic confidence, persist disconnected. Skips simulation-mode rows.
   */
  private markProcessDisconnected(projectId: string, reason: string): void {
    const row = this.getRow(projectId);
    if (!row) return;
    if (row.simulation_enabled === 1) {
      // Simulation has no TCP session; leave simulation status alone but still
      // drop any in-memory reconnect desire leftover from a prior live attempt.
      this.autoReconnectDesired.set(projectId, false);
      this.clearReconnect(projectId);
      this.disconnectSocket(projectId);
      return;
    }
    this.autoReconnectDesired.set(projectId, false);
    this.clearReconnect(projectId);
    this.disconnectSocket(projectId);
    this.invalidateAllChannels(projectId);
    this.setReconnectAttemptCount(projectId, 0);
    this.setConnectionStatus(projectId, "disconnected", null);
    this.pushDiagnostic(projectId, "info", reason);
    this.publish(projectId);
  }

  private listProjectIdsWithTransientTransport(): string[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT project_id FROM mic_tally_state
           WHERE simulation_enabled = 0
             AND connection_status IN (
               'connected', 'connecting', 'reconnecting', 'connection-lost'
             )`,
        )
        .all() as Array<{ project_id: string }>;
      return rows.map((r) => r.project_id);
    } catch {
      return [];
    }
  }

  private isTransportLiveForProject(projectId: string, row: PersistedRow): boolean {
    if (!isMicTallyTransportLive(row.connection_status)) {
      return false;
    }
    if (row.simulation_enabled === 1) {
      return row.connection_status === "simulation";
    }
    const client = this.clients.get(projectId);
    return client?.connected === true;
  }

  private effectiveConnectionStatus(projectId: string, row: PersistedRow): string {
    if (row.simulation_enabled === 1) {
      return row.connection_status;
    }
    // Only "connected" requires a verified live socket. Transitional statuses
    // (connecting / reconnecting / connection-lost) remain valid in-process;
    // startup reconcile clears them after a process boundary.
    if (row.connection_status === "connected") {
      const client = this.clients.get(projectId);
      return client?.connected === true ? "connected" : "disconnected";
    }
    return row.connection_status;
  }

  private scheduleReconnect(projectId: string): void {
    this.clearReconnect(projectId);
    const attempt = (this.reconnectAttempts.get(projectId) ?? 0) + 1;
    this.reconnectAttempts.set(projectId, attempt);
    this.setReconnectAttemptCount(projectId, attempt);
    this.setConnectionStatus(projectId, "reconnecting", `Reconnect attempt ${attempt}`);
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
    const timer = setTimeout(() => {
      void this.connect(projectId).catch(() => {
        /* handleTransportLoss schedules next when auto-reconnect desired */
      });
    }, delay);
    this.reconnectTimers.set(projectId, timer);
    this.pushDiagnostic(
      projectId,
      "info",
      `Reconnect scheduled in ${delay}ms (attempt ${attempt})`,
    );
    this.publish(projectId);
  }

  private clearReconnect(projectId: string): void {
    const timer = this.reconnectTimers.get(projectId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(projectId);
  }

  private disconnectSocket(projectId: string): void {
    const client = this.clients.get(projectId);
    if (client) {
      client.stopHealthMonitor();
      client.disconnect();
      this.clients.delete(projectId);
    }
  }

  private startClientHealthMonitor(projectId: string, client: Sq5TcpClient): void {
    const row = this.getRow(projectId);
    if (!row) return;
    const channel =
      row.slot1_input_channel ??
      row.slot2_input_channel ??
      row.slot3_input_channel ??
      1;
    client.startHealthMonitor(channel);
  }

  private setReconnectAttemptCount(projectId: string, count: number): void {
    try {
      this.db
        .prepare(`UPDATE mic_tally_state SET reconnect_attempt_count = ? WHERE project_id = ?`)
        .run(count, projectId);
    } catch {
      /* column may be absent before migration 050 — in-memory map still tracks attempts */
    }
  }

  private setConnectionStatus(
    projectId: string,
    status: string,
    error: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE mic_tally_state SET connection_status = ?, last_error = ?, state_revision = state_revision + 1, updated_at = ? WHERE project_id = ?`,
      )
      .run(status, error, new Date().toISOString(), projectId);
  }

  private publish(projectId: string): void {
    const payload = this.toDisplayPayload(projectId);
    this.onChange?.({
      projectId,
      revision: payload.revision,
      contentHash: payload.contentHash,
    });
  }

  private getRow(projectId: string): PersistedRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM mic_tally_state WHERE project_id = ?`)
        .all(projectId)[0] as PersistedRow | undefined) ?? null
    );
  }

  private slotInput(row: PersistedRow, slot: 1 | 2 | 3): number | null {
    if (slot === 1) return row.slot1_input_channel;
    if (slot === 2) return row.slot2_input_channel;
    return row.slot3_input_channel;
  }

  private slotLabel(row: PersistedRow, slot: 1 | 2 | 3): string | null {
    if (slot === 1) return row.slot1_label_override;
    if (slot === 2) return row.slot2_label_override;
    return row.slot3_label_override;
  }

  private readChannelMap(row: PersistedRow): Record<string, ChannelRuntime> {
    try {
      const parsed = JSON.parse(row.channel_state_json || "{}") as Record<string, ChannelRuntime>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private readChannelRuntime(row: PersistedRow, inputChannel: number): ChannelRuntime | null {
    return this.readChannelMap(row)[String(inputChannel)] ?? null;
  }

  private writeChannelMap(
    projectId: string,
    map: Record<string, ChannelRuntime>,
    updatedAt: string,
  ): void {
    this.db
      .prepare(
        `UPDATE mic_tally_state SET channel_state_json = ?, state_revision = state_revision + 1, updated_at = ? WHERE project_id = ?`,
      )
      .run(JSON.stringify(map), updatedAt, projectId);
  }

  private readDiagnostics(row: PersistedRow): DiagnosticEntry[] {
    try {
      const parsed = JSON.parse(row.diagnostics_json || "[]") as DiagnosticEntry[];
      return Array.isArray(parsed) ? parsed.slice(-40) : [];
    } catch {
      return [];
    }
  }

  private pushDiagnostic(
    projectId: string,
    level: DiagnosticEntry["level"],
    message: string,
  ): void {
    const row = this.getRow(projectId);
    if (!row) return;
    const list = this.readDiagnostics(row);
    list.push({ at: new Date().toISOString(), level, message });
    this.db
      .prepare(`UPDATE mic_tally_state SET diagnostics_json = ? WHERE project_id = ?`)
      .run(JSON.stringify(list.slice(-40)), projectId);
  }

  private latestChannelUpdateAt(row: PersistedRow): string | null {
    const map = this.readChannelMap(row);
    let latest: string | null = null;
    for (const runtime of Object.values(map)) {
      const at = runtime?.lastUpdateAt;
      if (!at) continue;
      if (!latest || at > latest) latest = at;
    }
    return latest;
  }

  private validateHostPort(host: string, port: number): void {
    const trimmed = host.trim();
    if (!trimmed) {
      throw new Error("Mixer IP address is required.");
    }
    if (!IPV4_RE.test(trimmed) && trimmed !== "localhost") {
      throw new Error("Mixer IP must be an IPv4 address (or localhost for lab use).");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("TCP port must be an integer between 1 and 65535.");
    }
  }

  private validateMidiChannel(channel: number): void {
    if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
      throw new Error("MIDI channel must be 1–16.");
    }
  }

  private validateInputChannel(channel: number): void {
    if (!Number.isInteger(channel) || channel < 1 || channel > SQ5_INPUT_CHANNEL_COUNT) {
      throw new Error(`Input channel must be 1–${SQ5_INPUT_CHANNEL_COUNT}.`);
    }
  }
}

function emptyRuntime(): ChannelRuntime {
  return {
    muted: null,
    muteConfidence: "unknown",
    fader14: null,
    faderNormalized: null,
    faderConfidence: "unknown",
    lastMuteAt: null,
    lastFaderAt: null,
    lastUpdateAt: null,
  };
}
