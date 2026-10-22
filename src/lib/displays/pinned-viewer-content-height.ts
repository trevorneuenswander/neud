import { NAME_ROW_PX_FOR_PINNED_TITLE } from "@/lib/displays/pinned-viewer-title-metrics";

export {
  PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX,
  computePinnedAnchorMaxHeightPx,
  resolvePinnedEffectiveHeightPx,
  resolvePinnedMaxHeightPx,
} from "../../../shared/displays/pinned-viewer-preference";

export const PINNED_BAND_VERTICAL_PADDING_PX = 12; // pt-2 + pb-1 approx
export const PINNED_GRID_GAP_PX = 8;
export const PINNED_BAND_HORIZONTAL_PADDING_PX = 40; // px-3 / lg:px-5 approx outer

/**
 * Width-first height for the pinned band: once cards reach their max width for the
 * current pin count, the band height matches the tallest card (preview + title).
 */
export function computePinnedContentFitHeight(params: {
  contentWidthPx: number;
  pinCount: number;
  displayWidth: number;
  displayHeight: number;
  horizontalPaddingPx?: number;
  gridGapPx?: number;
  titleRowPx?: number;
  verticalPaddingPx?: number;
}): number {
  const pinCount = Math.max(1, Math.min(4, Math.floor(params.pinCount)));
  const contentWidth = Math.max(0, params.contentWidthPx);
  const horizontalPadding =
    params.horizontalPaddingPx ?? PINNED_BAND_HORIZONTAL_PADDING_PX;
  const gap = params.gridGapPx ?? PINNED_GRID_GAP_PX;
  const titleRow = params.titleRowPx ?? NAME_ROW_PX_FOR_PINNED_TITLE;
  const verticalPadding =
    params.verticalPaddingPx ?? PINNED_BAND_VERTICAL_PADDING_PX;

  const usableWidth = Math.max(0, contentWidth - horizontalPadding);
  const columnWidth = Math.max(
    0,
    (usableWidth - gap * (pinCount - 1)) / pinCount,
  );
  if (
    columnWidth <= 0 ||
    params.displayWidth <= 0 ||
    params.displayHeight <= 0
  ) {
    return titleRow + verticalPadding;
  }

  const previewHeight = columnWidth * (params.displayHeight / params.displayWidth);
  return Math.ceil(previewHeight + titleRow + verticalPadding);
}
