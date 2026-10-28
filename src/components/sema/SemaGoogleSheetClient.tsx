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
  listSemaWorksheets,
  postSemaAction,
  removeSemaHighlight,
  setSemaHighlight,
  type SemaControllerState,
  type SemaRefreshOutcome,
  type SemaScheduleRow,
  type SemaWorksheetTab,
} from "@/graphics/sema-schedule/schedule-api";
import {
  readSemaUrlConfigurationOpen,
  writeSemaUrlConfigurationOpen,
} from "@/lib/sema/url-configuration-preference";
import { applyAuthoritativeSemaSourceMode } from "@/lib/sema/sema-source-mode-client";

const REFRESH_INTERVAL_MS = 5_000;
const DEFAULT_HIGHLIGHT_LABEL = "HIGHLIGHT";

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

function RowStatusSignifiers({
  isNow,
  isNext,
  isLater,
  isHighlight,
}: {
  isNow: boolean;
  isNext: boolean;
  isLater: boolean;
  isHighlight: boolean;
}) {
  if (!isNow && !isNext && !isLater && !isHighlight) {
    return null;
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      {isNow ? (
        <span className="text-xs font-semibold uppercase text-success">Now</span>
      ) : null}
      {isNext ? (
        <span className="text-xs font-semibold uppercase text-primary">Next</span>
      ) : null}
      {isLater ? (
        <span className="text-xs font-semibold uppercase text-warning">Later</span>
      ) : null}
      {isHighlight ? (
        <span className="text-xs font-semibold uppercase text-warning">Highlight</span>
      ) : null}
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
  const [tabs, setTabs] = useState<SemaWorksheetTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [tabsError, setTabsError] = useState<string | null>(null);
  const formDirty = useRef(false);
  const busyRef = useRef(false);
  const urlConfigPreference = useRef<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
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
        setGidInput(next.viewing?.worksheetGid ?? next.sheet.worksheetGid ?? "");
        setPollSeconds(String(Math.round((next.sheet.pollIntervalMs ?? 15_000) / 1000)));
      }
    },
    [projectSlug],
  );

  const refreshTabs = useCallback(
    async (spreadsheetUrlOrId?: string) => {
      const source = (spreadsheetUrlOrId ?? sheetInput).trim();
      if (!source) {
        setTabs([]);
        setTabsError(null);
        return;
      }
      setTabsLoading(true);
      setTabsError(null);
      try {
        const listed = await listSemaWorksheets(projectSlug, source);
        setTabs(listed.worksheets);
        if (listed.error) {
          setTabsError(listed.error);
        } else if (
          gidInput &&
          listed.worksheets.length > 0 &&
          !listed.worksheets.some((tab) => tab.gid === gidInput)
        ) {
          setTabsError(
            `Selected tab (gid ${gidInput}${
              state?.sheet.worksheetTitle ? ` — ${state.sheet.worksheetTitle}` : ""
            }) was not found in this spreadsheet. Choose another tab or restore the missing worksheet.`,
          );
        }
      } catch (cause) {
        setTabs([]);
        setTabsError(
          cause instanceof Error ? cause.message : "Unable to list Google Sheet tabs.",
        );
      } finally {
        setTabsLoading(false);
      }
    },
    [gidInput, projectSlug, sheetInput, state?.sheet.worksheetTitle],
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

  useEffect(() => {
    if (!state?.sheet.spreadsheetId || formDirty.current) return;
    void refreshTabs(state.sheet.spreadsheetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- after authoritative spreadsheet id lands
  }, [state?.sheet.spreadsheetId]);

  async function saveUrlConfig() {
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const next = await postSemaAction<SemaControllerState>(projectSlug, "sheet", {
        spreadsheetUrlOrId: sheetInput,
        worksheetGid: gidInput.trim() === "" ? null : gidInput.trim(),
        worksheetTitle: state?.sheet.worksheetTitle ?? null,
        pollIntervalMs: (() => {
          const seconds = Number(pollSeconds);
          if (!Number.isFinite(seconds)) return undefined;
          return Math.round(Math.min(120, Math.max(1, seconds)) * 1000);
        })(),
      });
      applyState(next, true);
      setMessage({ kind: "success", text: "Google Sheet settings saved." });
      await refreshTabs(sheetInput);
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

  async function selectWorksheet(nextGid: string) {
    if (!canConfigure || !sheetInput.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    setTabsError(null);
    try {
      const selectedTab = tabs.find((tab) => tab.gid === nextGid);
      setGidInput(nextGid);
      setSelectedRowId(null);
      // Viewing-only: does not change the live worksheet or publish to graphics.
      const next = await postSemaAction<SemaControllerState>(projectSlug, "viewing-sheet", {
        worksheetGid: nextGid,
        worksheetTitle:
          selectedTab?.title ??
          (nextGid === (state?.viewing?.worksheetGid ?? state?.sheet.worksheetGid ?? "")
            ? state?.viewing?.worksheetTitle ?? state?.sheet.worksheetTitle ?? null
            : null),
      });
      applyState(next, true);
      if (next.viewing?.lastError) {
        setMessage({ kind: "error", text: next.viewing.lastError });
      }
      // Viewing-tab changes stay silent on success — do not toast.
    } catch (cause) {
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Unable to switch worksheet.",
      });
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

  async function activateHighlightFromSelection() {
    if (!selectedRowId || !state) return;
    const row = (state.sheetSchedule?.rows ?? state.schedule.rows).find(
      (entry) => entry.stableRowId === selectedRowId,
    );
    if (!row) {
      setMessage({ kind: "error", text: "Select a schedule row first." });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const next = await setSemaHighlight(projectSlug, {
        source: "scheduled",
        sourceRowId: row.stableRowId,
        title: row.title,
        description: row.description,
        label: state.highlight.label || DEFAULT_HIGHLIGHT_LABEL,
      });
      applyState(next);
    } catch (cause) {
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Unable to activate Highlight.",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removeHighlight() {
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      applyState(await removeSemaHighlight(projectSlug));
    } catch (cause) {
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Unable to remove Highlight.",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const configured = Boolean(state?.sheet.spreadsheetId);
  const sheetSchedule = state?.sheetSchedule ?? state?.schedule;
  const liveSchedule = state?.liveSchedule ?? state?.schedule;
  const viewingGid = state?.viewing?.worksheetGid ?? state?.sheet.worksheetGid ?? null;
  const liveGid = state?.sheet.worksheetGid ?? null;
  const viewingIsLive = (viewingGid ?? null) === (liveGid ?? null);
  const viewingTitle =
    state?.viewing?.worksheetTitle ??
    tabs.find((tab) => tab.gid === viewingGid)?.title ??
    (viewingGid ? `gid ${viewingGid}` : "—");
  const liveTitle =
    state?.sheet.worksheetTitle ??
    tabs.find((tab) => tab.gid === liveGid)?.title ??
    (liveGid ? `gid ${liveGid}` : "—");
  const rows = sheetSchedule?.rows ?? [];
  const currentIndex = sheetSchedule?.currentIndex ?? 0;
  // Table NOW/NEXT/LATER/Highlight signifiers only when viewing the live worksheet.
  const nowRowId = viewingIsLive ? liveSchedule?.now?.stableRowId ?? null : null;
  const nextRowId = viewingIsLive ? liveSchedule?.next?.stableRowId ?? null : null;
  const laterRowId = viewingIsLive ? liveSchedule?.later?.stableRowId ?? null : null;
  const highlightRowId =
    viewingIsLive &&
    state?.highlight.active &&
    state.highlight.source === "scheduled" &&
    state.highlight.sourceRowId &&
    (state.highlight.sourceWorksheetGid == null ||
      state.highlight.sourceWorksheetGid === liveGid)
      ? state.highlight.sourceRowId
      : null;
  const isManual = state?.sourceMode === "manual";
  const navDisabled = busy || !canControl || rows.length === 0;
  const canActivateHighlight =
    canControl && !busy && Boolean(selectedRowId) && rows.some((row) => row.stableRowId === selectedRowId);
  const canRemoveHighlight = canControl && !busy && Boolean(state?.highlight.active);

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
        <SlotCard label="Now" row={liveSchedule?.now ?? null} accent="text-success" />
        <SlotCard label="Next" row={liveSchedule?.next ?? null} accent="text-primary" />
        <SlotCard label="Later" row={liveSchedule?.later ?? null} accent="text-warning" />
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
        <div className="grid gap-3">
          <div className="grid gap-1 text-sm text-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Google Sheet Tab</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy || tabsLoading || !canConfigure || !sheetInput.trim()}
                onClick={() => void refreshTabs(sheetInput)}
              >
                {tabsLoading ? "Loading tabs…" : "Refresh Tabs"}
              </Button>
            </div>
            {!viewingIsLive && configured ? (
              <p className="text-xs text-muted">
                Viewing: {viewingTitle} · Live: {liveTitle}
              </p>
            ) : null}
            {tabs.length > 0 ? (
              <select
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                value={gidInput}
                disabled={!canConfigure || busy || tabsLoading}
                onChange={(event) => {
                  void selectWorksheet(event.target.value);
                }}
              >
                {gidInput && !tabs.some((tab) => tab.gid === gidInput) ? (
                  <option value={gidInput}>
                    {state?.sheet.worksheetTitle
                      ? `${state.sheet.worksheetTitle} (saved — gid ${gidInput})`
                      : `Saved tab (gid ${gidInput})`}
                  </option>
                ) : null}
                {tabs.map((tab) => (
                  <option key={tab.gid} value={tab.gid}>
                    {tab.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid gap-2">
                <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-muted">
                  {tabsLoading
                    ? "Loading tabs…"
                    : gidInput
                      ? state?.sheet.worksheetTitle
                        ? `Saved worksheet “${state.sheet.worksheetTitle}” (gid ${gidInput}) — automatic discovery unavailable`
                        : `Saved worksheet gid ${gidInput} — automatic discovery unavailable`
                      : "No tabs discovered yet"}
                </p>
                {canConfigure && !tabsLoading ? (
                  <label className="grid gap-1 text-xs text-foreground">
                    Manual worksheet gid (fallback)
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="min-w-[8rem] flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                        value={gidInput}
                        disabled={busy}
                        inputMode="numeric"
                        placeholder="e.g. 0"
                        onChange={(event) => {
                          formDirty.current = true;
                          setGidInput(event.target.value.replace(/[^\d]/g, "").slice(0, 20));
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy || !/^\d{1,20}$/.test(gidInput.trim())}
                        onClick={() => void selectWorksheet(gidInput.trim())}
                      >
                        Use gid
                      </Button>
                    </div>
                    <span className="text-muted">
                      Not a discovered tab — enter the gid from the sheet URL (#gid=…) when
                      automatic listing is unavailable. CSV polling continues with this gid.
                    </span>
                  </label>
                ) : null}
              </div>
            )}
            {tabsError ? (
              <p className="text-xs text-danger">{tabsError}</p>
            ) : tabs.length === 1 ? (
              <p className="text-xs text-muted">This spreadsheet has one tab.</p>
            ) : tabs.length > 1 ? (
              <p className="text-xs text-muted">
                Controls the schedule table and live polling. Uses a stable worksheet gid.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Schedule</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!canActivateHighlight}
                onClick={() => void activateHighlightFromSelection()}
              >
                Activate Highlight
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!canRemoveHighlight}
                onClick={() => void removeHighlight()}
              >
                Remove Highlight
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={
                  navDisabled ||
                  !selectedRowId ||
                  // Same-worksheet Jump to the current NOW row is a no-op.
                  // Cross-tab Jump must stay enabled even when the viewing cursor
                  // already sits on the selected row (promote that row to live NOW).
                  (viewingIsLive && selectedRowId === sheetSchedule?.currentRowId)
                }
                onClick={() => {
                  if (selectedRowId) {
                    void run("jump", {
                      rowId: selectedRowId,
                      worksheetGid: viewingGid,
                    });
                  }
                }}
              >
                Jump
              </Button>
            </div>
          </div>
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
                  <th className="w-24 px-2 py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, index) => {
                  const isSelected = row.stableRowId === selectedRowId;
                  const isNow = row.stableRowId === nowRowId;
                  const isNext = row.stableRowId === nextRowId;
                  const isLater = row.stableRowId === laterRowId;
                  const isHighlight = row.stableRowId === highlightRowId;
                  return (
                    <tr
                      key={row.stableRowId}
                      tabIndex={canControl ? 0 : undefined}
                      aria-selected={isSelected}
                      className={`cursor-pointer transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                        isSelected ? "bg-surface-raised ring-1 ring-inset ring-primary/40" : ""
                      }`}
                      onClick={() => {
                        if (canControl) setSelectedRowId(row.stableRowId);
                      }}
                      onKeyDown={(event) => {
                        if (!canControl) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedRowId(row.stableRowId);
                        }
                      }}
                      onDoubleClick={() => {
                        if (canControl && !busy) {
                          setSelectedRowId(row.stableRowId);
                          void run("jump", {
                            rowId: row.stableRowId,
                            worksheetGid: viewingGid,
                          });
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
                        <RowStatusSignifiers
                          isNow={isNow}
                          isNext={isNext}
                          isLater={isLater}
                          isHighlight={isHighlight}
                        />
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
            credentials are stored in the project package. Choose the worksheet with the Google
            Sheet Tab control above the schedule table.
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !canConfigure || !sheetInput.trim()}
              onClick={() => void saveUrlConfig()}
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
          <dt className="text-muted">Worksheet</dt>
          <dd className="text-foreground">
            {state?.sheet.worksheetTitle
              ? `${state.sheet.worksheetTitle}${
                  state.sheet.worksheetGid ? ` (gid ${state.sheet.worksheetGid})` : ""
                }`
              : state?.sheet.worksheetGid
                ? `gid ${state.sheet.worksheetGid}`
                : "—"}
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
