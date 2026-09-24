"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  bagLiveStateToPreviewData,
  pickAuthoritativeScraperPreview,
  pickLegacyPreviewFields,
} from "@/lib/bag/live-state-preview";
import type { BagLiveStateEnvelope } from "@/lib/bag/types";
import { formatRelativeTime } from "@/lib/data-engines/format";
import type { BagSnapshotData } from "@/lib/data-engines/types";
import {
  displayDataSourcePreviewLabel,
  resolveEffectiveDisplayData,
} from "@/lib/displays/resolve-effective-display-data";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import {
  getDesktopDisplayDataSource,
  subscribeToDesktopDisplayDataSource,
} from "@/lib/desktop/display-data-source-client";
import {
  localGetBagLiveState,
  subscribeToBagLiveState,
} from "@/lib/local/bag-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type BagLiveStateJsonPreviewProps = {
  projectId: string;
  fallbackSnapshot: BagSnapshotData | null;
  pollWhileActive?: boolean;
  className?: string;
  embedded?: boolean;
};

type PreviewTab = "formatted" | "raw";
type CopyState = "idle" | "copied" | "error";

const COPY_FEEDBACK_MS = 2500;
const COPY_BUTTON_CLASS = "min-w-[7.5rem]";

export function BagLiveStateJsonPreview({
  projectId,
  fallbackSnapshot,
  pollWhileActive = false,
  className = "",
  embedded = false,
}: BagLiveStateJsonPreviewProps) {
  const [envelope, setEnvelope] = useState<BagLiveStateEnvelope | null>(null);
  const [displaySource, setDisplaySource] = useState<DisplayDataSource>("webpage-scraper");
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>("formatted");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    void getDesktopDisplayDataSource().then(setDisplaySource).catch(() => {
      // Keep default.
    });
    return subscribeToDesktopDisplayDataSource(setDisplaySource);
  }, []);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    let cancelled = false;

    const load = () =>
      localGetBagLiveState(projectId)
        .then((payload) => {
          if (!cancelled) {
            setEnvelope(payload);
            setLoadError(null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setLoadError(
              error instanceof Error ? error.message : "Unable to load live state.",
            );
          }
        });

    void load();

    const unsubscribe = subscribeToBagLiveState(projectId, (event) => {
      setConnected(true);
      setEnvelope((current) => ({
        state: event.state,
        automaticState: event.automaticState ?? current?.automaticState ?? null,
        manualSession: event.manualSession ?? current?.manualSession ?? null,
        automaticComparison:
          event.automaticComparison ?? current?.automaticComparison ?? null,
        latestScrapedCurrentLot:
          event.latestScrapedCurrentLot ?? current?.latestScrapedCurrentLot ?? null,
        localControllerDraft:
          event.localControllerDraft ?? current?.localControllerDraft ?? null,
        localControllerSubmitted:
          event.localControllerSubmitted ?? current?.localControllerSubmitted ?? null,
      }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || !pollWhileActive) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(() => {
      void localGetBagLiveState(projectId)
        .then((payload) => {
          if (!cancelled) {
            setEnvelope(payload);
            setLoadError(null);
          }
        })
        .catch(() => {
          // Keep last good preview during transient poll failures.
        });
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pollWhileActive, projectId]);

  const effectivePreview = useMemo(() => {
    const liveAutomaticPreview = bagLiveStateToPreviewData(
      envelope?.automaticState ??
        (envelope?.state?.mode === "automatic" ? envelope.state : null) ??
        null,
    );
    const engineSnapshotPreview = fallbackSnapshot
      ? pickLegacyPreviewFields(fallbackSnapshot)
      : null;
    const scraperRecord = pickAuthoritativeScraperPreview(
      liveAutomaticPreview,
      engineSnapshotPreview,
    );

    const submittedState = envelope?.localControllerSubmitted ?? null;
    const resolved = resolveEffectiveDisplayData({
      source: displaySource,
      scraperSnapshot: scraperRecord as Record<string, unknown> | null,
      localControllerState: null,
      submittedState,
    });

    return resolved.canonicalSnapshot ?? resolved.previewSnapshot;
  }, [displaySource, envelope, fallbackSnapshot]);

  const formatted = useMemo(
    () => (effectivePreview ? JSON.stringify(effectivePreview, null, 2) : ""),
    [effectivePreview],
  );

  const dataSourceLabel = displayDataSourcePreviewLabel(displaySource);
  const snapshotId = envelope?.state.source.snapshotId;
  const updatedAt =
    typeof effectivePreview?.updatedAt === "string"
      ? effectivePreview.updatedAt
      : envelope?.state.updatedAt;
  const connectionLabel = connected
    ? "Live"
    : pollWhileActive
      ? "Polling"
      : "Polling fallback";

  async function copyJson() {
    if (!formatted) return;

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }

    try {
      await navigator.clipboard.writeText(formatted);
      setCopyState("copied");
      copyTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyTimerRef.current = null;
      }, COPY_FEEDBACK_MS);
    } catch {
      setCopyState("error");
      copyTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyTimerRef.current = null;
      }, COPY_FEEDBACK_MS);
    }
  }

  const copyLabel =
    copyState === "copied" ? "✓ Copied" : copyState === "error" ? "Copy failed" : "Copy JSON";

  const wrapperClassName = embedded
    ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${className}`.trim()
    : `flex h-full min-w-0 flex-col overflow-hidden ${className}`.trim();

  const previewBody = !effectivePreview ? (
    <>
      <EmptyState
        title="No live preview yet"
        description="Run the scraper or enter Manual Mode to populate the effective BAG state."
      />
      {loadError ? <p className="mt-3 text-sm text-muted">{loadError}</p> : null}
    </>
  ) : (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Data Source: {dataSourceLabel}
          </p>
          <p className="mt-1 text-xs text-muted">
            Last updated {updatedAt ? formatRelativeTime(updatedAt) : "Unknown"}
            {snapshotId ? ` · Snapshot ${snapshotId}` : ""}
            {` · ${connectionLabel}`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={copyState === "error" ? "secondary" : "secondary"}
          className={COPY_BUTTON_CLASS}
          onClick={() => void copyJson()}
        >
          {copyLabel}
        </Button>
      </div>

      <div className="mt-4 flex gap-2">
        {(["formatted", "raw"] as PreviewTab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium capitalize ${
              tab === value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <pre className="mt-4 min-h-0 w-full min-w-0 flex-1 overflow-auto rounded-md border border-border bg-background p-4 font-mono text-xs whitespace-pre-wrap break-all text-foreground">
        {tab === "formatted" ? formatted : JSON.stringify(effectivePreview)}
      </pre>
    </>
  );

  if (embedded) {
    return <div className={wrapperClassName}>{previewBody}</div>;
  }

  if (!effectivePreview) {
    return <Card className={wrapperClassName}>{previewBody}</Card>;
  }

  return <Card className={wrapperClassName}>{previewBody}</Card>;
}
