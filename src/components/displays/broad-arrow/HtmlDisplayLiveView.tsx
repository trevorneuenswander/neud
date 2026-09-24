"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DisplayViewerScaledCanvas } from "@/components/displays/DisplayViewerScaledCanvas";
import { useDisplayOutputDocumentStyles } from "@/components/displays/useDisplayOutputDocumentStyles";
import { DISPLAY_GRAPHIC_OUTPUT_BACKGROUND } from "@/lib/displays/display-graphic-output-shell";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";

type DisplayStatus = "resolving" | "loading" | "loaded" | "error";

type DisplayMetaResponse = {
  enabled?: boolean;
  name?: string;
  slug?: string;
  displayId?: string;
  displayWidth?: number;
  displayHeight?: number;
  refreshRateMs?: number;
  publishedRevisionId?: string | null;
};

type HtmlDisplayLiveViewProps = {
  projectId: string;
  slug: string;
  refreshRateMs?: number;
  previewMode?: boolean;
  publishedRevisionId?: string | null;
  displayName?: string;
  displayWidth?: number;
  displayHeight?: number;
};

const LOAD_TIMEOUT_MS = 15000;

import { buildHtmlDisplayDocumentPath } from "@/lib/displays/display-view-mode";

async function fetchDisplayMeta(
  projectId: string,
  slug: string,
): Promise<DisplayMetaResponse | null> {
  try {
    const response = await fetch(
      `/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}/meta`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as DisplayMetaResponse;
  } catch {
    return null;
  }
}

export function HtmlDisplayLiveView({
  projectId,
  slug,
  refreshRateMs = 5000,
  previewMode = false,
  publishedRevisionId = null,
  displayName,
  displayWidth: initialDisplayWidth = DEFAULT_DISPLAY_WIDTH,
  displayHeight: initialDisplayHeight = DEFAULT_DISPLAY_HEIGHT,
}: HtmlDisplayLiveViewProps) {
  const [status, setStatus] = useState<DisplayStatus>("resolving");
  const [meta, setMeta] = useState<DisplayMetaResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const resolvedRevisionId = meta?.publishedRevisionId ?? publishedRevisionId;
  const resolvedName = meta?.name ?? displayName ?? slug;
  const displayWidth = meta?.displayWidth ?? initialDisplayWidth;
  const displayHeight = meta?.displayHeight ?? initialDisplayHeight;

  useDisplayOutputDocumentStyles(displayWidth, displayHeight);

  const iframeUrl = useMemo(
    () =>
      buildHtmlDisplayDocumentPath({
        projectId,
        slug,
        previewMode,
        publishedRevisionId: resolvedRevisionId,
      }),
    [previewMode, projectId, resolvedRevisionId, slug],
  );

  const resolveDisplay = useCallback(async () => {
    setStatus("resolving");
    setErrorMessage(null);

    const nextMeta = await fetchDisplayMeta(projectId, slug);
    if (!nextMeta) {
      setStatus("error");
      setErrorMessage("Display metadata could not be resolved.");
      return;
    }

    if (!nextMeta.publishedRevisionId && !publishedRevisionId) {
      setMeta(nextMeta);
      setStatus("error");
      setErrorMessage("This display has no published HTML revision.");
      return;
    }

    setMeta(nextMeta);
    setStatus("loading");
  }, [projectId, publishedRevisionId, slug]);

  useEffect(() => {
    void resolveDisplay();
  }, [resolveDisplay, retryToken]);

  useEffect(() => {
    if (status !== "loading") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatus("error");
      setErrorMessage("Timed out waiting for the display HTML to load.");
    }, LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [iframeUrl, status]);

  function handleIframeLoad() {
    setStatus("loaded");
    setErrorMessage(null);
  }

  function handleRetry() {
    setRetryToken((value) => value + 1);
  }

  const absoluteIframeUrl =
    typeof window !== "undefined"
      ? new URL(iframeUrl, window.location.origin).toString()
      : iframeUrl;

  if (status === "resolving") {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center text-sm text-muted"
        style={{ backgroundColor: DISPLAY_GRAPHIC_OUTPUT_BACKGROUND }}
      >
        Resolving display…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center p-6 text-sm text-muted"
        style={{ backgroundColor: DISPLAY_GRAPHIC_OUTPUT_BACKGROUND }}
      >
        <div className="max-w-xl space-y-3 rounded-md border border-border bg-background/90 p-4 text-left">
          <p className="font-medium text-foreground">Unable to load display</p>
          {errorMessage ? <p>{errorMessage}</p> : null}
          <dl className="space-y-1 text-xs">
            <div>
              <dt className="inline font-medium text-foreground">Display: </dt>
              <dd className="inline">{resolvedName}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Slug: </dt>
              <dd className="inline">{slug}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Project ID: </dt>
              <dd className="inline break-all">{projectId}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">URL: </dt>
              <dd className="inline break-all">{absoluteIframeUrl}</dd>
            </div>
          </dl>
          <Button type="button" size="sm" variant="secondary" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: DISPLAY_GRAPHIC_OUTPUT_BACKGROUND }}
    >
      {status === "loading" ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-muted"
          style={{ backgroundColor: DISPLAY_GRAPHIC_OUTPUT_BACKGROUND }}
        >
          Loading display…
        </div>
      ) : null}
      <DisplayViewerScaledCanvas displayWidth={displayWidth} displayHeight={displayHeight}>
        <iframe
          key={`${iframeUrl}:${retryToken}`}
          title={resolvedName}
          src={absoluteIframeUrl}
          className="display-viewer-canvas-iframe"
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            background: "transparent",
            backgroundColor: "transparent",
          }}
          onLoad={handleIframeLoad}
        />
      </DisplayViewerScaledCanvas>
    </div>
  );
}
