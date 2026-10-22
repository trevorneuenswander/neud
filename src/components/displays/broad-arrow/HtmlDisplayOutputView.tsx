"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayOutputDocumentStyles } from "@/components/displays/useDisplayOutputDocumentStyles";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";
import { buildHtmlDisplayDocumentPath } from "@/lib/displays/display-view-mode";
import {
  nextHtmlDisplayOutputRetryDelayMs,
  resolveHtmlDisplayOutputState,
  shouldRetryHtmlDisplayOutputMeta,
} from "@/lib/displays/html-display-output-state";

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
  const graphicFrameRef = useRef<HTMLIFrameElement>(null);
  const [hideCursor, setHideCursor] = useState(false);

  const resolvedRevisionId = meta?.publishedRevisionId ?? publishedRevisionId;
  const displayWidth = meta?.displayWidth ?? initialDisplayWidth;
  const displayHeight = meta?.displayHeight ?? initialDisplayHeight;
  const outputState = resolveHtmlDisplayOutputState({
    resolved,
    meta,
    fallbackPublishedRevisionId: publishedRevisionId,
  });

  useDisplayOutputDocumentStyles(displayWidth, displayHeight);

  // Keep checking until the display is enabled and published. One failed or early request
  // must not leave the Local URL permanently empty.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;

    const run = async () => {
      const nextMeta = await fetchDisplayMeta(projectId, slug);
      if (cancelled) return;
      setMeta(nextMeta);
      setResolved(true);
      const nextState = resolveHtmlDisplayOutputState({
        resolved: true,
        meta: nextMeta,
        fallbackPublishedRevisionId: publishedRevisionId,
      });
      if (!shouldRetryHtmlDisplayOutputMeta(nextState)) return;
      timer = window.setTimeout(() => void run(), nextHtmlDisplayOutputRetryDelayMs(attempt));
      attempt += 1;
    };

    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [projectId, slug, publishedRevisionId]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setHideCursor(search.get("surface") === "computer" && search.get("hideCursor") === "1");
  }, []);

  const iframeUrl = useMemo(() => {
    let pinnedPreview = false;
    let previewSample: string | null = null;
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      pinnedPreview = search.get("pinnedPreview") === "1";
      previewSample = search.get("previewSample");
    }
    const search =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    return buildHtmlDisplayDocumentPath({
      projectId,
      slug,
      outputMode: true,
      publishedRevisionId: resolvedRevisionId,
      pinnedPreview,
      previewSample,
      hideCursor: search?.get("surface") === "computer" && search.get("hideCursor") === "1",
      parentSearch: search?.toString() ?? "",
    });
  }, [projectId, resolvedRevisionId, slug]);

  const absoluteIframeUrl =
    typeof window !== "undefined"
      ? new URL(iframeUrl, window.location.origin).toString()
      : iframeUrl;

  useEffect(() => {
    if (!hideCursor) return;
    const apply = () => {
      const frame = graphicFrameRef.current;
      const doc = frame?.contentDocument;
      if (!doc?.documentElement || doc.getElementById("neud-output-cursor")) return;
      const style = doc.createElement("style");
      style.id = "neud-output-cursor";
      style.textContent = "html, body, * { cursor: none !important; }";
      doc.documentElement.appendChild(style);
    };
    apply();
    // Event-driven only: apply on load / src change. Do not poll every 500ms —
    // that kept the output renderer busy while content was static (Pass 9).
    const frame = graphicFrameRef.current;
    if (!frame) return;
    frame.addEventListener("load", apply);
    return () => frame.removeEventListener("load", apply);
  }, [hideCursor, absoluteIframeUrl]);

  if (outputState === "resolving") {
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

  if (outputState !== "ready") {
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
        ref={graphicFrameRef}
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
          cursor: hideCursor ? "none" : undefined,
          pointerEvents: hideCursor ? "none" : undefined,
        }}
      />
    </div>
  );
}
