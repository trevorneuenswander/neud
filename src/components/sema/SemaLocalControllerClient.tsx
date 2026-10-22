"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/portal/PageHeader";
import { SemaSourceStatusPill } from "@/components/sema/SemaSourceStatusPill";
import {
  applyAuthoritativeSemaSourceMode,
} from "@/lib/sema/sema-source-mode-client";
import {
  fetchSemaState,
  postSemaAction,
  type SemaControllerState,
  type SemaManualFields,
} from "@/graphics/sema-schedule/schedule-api";

const REFRESH_INTERVAL_MS = 4_000;

const EMPTY_MANUAL: SemaManualFields = {
  date: "",
  time: "",
  title: "",
  description: "",
  nextTitle: "",
  nextDescription: "",
  laterTitle: "",
  laterDescription: "",
};

type SlotKey = "now" | "next" | "later";

const SLOT_FIELDS: Array<{
  slot: SlotKey;
  label: string;
  titleKey: keyof SemaManualFields;
  descriptionKey: keyof SemaManualFields;
  accent: string;
}> = [
  {
    slot: "now",
    label: "Now",
    titleKey: "title",
    descriptionKey: "description",
    accent: "text-success",
  },
  {
    slot: "next",
    label: "Next",
    titleKey: "nextTitle",
    descriptionKey: "nextDescription",
    accent: "text-primary",
  },
  {
    slot: "later",
    label: "Later",
    titleKey: "laterTitle",
    descriptionKey: "laterDescription",
    accent: "text-warning",
  },
];

function dirtyFieldClassName(isDirty: boolean): string {
  const base =
    "rounded-md bg-surface-raised px-3 py-2 text-sm text-foreground outline-none disabled:opacity-60";
  if (isDirty) {
    return `${base} border border-warning focus:border-warning focus-visible:ring-2 focus-visible:ring-warning/30`;
  }
  return `${base} border border-border focus:border-primary`;
}

export function SemaLocalControllerClient({
  projectSlug,
  canControl = true,
}: {
  projectSlug: string;
  canControl?: boolean;
}) {
  const [state, setState] = useState<SemaControllerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<SemaManualFields | null>(null);
  const manualDirty = useRef(false);
  const busyRef = useRef(false);

  const applyState = useCallback(
    (next: SemaControllerState) => {
      setState(next);
      applyAuthoritativeSemaSourceMode(
        projectSlug,
        next.sourceMode === "manual" ? "manual" : "google-sheets",
      );
      if (!manualDirty.current) {
        setManualDraft({
          ...EMPTY_MANUAL,
          ...next.manual,
        });
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
        if (cancelled) return;
        applyState(next);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Unable to load the schedule.");
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

  async function saveManual(takeOnAir: boolean) {
    if (!manualDraft) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      applyState(
        await postSemaAction(projectSlug, "manual", {
          ...manualDraft,
          takeOnAir,
        }),
      );
      manualDirty.current = false;
      if (!takeOnAir) {
        setMessage("Manual Now / Next / Later values saved.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function updateField(key: keyof SemaManualFields, value: string) {
    manualDirty.current = true;
    setManualDraft((current) => ({
      ...(current ?? state?.manual ?? EMPTY_MANUAL),
      [key]: value,
    }));
  }

  if (!state) {
    return (
      <div className="w-full">
        {error ? (
          <Alert variant="error">{error}</Alert>
        ) : (
          <p className="text-sm text-muted">Loading SEMA controller…</p>
        )}
      </div>
    );
  }

  const sheetConfigured = Boolean(state.sheet.spreadsheetId);
  const draft = manualDraft ?? { ...EMPTY_MANUAL, ...state.manual };
  const saved = { ...EMPTY_MANUAL, ...state.manual };

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Manual Controller"
        description="Edit Now, Next, and Later independently. Save updates stored manual values without changing the on-air source. Use Take on air or the top-menu source toggle to select Manual Controller."
        action={<SemaSourceStatusPill projectSlug={projectSlug} pageSource="manual" />}
      />

      {!canControl ? (
        <Alert variant="info">You have view-only access. Controls are disabled.</Alert>
      ) : null}
      {!sheetConfigured ? (
        <Alert variant="info">
          No Google Sheet is configured yet. You can still put manual values on air, or{" "}
          <Link className="underline" href={`/projects/${projectSlug}/google-sheet`}>
            set up the Data Source
          </Link>
          .
        </Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="grid gap-4">
        {SLOT_FIELDS.map(({ slot, label, titleKey, descriptionKey, accent }) => {
          const titleDirty = draft[titleKey] !== saved[titleKey];
          const descriptionDirty = draft[descriptionKey] !== saved[descriptionKey];
          return (
            <Card key={slot} padding="sm">
              <p className={`text-xs font-semibold uppercase tracking-widest ${accent}`}>{label}</p>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-sm text-foreground">
                  Title
                  <input
                    className={dirtyFieldClassName(titleDirty)}
                    value={draft[titleKey]}
                    maxLength={500}
                    disabled={!canControl}
                    onChange={(event) => updateField(titleKey, event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm text-foreground">
                  Event / Description
                  <input
                    className={dirtyFieldClassName(descriptionDirty)}
                    value={draft[descriptionKey]}
                    maxLength={500}
                    disabled={!canControl}
                    onChange={(event) => updateField(descriptionKey, event.target.value)}
                  />
                </label>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !canControl}
          onClick={() => void saveManual(false)}
        >
          Save
        </Button>
        <Button
          type="button"
          disabled={busy || !canControl}
          onClick={() => void saveManual(true)}
        >
          Take on air
        </Button>
        <p className="text-xs text-muted">
          Sheet cache stays fresh in the background ({state.cacheRowCount} rows) but does not
          overwrite Manual Controller values while they are on air.
        </p>
      </div>
    </div>
  );
}
