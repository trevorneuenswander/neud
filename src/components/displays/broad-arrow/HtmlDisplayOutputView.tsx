"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDisplayOutputDocumentStyles } from "@/components/displays/useDisplayOutputDocumentStyles";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";
import { buildHtmlDisplayDocumentPath } from "@/lib/displays/display-view-mode";

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

type HtmlDisplayOutputViewProps = {
  projectId: string;
  slug: string;
  refreshRateMs?: number;
  publishedRevisionId?: string | null;
  displayWidth?: number;
  displayHeight?: number;
};

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

export function HtmlDisplayOutputView({
  projectId,
  slug,
  refreshRateMs = 5000,
  publishedRevisionId = null,
  displayWidth: initialDisplayWidth = DEFAULT_DISPLAY_WIDTH,
  displayHeight: initialDisplayHeight = DEFAULT_DISPLAY_HEIGHT,
}: HtmlDisplayOutputViewProps) {
  const [meta, setMeta] = useState<DisplayMetaResponse | null>(null);
  const [resolved, setResolved] = useState(false);

  const resolvedRevisionId = meta?.publishedRevisionId ?? publishedRevisionId;
  const displayWidth = meta?.displayWidth ?? initialDisplayWidth;
  const displayHeight = meta?.displayHeight ?? initialDisplayHeight;
  const enabled = meta?.enabled === true;
  const hasRevision = Boolean(resolvedRevisionId);

  useDisplayOutputDocumentStyles(displayWidth, displayHeight);

  const resolveDisplay = useCallback(async () => {
    const nextMeta = await fetchDisplayMeta(projectId, slug);
    setMeta(nextMeta);
    setResolved(true);
  }, [projectId, slug]);

  useEffect(() => {
    void resolveDisplay();
  }, [resolveDisplay]);

  const iframeUrl = useMemo(() => {
    let pinnedPreview = false;
    let previewSample: string | null = null;
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      pinnedPreview = search.get("pinnedPreview") === "1";
      previewSample = search.get("previewSample");
    }
    return buildHtmlDisplayDocumentPath({
      projectId,
      slug,
      outputMode: true,
      publishedRevisionId: resolvedRevisionId,
      pinnedPreview,
      previewSample,
    });
  }, [projectId, resolvedRevisionId, slug]);

  const absoluteIframeUrl =
    typeof window !== "undefined"
      ? new URL(iframeUrl, window.location.origin).toString()
      : iframeUrl;

  if (!resolved) {
    return (
      <div
        className="display-output-root"
        style={{
          width: displayWidth,
          height: displayHeight,
          margin: 0,
          padding: 0,
          overflow: "hidden",
          background: "transparent",
          backgroundColor: "transparent",
        }}
        aria-hidden
      />
    );
  }

  if (!enabled || !hasRevision) {
    return (
      <div
        className="display-output-root"
        style={{
          width: displayWidth,
          height: displayHeight,
          margin: 0,
          padding: 0,
          overflow: "hidden",
          background: "transparent",
          backgroundColor: "transparent",
        }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className="display-output-root"
      style={{
        width: displayWidth,
        height: displayHeight,
        margin: 0,
        padding: 0,
        overflow: "hidden",
        background: "transparent",
        backgroundColor: "transparent",
      }}
    >
      <iframe
        key={iframeUrl}
        title={meta?.name ?? slug}
        src={absoluteIframeUrl}
        className="display-output-iframe"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          border: 0,
          margin: 0,
          padding: 0,
          background: "transparent",
          backgroundColor: "transparent",
        }}
      />
    </div>
  );
}
