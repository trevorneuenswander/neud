"use client";

import { useEffect, useState } from "react";
import { BroadArrowLiveDisplayView, resolveLiveDisplayRendererKey } from "@/components/displays/broad-arrow/BroadArrowLiveDisplayView";
import { HtmlDisplayLiveView } from "@/components/displays/broad-arrow/HtmlDisplayLiveView";
import { HtmlDisplayOutputView } from "@/components/displays/broad-arrow/HtmlDisplayOutputView";
import { resolveRendererKey } from "@/lib/displays/broad-arrow/resolve-renderer-key";
import type { DisplayViewMode } from "@/lib/displays/display-view-mode";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type DisplayLivePageClientProps = {
  projectId: string;
  slug: string;
  displayKey: string;
  settings?: Record<string, unknown> | null;
  displayWidth?: number;
  displayHeight?: number;
  refreshRateMs?: number;
  viewMode?: DisplayViewMode;
};

type DisplayMetaResponse = {
  enabled?: boolean;
  name?: string;
  slug?: string;
  displayId?: string;
  displayWidth?: number;
  displayHeight?: number;
  displayKey?: string;
  settings?: Record<string, unknown>;
  refreshRateMs?: number;
  publishedRevisionId?: string | null;
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

export function DisplayLivePageClient({
  projectId,
  slug,
  displayKey,
  settings,
  displayWidth = 1920,
  displayHeight = 1080,
  refreshRateMs = 5000,
  viewMode = "output",
}: DisplayLivePageClientProps) {
  const [meta, setMeta] = useState<DisplayMetaResponse | null>(null);
  const previewMode = viewMode === "viewer";

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;
    void fetchDisplayMeta(projectId, slug).then(setMeta);
  }, [projectId, slug]);

  const resolvedSettings = meta?.settings ?? settings ?? null;
  const resolvedDisplayKey = meta?.displayKey ?? displayKey;
  const runtimeAdapterKey =
    typeof resolvedSettings?.runtimeAdapterKey === "string"
      ? resolvedSettings.runtimeAdapterKey.trim()
      : "";
  const rendererKey =
    runtimeAdapterKey.length > 0
      ? null
      : resolveLiveDisplayRendererKey(resolvedDisplayKey, resolvedSettings) ??
        resolveRendererKey(resolvedDisplayKey, resolvedSettings);

  if (!previewMode) {
    if (rendererKey) {
      return (
        <BroadArrowLiveDisplayView
          projectId={projectId}
          slug={slug}
          displayKey={resolvedDisplayKey}
          settings={resolvedSettings}
          displayWidth={meta?.displayWidth ?? displayWidth}
          displayHeight={meta?.displayHeight ?? displayHeight}
          previewMode={false}
        />
      );
    }

    return (
      <HtmlDisplayOutputView
        projectId={projectId}
        slug={slug}
        refreshRateMs={meta?.refreshRateMs ?? refreshRateMs}
        publishedRevisionId={meta?.publishedRevisionId ?? null}
        displayWidth={meta?.displayWidth ?? displayWidth}
        displayHeight={meta?.displayHeight ?? displayHeight}
      />
    );
  }

  if (rendererKey) {
    return (
      <BroadArrowLiveDisplayView
        projectId={projectId}
        slug={slug}
        displayKey={resolvedDisplayKey}
        settings={resolvedSettings}
        displayWidth={meta?.displayWidth ?? displayWidth}
        displayHeight={meta?.displayHeight ?? displayHeight}
        previewMode={previewMode}
      />
    );
  }

  return (
    <HtmlDisplayLiveView
      projectId={projectId}
      slug={slug}
      refreshRateMs={meta?.refreshRateMs ?? refreshRateMs}
      previewMode={previewMode}
      publishedRevisionId={meta?.publishedRevisionId ?? null}
      displayName={meta?.name}
      displayWidth={meta?.displayWidth ?? displayWidth}
      displayHeight={meta?.displayHeight ?? displayHeight}
    />
  );
}
