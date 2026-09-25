export const BROAD_ARROW_STREAM_DISPLAYS_IMPORT_KEY =
  "phase.broad_arrow_stream_displays_v1";

export type BroadArrowStreamDisplaySpec = {
  importKey: string;
  slug: string;
  name: string;
  description: string;
  bundledRelativePath: string;
  graphicType: "stream-bid" | "stream-ticker" | "led-display-quail";
  displayWidth: number;
  displayHeight: number;
};

export const STREAM_BID_DISPLAY_SPEC: BroadArrowStreamDisplaySpec = {
  importKey: "broad-arrow:stream-bid-display:v1",
  slug: "stream-bid-display",
  name: "Stream Bid Display",
  description:
    "3840×2160 Broad Arrow bid display with transparent PIP cutout for live video overlay.",
  bundledRelativePath: "stream-bid-display-v1.html",
  graphicType: "stream-bid",
  displayWidth: 3840,
  displayHeight: 2160,
};

export const STREAM_TICKER_DISPLAY_SPEC: BroadArrowStreamDisplaySpec = {
  importKey: "broad-arrow:stream-ticker:v1",
  slug: "stream-ticker",
  name: "Stream Ticker",
  description:
    "3840×2160 transparent lower ticker overlay showing the next two upcoming lots.",
  bundledRelativePath: "stream-ticker-v1.html",
  graphicType: "stream-ticker",
  displayWidth: 3840,
  displayHeight: 2160,
};

export const LED_DISPLAY_QUAIL_SPEC: BroadArrowStreamDisplaySpec = {
  importKey: "broad-arrow:led-display-quail:v1",
  slug: "led-display-quail",
  name: "LED Display (Quail)",
  description:
    "9216×1536 ultra-wide Broad Arrow LED wall display with Up Next, current lot focal block, and photo spread.",
  bundledRelativePath: "led-display-quail-v1.html",
  graphicType: "led-display-quail",
  displayWidth: 9216,
  displayHeight: 1536,
};

export const BROAD_ARROW_STREAM_DISPLAY_SPECS: BroadArrowStreamDisplaySpec[] = [
  STREAM_BID_DISPLAY_SPEC,
  STREAM_TICKER_DISPLAY_SPEC,
  LED_DISPLAY_QUAIL_SPEC,
];

export function buildStreamDisplayRevisionName(prefix: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
