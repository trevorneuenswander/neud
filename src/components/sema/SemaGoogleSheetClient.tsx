"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { PageHeader } from "@/components/portal/PageHeader";
import { SemaSourceStatusPill } from "@/components/sema/SemaSourceStatusPill";
import {
  fetchSemaState,
  postSemaAction,
  type SemaControllerState,
  type SemaRefreshOutcome,
  type SemaScheduleRow,
} from "@/graphics/sema-schedule/schedule-api";
import {
  readSemaUrlConfigurationOpen,
  writeSemaUrlConfigurationOpen,
} from "@/lib/sema/url-configuration-preference";
import { applyAuthoritativeSemaSourceMode } from "@/lib/sema/sema-source-mode-client";

const REFRESH_INTERVAL_MS = 5_000;

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function SlotCard({
  label,
  row,
  accent,
}: {
  label: string;
  row: SemaScheduleRow | null;
  accent: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-raised p-4">
      <p className={`text-xs font-semibold uppercase tracking-widest ${accent}`}>{label}</p>
      <p className="mt-2 truncate text-base font-semibold text-foreground">
        {row?.title || "—"}
      </p>
      <p className="mt-1 truncate text-sm text-muted">{row?.description || " "}</p>
      <p className="mt-2 text-xs text-muted">
        {[row?.date, row?.time].filter(Boolean).join(" · ") || " "}
      </p>
    </div>
  );
}

