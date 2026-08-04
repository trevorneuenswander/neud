"use client";

import { useEffect, useRef, useState } from "react";
import { BroadArrowRendererError } from "@/components/displays/broad-arrow/BroadArrowRendererError";
import { resolveBroadArrowDisplayRenderer } from "@/lib/displays/broad-arrow/renderer-registry";
import type { BroadArrowRendererKey } from "@/lib/displays/broad-arrow/renderer-keys";
import { resolveRendererKey } from "@/lib/displays/broad-arrow/resolve-renderer-key";
import { useBroadArrowDisplayData } from "@/lib/displays/broad-arrow/useBroadArrowDisplayData";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type BroadArrowLiveDisplayViewProps = {
  projectId: string;
  slug: string;
  displayKey: string;
  settings?: Record<string, unknown> | null;
  displayWidth?: number;
  displayHeight?: number;
  previewMode?: boolean;
};

type DisplayMetaResponse = {
  enabled?: boolean;
};

function buildEnabledUrl(projectId: string, slug: string): string {
  return `/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}/enabled`;
}

export function BroadArrowLiveDisplayView({
  projectId,
  slug,
  displayKey,
  settings,
  displayWidth = 1920,
  displayHeight = 1080,
  previewMode = false,
}: BroadArrowLiveDisplayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const rendererKey = resolveRendererKey(displayKey, settings);
  const [enabled, setEnabled] = useState(previewMode);
  const { data } = useBroadArrowDisplayData(projectId);
  const Renderer = rendererKey ? resolveBroadArrowDisplayRenderer(rendererKey) : null;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateScale = () => {
      const widthScale = node.clientWidth / displayWidth;
      const heightScale = node.clientHeight / displayHeight;
      setScale(Math.min(widthScale, heightScale, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayHeight, displayWidth]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      setEnabled(true);
      return;
    }

    let cancelled = false;
    void fetch(buildEnabledUrl(projectId, slug), { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as DisplayMetaResponse;
        if (!cancelled) {
          setEnabled(previewMode || payload.enabled === true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(previewMode);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewMode, projectId, slug]);

  if (!rendererKey || !Renderer) {
    return <BroadArrowRendererError rendererKey={rendererKey ?? "unknown"} />;
  }

  const scaledWidth = displayWidth * scale;
  const scaledHeight = displayHeight * scale;

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "transparent",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: scaledWidth,
          height: scaledHeight,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <Renderer data={data} enabled={enabled} />
        </div>
      </div>
    </div>
  );
}

export function resolveLiveDisplayRendererKey(
  displayKey: string,
  settings?: Record<string, unknown> | null,
): BroadArrowRendererKey | null {
  return resolveRendererKey(displayKey, settings);
}
