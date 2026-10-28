"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  clearSemaHighlight,
  removeSemaHighlight,
  setSemaHighlight,
  type SemaControllerState,
} from "@/graphics/sema-schedule/schedule-api";

const DEFAULT_LABEL = "HIGHLIGHT";

/**
 * Local Controller Highlight card — custom text / clear workflow.
 * Audience-facing ticker heading stays LATER; Highlight only replaces title/description.
 * Scheduled-event Activate / Remove lives on the Data Source schedule table.
 */
export function SemaHighlightControls({
  projectSlug,
  state,
  onState,
  canControl = true,
}: {
  projectSlug: string;
  state: SemaControllerState;
  onState: (next: SemaControllerState) => void;
  canControl?: boolean;
  compact?: boolean;
}) {
  const [title, setTitle] = useState(state.highlight.title);
  const [description, setDescription] = useState(state.highlight.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(state.highlight.title);
    setDescription(state.highlight.description);
  }, [
    state.highlight.active,
    state.highlight.title,
    state.highlight.description,
    state.revision,
  ]);

  async function activateOrUpdate() {
    setBusy(true);
    setError(null);
    try {
      const next = await setSemaHighlight(projectSlug, {
        source: "custom",
        label: state.highlight.label || DEFAULT_LABEL,
        title: title.trim(),
        description: description.trim(),
        sourceRowId: null,
      });
      onState(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to set Highlight.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const next = await removeSemaHighlight(projectSlug);
      onState(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove Highlight.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const next = await clearSemaHighlight(projectSlug);
      onState(next);
      setTitle("");
      setDescription("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to clear Highlight.");
    } finally {
      setBusy(false);
    }
  }

  const canActivate = canControl && !busy && title.trim().length > 0;
  const canRemove = canControl && !busy && state.highlight.active;
  const canClear =
    canControl &&
    !busy &&
    (state.highlight.active ||
      Boolean(state.highlight.title) ||
      Boolean(state.highlight.description) ||
      Boolean(state.highlight.sourceRowId) ||
      state.highlight.source != null);

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-warning">
            Highlight
          </p>
          <p className="mt-1 text-sm text-muted">
            Custom Highlight text replaces the LATER event on the Schedule Ticker. The audience
            heading stays LATER. Scheduled events are activated from the Data Source schedule
            table. Remove keeps prepared fields; Clear wipes them.
          </p>
        </div>
        <span
          className={
            state.highlight.active
              ? "rounded-md bg-warning/15 px-2 py-1 text-xs font-semibold text-warning"
              : "rounded-md bg-surface-raised px-2 py-1 text-xs text-muted"
          }
        >
          {state.highlight.active ? "Active" : "Inactive"}
        </span>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {state.highlight.source === "scheduled" && state.highlight.sourceRowId ? (
        <p className="mt-3 text-xs text-muted">
          A scheduled-event Highlight is prepared from the Data Source table
          {state.highlight.active ? " and is on air" : ""}. Use custom fields below to replace it
          with custom text, or manage Activate / Remove on the Data Source page.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm text-foreground">
          Highlight text
          <input
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            value={title}
            maxLength={500}
            disabled={!canControl || busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm text-foreground">
          Description (optional)
          <input
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            value={description}
            maxLength={500}
            disabled={!canControl || busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>

      {title.trim() ? (
        <div className="mt-3 rounded-md border border-border/70 bg-surface px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warning">
            LATER
          </p>
          <p className="mt-1 text-sm text-foreground">{title.trim()}</p>
          {description.trim() ? (
            <p className="mt-0.5 text-sm text-muted">{description.trim()}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!canActivate} onClick={() => void activateOrUpdate()}>
          {state.highlight.active ? "Update Highlight" : "Activate Highlight"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canRemove}
          onClick={() => void remove()}
        >
          Remove Highlight
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canClear}
          onClick={() => void clear()}
        >
          Clear Highlight
        </Button>
      </div>
    </Card>
  );
}
