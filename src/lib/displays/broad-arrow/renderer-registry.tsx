import type React from "react";
import type { BroadArrowDisplayData } from "./types";
import {
  BROAD_ARROW_TICKER_RENDERER_KEY,
  type BroadArrowRendererKey,
} from "./renderer-keys";
import { BroadArrowTicker } from "@/components/displays/broad-arrow/BroadArrowTicker";

export type BroadArrowDisplayRendererProps = {
  data: BroadArrowDisplayData;
  enabled?: boolean;
};

export type BroadArrowDisplayRenderer = (
  props: BroadArrowDisplayRendererProps,
) => React.JSX.Element;

export const broadArrowDisplayRenderers: Record<
  BroadArrowRendererKey,
  BroadArrowDisplayRenderer
> = {
  [BROAD_ARROW_TICKER_RENDERER_KEY]: BroadArrowTicker,
};

export function resolveBroadArrowDisplayRenderer(
  rendererKey: BroadArrowRendererKey,
): BroadArrowDisplayRenderer {
  return broadArrowDisplayRenderers[rendererKey];
}
