"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { displayDataSourcePreviewLabel } from "@/lib/displays/resolve-effective-display-data";
import { formatBytes, formatRelativeTime } from "@/lib/data-engines/format";
import { localGetCanonicalProjectPayload } from "@/lib/local/canonical-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import type { LocalCanonicalApiResponse, NeudPublishedProjectPayload } from "@/lib/publishing";

type LocalCanonicalJsonPreviewProps = {
  projectId: string;
  projectSlug: string;
  pollIntervalMs?: number;
};

type CopyState = "idle" | "copied" | "error";

const COPY_FEEDBACK_MS = 2500;
const COPY_BUTTON_CLASS = "min-w-[7.5rem]";
const DEFAULT_POLL_INTERVAL_MS = 1500;

function getPublishedPayloadByteSize(payload: NeudPublishedProjectPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function buildDownloadFilename(projectSlug: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${projectSlug}-canonical-${date}_${time}.json`;
}

export function LocalCanonicalJsonPreview({
  projectId,
  projectSlug,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: LocalCanonicalJsonPreviewProps) {
  const [response, setResponse] = useState<LocalCanonicalApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
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
      setLoadError("Local Canonical JSON is available in the desktop application.");
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const payload = await localGetCanonicalProjectPayload(projectId);
        if (cancelled) {
          return;
        }
        setResponse(payload);
        setLoadError(null);
        setLastRefreshedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Unable to load canonical JSON.",
        );
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, projectId]);

  const payload = response?.payload ?? null;
  const formatted = useMemo(
    () => (payload ? JSON.stringify(payload, null, 2) : ""),
    [payload],
  );

  const payloadAgeLabel = payload?.generatedAt
    ? formatRelativeTime(payload.generatedAt)
    : null;
  const refreshLabel = lastRefreshedAt ? formatRelativeTime(lastRefreshedAt) : null;
  const payloadSizeLabel = payload ? formatBytes(getPublishedPayloadByteSize(payload)) : null;

  async function copyJson(currentPayload: NeudPublishedProjectPayload | null) {
    if (!currentPayload) {
      return;
    }

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(currentPayload, null, 2));
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

  function downloadJson(currentPayload: NeudPublishedProjectPayload | null) {
    if (!currentPayload) {
      return;
    }

    const blob = new Blob([JSON.stringify(currentPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildDownloadFilename(projectSlug);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const copyLabel =
    copyState === "copied" ? "✓ Copied" : copyState === "error" ? "Copy failed" : "Copy JSON";

  if (!shouldUseLocalDataClient()) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-foreground">Local Canonical JSON</h3>
        <EmptyState
          title="Desktop runtime required"
          description={loadError ?? "Open this project in the NEUD desktop application."}
        />
      </Card>
    );
  }

  if (loadError && !response) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-foreground">Local Canonical JSON</h3>
        <EmptyState title="Unable to load canonical JSON" description={loadError} />
      </Card>
    );
  }

  if (response?.availability === "no_data" || !payload) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-foreground">Local Canonical JSON</h3>
        <EmptyState
          title="No canonical data yet"
          description="Run the Webpage Scraper or Local Controller to populate the effective canonical state."
        />
        {loadError ? <p className="mt-3 text-sm text-muted">{loadError}</p> : null}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Local Canonical JSON</h3>
          <p className="mt-1 text-xs text-muted">
            Contract {payload.contractVersion} · Revision {payload.revision}
          </p>
          <p className="mt-1 text-xs text-muted">
            Generated {payloadAgeLabel ?? "Unknown"} · Refreshed {refreshLabel ?? "Unknown"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Source {displayDataSourcePreviewLabel(payload.source.mode)}
            {response?.runtime.dataConnected ? " · Connected" : " · Disconnected"}
            {response?.runtime.localActive ? " · Local Active" : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            Payload Size {payloadSizeLabel ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={COPY_BUTTON_CLASS}
            onClick={() => void copyJson(payload)}
          >
            {copyLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => downloadJson(payload)}
          >
            Download JSON
          </Button>
        </div>
      </div>

      <pre className="mt-4 max-h-[640px] overflow-auto rounded-md border border-border bg-background p-4 font-mono text-xs whitespace-pre-wrap break-all text-foreground">
        {formatted}
      </pre>
    </Card>
  );
}
