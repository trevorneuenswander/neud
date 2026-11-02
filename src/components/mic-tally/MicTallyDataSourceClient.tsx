"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/portal/PageHeader";
import {
  fetchMicTallyState,
  postMicTallyAction,
  type MicTallyOperatorState,
  type MicTallyStatus,
} from "@/graphics/mic-tally/mic-tally-api";

const REFRESH_MS = 2000;
/** Local-dev draft only — never a package/default install value. */
const LOCAL_DEV_TEST_HOST = "192.168.2.87";

function statusClass(status: MicTallyStatus): string {
  if (status === "LIVE") return "text-success";
  if (status === "MUTED" || status === "FADER_DOWN") return "text-danger";
  return "text-muted";
}

function connectionLabel(status: string | undefined, lastError?: string | null): string {
  if (lastError && (status === "disconnected" || status === "error" || !status)) {
    return "Error";
  }
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "connection-lost":
      return "Connection lost";
    case "reconnecting":
      return "Reconnecting…";
    case "error":
      return "Error";
    case "simulation":
      return "Connected (simulation)";
    case "simulation-disconnected":
      return "Simulation disconnected";
    case "disconnected":
      return "Disconnected";
    default:
      return status || "Disconnected";
  }
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function MicTallyDataSourceClient({
  projectSlug,
  projectId: _projectId,
  canManage,
}: {
  projectSlug: string;
  projectId: string;
  canManage: boolean;
}) {
  const [state, setState] = useState<MicTallyOperatorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(51325);
  const [midiChannel, setMidiChannel] = useState(1);
  const [threshold, setThreshold] = useState(10447);
  const [slotChannels, setSlotChannels] = useState<[number | "", number | "", number | ""]>([
    "",
    "",
    "",
  ]);
  const [slotLabels, setSlotLabels] = useState<[string, string, string]>(["", "", ""]);
  const [hostValidationError, setHostValidationError] = useState<string | null>(null);
  const formDirty = useRef(false);
  const busyRef = useRef(false);
  const hydratedOnce = useRef(false);
  const repairedDisplays = useRef(false);

  const applyServerForm = useCallback((next: MicTallyOperatorState) => {
    setHost(next.mixerHost ?? "");
    setPort(next.mixerPort ?? 51325);
    setMidiChannel(next.midiChannel ?? 1);
    setThreshold(next.faderThreshold14 ?? 10447);
    setSlotChannels([
      next.slots[0]?.inputChannel ?? "",
      next.slots[1]?.inputChannel ?? "",
      next.slots[2]?.inputChannel ?? "",
    ]);
    setSlotLabels([
      next.slots[0]?.labelSource === "override" ? next.slots[0].label : "",
      next.slots[1]?.labelSource === "override" ? next.slots[1].label : "",
      next.slots[2]?.labelSource === "override" ? next.slots[2].label : "",
    ]);
  }, []);

  const applyState = useCallback(
    (next: MicTallyOperatorState, forceForm = false) => {
      setState(next);
      if (forceForm || !formDirty.current) {
        formDirty.current = false;
        applyServerForm(next);
        // One-time local-dev draft when nothing is saved yet — does not persist until Save.
        if (
          !hydratedOnce.current &&
          !(next.mixerHost ?? "").trim() &&
          isLocalDevHost()
        ) {
          setHost(LOCAL_DEV_TEST_HOST);
          formDirty.current = true;
        }
        hydratedOnce.current = true;
      }
    },
    [applyServerForm],
  );

  const markDirty = useCallback(() => {
    formDirty.current = true;
  }, []);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const next = await fetchMicTallyState(projectSlug);
      applyState(next, false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [applyState, projectSlug]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (repairedDisplays.current) return;
    repairedDisplays.current = true;
    void postMicTallyAction(projectSlug, "repair-displays", {})
      .then((next) => applyState(next, false))
      .catch(() => {
        /* nonfatal — startup hydrate is primary */
      });
  }, [applyState, projectSlug]);

  async function run(action: string, body: Record<string, unknown> = {}): Promise<boolean> {
    if (!canManage) return false;
    setBusy(true);
    busyRef.current = true;
    try {
      const next = await postMicTallyAction(projectSlug, action, body);
      // Authoritative after save/connect — replace draft with persisted values.
      formDirty.current = false;
      applyState(next, true);
      setError(null);
      setHostValidationError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveConfig(): Promise<boolean> {
    const trimmed = host.trim();
    if (!trimmed) {
      setHostValidationError("Mixer IP address is required.");
      return false;
    }
    const ipv4 =
      /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
    if (!ipv4.test(trimmed) && trimmed !== "localhost") {
      setHostValidationError("Enter a valid IPv4 address (example: 192.168.2.87).");
      return false;
    }
    setHostValidationError(null);
    return run("config", {
      mixerHost: trimmed,
      mixerPort: Number(port),
      midiChannel: Number(midiChannel),
      faderThreshold14: Number(threshold),
      slot1InputChannel: slotChannels[0] === "" ? null : Number(slotChannels[0]),
      slot2InputChannel: slotChannels[1] === "" ? null : Number(slotChannels[1]),
      slot3InputChannel: slotChannels[2] === "" ? null : Number(slotChannels[2]),
      slot1LabelOverride: slotLabels[0].trim() || null,
      slot2LabelOverride: slotLabels[1].trim() || null,
      slot3LabelOverride: slotLabels[2].trim() || null,
    });
  }

  // Only "awaiting" when connected and a selected slot has never finished mute+fader sync.
  // Idle MIDI silence after sync must not surface this label (state retention).
  const awaitingChannelState =
    state?.connectionStatus === "connected" &&
    (state.slots ?? []).some(
      (slot) =>
        slot.inputChannel != null &&
        slot.status === "UNKNOWN" &&
        (slot.muted == null || slot.fader14 == null),
    );

  const lastMidiReceived = state?.lastMidiReceivedAt ?? null;
  const lastStateUpdate = state?.lastStateUpdateAt ?? null;
  const lastHealthResponse = state?.lastHealthResponseAt ?? null;
  const reconnectAttempts = state?.reconnectAttemptCount ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mic Tally Data Source"
        description="Allen & Heath SQ-5 MIDI-over-TCP monitoring (read-only)."
      />
      {state?.simulationEnabled ? (
        <Alert variant="info">
          Simulation mode active — does not connect to or control the physical mixer.
        </Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Mixer Connection
        </h2>
        <p className="text-sm text-muted">
          Manufacturer: Allen & Heath · Model: SQ-5 · Connection: Ethernet / TCP MIDI
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Mixer IP
            <input
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
              value={host}
              disabled={!canManage || busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                markDirty();
                setHost(e.target.value);
                setHostValidationError(null);
              }}
            />
          </label>
          <label className="text-sm">
            TCP port
            <input
              type="number"
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
              value={port}
              disabled={!canManage || busy}
              onChange={(e) => {
                markDirty();
                setPort(Number(e.target.value));
              }}
            />
          </label>
          <label className="text-sm">
            MIDI channel
            <input
              type="number"
              min={1}
              max={16}
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
              value={midiChannel}
              disabled={!canManage || busy}
              onChange={(e) => {
                markDirty();
                setMidiChannel(Number(e.target.value));
              }}
            />
          </label>
        </div>
        {hostValidationError ? (
          <p className="text-sm text-danger">{hostValidationError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canManage || busy} onClick={() => void saveConfig()}>
            Save settings
          </Button>
          <Button
            disabled={!canManage || busy}
            onClick={() => {
              void (async () => {
                const saved = await saveConfig();
                if (saved) await run("connect");
              })();
            }}
          >
            Connect
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("disconnect")}
          >
            Disconnect
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("reconnect")}
          >
            Reconnect
          </Button>
        </div>
        <p className="text-sm text-muted">
          Status:{" "}
          <span className="text-foreground">
            {connectionLabel(state?.connectionStatus, state?.lastError)}
            {awaitingChannelState ? " — awaiting channel state" : ""}
          </span>
          {state?.lastError ? ` · ${state.lastError}` : ""}
        </p>
        <p className="text-xs text-muted">
          Last mixer health response:{" "}
          {lastHealthResponse ? new Date(lastHealthResponse).toLocaleString() : "—"}
          {" · "}
          Last MIDI received: {lastMidiReceived ? new Date(lastMidiReceived).toLocaleString() : "—"}
          {" · "}
          Last channel-state update:{" "}
          {lastStateUpdate ? new Date(lastStateUpdate).toLocaleString() : "—"}
        </p>
        <p className="text-xs text-muted">
          Reconnect attempts: {reconnectAttempts}
          {state?.lastError ? ` · Last error: ${state.lastError}` : ""}
        </p>
        <p className="text-xs text-muted">
          Idle MIDI silence does not clear synchronized mute/fader state while the mixer remains
          reachable. Health checks use a read-only mute GET (~
          {state?.healthCheck?.intervalMs ?? 2000}
          ms); a missed response marks Connection lost and forces UNKNOWN.
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Channel Assignments
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((index) => {
            const slot = state?.slots[index];
            return (
              <div key={index} className="rounded-lg border border-border bg-surface-raised p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                  Mic Slot {index + 1}
                </p>
                <label className="mt-3 block text-sm">
                  SQ-5 input
                  <select
                    className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
                    value={slotChannels[index]}
                    disabled={!canManage || busy}
                    onChange={(e) => {
                      markDirty();
                      const next = [...slotChannels] as [
                        number | "",
                        number | "",
                        number | "",
                      ];
                      next[index] = e.target.value === "" ? "" : Number(e.target.value);
                      setSlotChannels(next);
                    }}
                  >
                    <option value="">Unassigned</option>
                    {(state?.inputChannelOptions ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-sm">
                  Custom label (optional)
                  <input
                    className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
                    value={slotLabels[index]}
                    disabled={!canManage || busy}
                    onChange={(e) => {
                      markDirty();
                      const next = [...slotLabels] as [string, string, string];
                      next[index] = e.target.value;
                      setSlotLabels(next);
                    }}
                    placeholder={slot?.label || `Input ${index + 1}`}
                  />
                </label>
                <p className="mt-3 text-sm">
                  Mute: {slot?.muted == null ? "—" : slot.muted ? "ON" : "OFF"}
                </p>
                <p className="text-sm">
                  Fader: {slot?.fader14 == null ? "—" : slot.fader14}
                </p>
                <p className={`text-sm font-semibold ${statusClass(slot?.status ?? "UNKNOWN")}`}>
                  {slot?.status ?? "UNKNOWN"}
                </p>
              </div>
            );
          })}
        </div>
        <Button disabled={!canManage || busy} onClick={() => void saveConfig()}>
          Save assignments
        </Button>
        <p className="text-xs text-muted">
          Channel names are not available over SQ MIDI. Labels are local NEUD overrides unless
          left blank (defaults to Input N).
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Tally Settings
        </h2>
        <label className="block text-sm">
          Fader-down threshold (14-bit linear taper). Default 10447 ≈ −40 dB (A&amp;H Issue 5
          table).
          <input
            type="number"
            className="mt-1 w-full max-w-xs rounded border border-border bg-surface px-3 py-2"
            value={threshold}
            disabled={!canManage || busy}
            onChange={(e) => {
              markDirty();
              setThreshold(Number(e.target.value));
            }}
          />
        </label>
        <p className="text-sm text-muted">
          LIVE requires confirmed unmuted and fader above threshold. Missing fields stay UNKNOWN
          until synchronized. Idle silence does not expire known state.
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Simulation
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "enable" })}
          >
            Enable simulation
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "disable" })}
          >
            Disable simulation
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "mute", slot: 1, muted: true })}
          >
            Slot 1 mute ON
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "mute", slot: 1, muted: false })}
          >
            Slot 1 mute OFF
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "fader", slot: 1, fader14: 14000 })}
          >
            Slot 1 fader up
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "fader", slot: 1, fader14: 0 })}
          >
            Slot 1 fader down
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "scene", sceneNumber: 7 })}
          >
            Simulate scene
          </Button>
          <Button
            disabled={!canManage || busy}
            variant="secondary"
            onClick={() => void run("simulate", { type: "unknown" })}
          >
            Force UNKNOWN
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Diagnostics
        </h2>
        <ul className="max-h-64 space-y-1 overflow-auto text-xs text-muted">
          {(state?.diagnostics ?? [])
            .slice()
            .reverse()
            .map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                [{entry.level}] {entry.at} — {entry.message}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
