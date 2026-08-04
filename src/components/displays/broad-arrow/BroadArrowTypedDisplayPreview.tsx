"use client";

import type { BroadArrowRendererKey } from "@/lib/displays/broad-arrow/renderer-keys";
import { resolveBroadArrowDisplayRenderer } from "@/lib/displays/broad-arrow/renderer-registry";
import { useBroadArrowDisplayData } from "@/lib/displays/broad-arrow/useBroadArrowDisplayData";
import { BroadArrowDisplayCanvas } from "./BroadArrowDisplayCanvas";
import { BroadArrowRendererError } from "./BroadArrowRendererError";

type BroadArrowTypedDisplayPreviewProps = {
  projectId: string;
  rendererKey: BroadArrowRendererKey;
  displayWidth?: number;
  displayHeight?: number;
  enabled?: boolean;
  label?: string;
};

export function BroadArrowTypedDisplayPreview({
  projectId,
  rendererKey,
  displayWidth = 1920,
  displayHeight = 1080,
  enabled = true,
  label,
}: BroadArrowTypedDisplayPreviewProps) {
  const { data } = useBroadArrowDisplayData(projectId);
  const Renderer = resolveBroadArrowDisplayRenderer(rendererKey);

  if (!Renderer) {
    return <BroadArrowRendererError rendererKey={rendererKey} />;
  }

  return (
    <BroadArrowDisplayCanvas
      displayWidth={displayWidth}
      displayHeight={displayHeight}
      label={label}
    >
      <Renderer data={data} enabled={enabled} />
    </BroadArrowDisplayCanvas>
  );
}