export function SemaGoogleSheetClient({
  projectSlug,
  canConfigure,
  canControl = true,
}: {
  projectSlug: string;
  canConfigure: boolean;
  canControl?: boolean;
}) {
  const [state, setState] = useState<SemaControllerState | null>(null);
  const [sheetInput, setSheetInput] = useState("");
  const [gidInput, setGidInput] = useState("");
  const [pollSeconds, setPollSeconds] = useState("15");
  const formDirty = useRef(false);
  const busyRef = useRef(false);
  const urlConfigPreference = useRef<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [jumpId, setJumpId] = useState<string | null>(null);
  const [urlConfigOpen, setUrlConfigOpen] = useState(true);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    urlConfigPreference.current = readSemaUrlConfigurationOpen(projectSlug);
    if (urlConfigPreference.current !== null) {
      setUrlConfigOpen(urlConfigPreference.current);
    }
  }, [projectSlug]);

  useEffect(() => {
    if (urlConfigPreference.current !== null) return;
    if (!state) return;
    setUrlConfigOpen(!Boolean(state.sheet.spreadsheetId));
  }, [state]);

  const applyState = useCallback(
    (next: SemaControllerState, force = false) => {
      setState(next);
      applyAuthoritativeSemaSourceMode(
        projectSlug,
        next.sourceMode === "manual" ? "manual" : "google-sheets",
      );
      if (force || !formDirty.current) {
        formDirty.current = false;
        setSheetInput(next.sheet.spreadsheetId);
        setGidInput(next.sheet.worksheetGid ?? "");
        setPollSeconds(String(Math.round((next.sheet.pollIntervalMs ?? 15_000) / 1000)));
      }
    },
    [projectSlug],
  );

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (busyRef.current) return;
      try {
        const next = await fetchSemaState(projectSlug);
        if (!cancelled) applyState(next);
      } catch (cause) {
        if (cancelled) return;
        setMessage({
          kind: "error",
          text: cause instanceof Error ? cause.message : "Unable to load Google Sheet state.",
        });
      }
    };
    const first = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => void poll(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [applyState, projectSlug]);

  async function save() {
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const next = await postSemaAction<SemaControllerState>(projectSlug, "sheet", {
        spreadsheetUrlOrId: sheetInput,
        worksheetGid: gidInput.trim() === "" ? null : gidInput.trim(),
        pollIntervalMs: (() => {
          const seconds = Number(pollSeconds);
          if (!Number.isFinite(seconds)) return undefined;
          return Math.round(Math.min(120, Math.max(1, seconds)) * 1000);
        })(),
      });
      applyState(next, true);
      setMessage({ kind: "success", text: "Google Sheet settings saved." });
      const outcome = await postSemaAction<SemaRefreshOutcome>(projectSlug, "refresh");
      applyState(outcome.state, true);
      if (outcome.state.lastError) {
        setMessage({ kind: "error", text: outcome.state.lastError });
      }
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : "Save failed." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function refreshNow() {
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await postSemaAction<SemaRefreshOutcome>(projectSlug, "refresh");
      applyState(outcome.state);
      if (outcome.state.lastError) {
        setMessage({ kind: "error", text: outcome.state.lastError });
      } else {
        setMessage({
          kind: "success",
          text: outcome.unchanged ? "Sheet checked. No changes." : "Sheet updated.",
        });
      }
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : "Refresh failed." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function run(
    action: "advance" | "jump",
    body: Record<string, unknown> = {},
  ) {
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      applyState(await postSemaAction(projectSlug, action, body));
    } catch (cause) {
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Action failed.",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const configured = Boolean(state?.sheet.spreadsheetId);
  const sheetSchedule = state?.sheetSchedule ?? state?.schedule;
  const rows = sheetSchedule?.rows ?? [];
  const currentIndex = sheetSchedule?.currentIndex ?? 0;
  const isManual = state?.sourceMode === "manual";
  const navDisabled = busy || !canControl || rows.length === 0;
  const selectedJump = jumpId ?? sheetSchedule?.currentRowId ?? "";

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Data Source"
        description="Browse and configure the Google Sheets schedule. Use the top-menu source toggle to put this Data Source on air. Previous / Next and Jump only move the sheet cache — they do not change the on-air source."
        action={<SemaSourceStatusPill projectSlug={projectSlug} pageSource="google-sheets" />}
      />

      {message ? <Alert variant={message.kind}>{message.text}</Alert> : null}
      {state?.stale ? (
        <Alert variant="info">
          The sheet is unreachable right now. The last-known schedule ({state.cacheRowCount} rows)
          stays available. Previous and Next still work from the cache.
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <SlotCard label="Now" row={sheetSchedule?.now ?? null} accent="text-success" />
        <SlotCard label="Next" row={sheetSchedule?.next ?? null} accent="text-primary" />
        <SlotCard label="Later" row={sheetSchedule?.later ?? null} accent="text-warning" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={navDisabled || currentIndex <= 0}
          onClick={() => void run("advance", { direction: "previous" })}
        >
          PREV
        </Button>
        <Button
          type="button"
          disabled={navDisabled || currentIndex >= rows.length - 1}
          onClick={() => void run("advance", { direction: "next" })}
        >
          NEXT
        </Button>
        <p className="ml-auto text-sm text-muted">
          Sheet position only — on-air source is controlled in the project menu.
          {!isManual && rows.length > 0 ? (
            <span>
              {" "}
              · row {currentIndex + 1} of {rows.length}
            </span>
          ) : null}
        </p>
      </div>

      <Card padding="sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">Jump to row</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={
              navDisabled || !selectedJump || selectedJump === sheetSchedule?.currentRowId
            }
            onClick={() => void run("jump", { rowId: selectedJump })}
          >
            Jump
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No schedule rows cached yet.</p>
        ) : (
          <div className="mt-3 max-h-96 overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="w-10 px-2 py-2 font-semibold">#</th>
                  <th className="w-28 px-2 py-2 font-semibold">Date</th>
                  <th className="w-24 px-2 py-2 font-semibold">Time</th>
                  <th className="min-w-[10rem] px-2 py-2 font-semibold">Title</th>
                  <th className="min-w-[14rem] px-2 py-2 font-semibold">Event/Description</th>
                  <th className="w-16 px-2 py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, index) => {
                  const isCurrent = index === currentIndex;
                  const isSelected = row.stableRowId === selectedJump;
                  return (
                    <tr
                      key={row.stableRowId}
                      className={`cursor-pointer transition-colors hover:bg-surface-raised ${
                        isSelected ? "bg-surface-raised" : ""
                      }`}
                      onClick={() => {
                        if (canControl) setJumpId(row.stableRowId);
                      }}
                      onDoubleClick={() => {
                        if (canControl && !busy) {
                          void run("jump", { rowId: row.stableRowId });
                        }
                      }}
                    >
                      <td className="px-2 py-2 align-top text-xs text-muted">{index + 1}</td>
                      <td className="whitespace-nowrap px-2 py-2 align-top text-xs text-muted">
                        {row.date || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 align-top text-xs text-muted">
                        {row.time || "—"}
                      </td>
                      <td className="px-2 py-2 align-top font-medium text-foreground">
                        {row.title || "(untitled)"}
                      </td>
                      <td className="px-2 py-2 align-top text-muted">
                        <span className="line-clamp-2 whitespace-normal break-words">
                          {row.description || "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top text-right">
                        {isCurrent ? (
                          <span className="text-xs font-semibold uppercase text-success">Now</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DisclosureSection
        title="URL Configuration"
        open={urlConfigOpen}
        onOpenChange={(open) => {
          urlConfigPreference.current = open;
          setUrlConfigOpen(open);
          writeSemaUrlConfigurationOpen(projectSlug, open);
        }}
      >
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-muted">
            Columns: Date, Time, Title, Event/Description. NEUD reads the sheet with a public CSV
            export, so publish it or share it as &ldquo;Anyone with the link can view&rdquo;.
            Private sheets (Google sign-in) are not supported in SEMA v1; no Google API key or
            credentials are stored in the project package.
          </p>
          <label className="grid gap-1 text-sm text-foreground">
            Spreadsheet URL or ID
            <input
              className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              value={sheetInput}
              disabled={!canConfigure}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              onChange={(event) => {
                formDirty.current = true;
                setSheetInput(event.target.value);
              }}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-foreground">
              Worksheet gid (optional)
              <input
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                value={gidInput}
                disabled={!canConfigure}
                inputMode="numeric"
                placeholder="0"
                onChange={(event) => {
                  formDirty.current = true;
                  setGidInput(event.target.value);
                }}
              />
              <span className="text-xs text-muted">The number after #gid= in the sheet URL.</span>
            </label>
            <label className="grid gap-1 text-sm text-foreground">
              Check for changes every (seconds)
              <input
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                value={pollSeconds}
                disabled={!canConfigure}
                inputMode="numeric"
                min={1}
                max={120}
                onChange={(event) => {
                  formDirty.current = true;
                  setPollSeconds(event.target.value);
                }}
                onBlur={() => {
                  const parsed = Number(pollSeconds);
                  if (!Number.isFinite(parsed)) {
                    setPollSeconds("15");
                    return;
                  }
                  const clamped = Math.min(120, Math.max(1, Math.round(parsed)));
                  setPollSeconds(String(clamped));
                }}
              />
              <span className="text-xs text-muted">Seconds (1–120).</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !canConfigure || !sheetInput.trim()}
              onClick={() => void save()}
            >
              Save and read sheet
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !configured}
              onClick={() => void refreshNow()}
            >
              Check now
            </Button>
          </div>
          {!canConfigure ? (
            <p className="text-xs text-muted">
              Only project managers can change the spreadsheet URL. Operators can still use
              Previous / Next when a sheet is configured.
            </p>
          ) : null}
          {!canControl ? (
            <p className="text-xs text-muted">You have view-only access. Controls are disabled.</p>
          ) : null}
        </div>
      </DisclosureSection>

      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted">Access mode</dt>
          <dd className="text-foreground">Published / readable sheet (public CSV)</dd>
          <dt className="text-muted">On-air source</dt>
          <dd className="text-foreground">
            {state?.sourceMode === "manual" ? "Manual Controller" : "Data Source"}
          </dd>
          <dt className="text-muted">Cached rows</dt>
          <dd className="text-foreground">{state?.cacheRowCount ?? 0}</dd>
          <dt className="text-muted">Sheet position</dt>
          <dd className="text-foreground">
            {sheetSchedule?.now?.title || "—"}
            {sheetSchedule && sheetSchedule.rows.length > 0
              ? ` (${sheetSchedule.currentIndex + 1} of ${sheetSchedule.rows.length})`
              : ""}
          </dd>
          <dt className="text-muted">Last successful read</dt>
          <dd className="text-foreground">{formatTime(state?.lastSuccessAt ?? null)}</dd>
          <dt className="text-muted">Last attempt</dt>
          <dd className="text-foreground">{formatTime(state?.lastAttemptAt ?? null)}</dd>
          <dt className="text-muted">Status</dt>
          <dd className={state?.lastError ? "text-danger" : "text-success"}>
            {state?.lastError ?? (configured ? "Healthy" : "Not configured")}
          </dd>
        </dl>
      </Card>
    </div>
  );
}
