"use client";

type TransformHudProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  visible?: boolean;
};

function formatNum(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "0";
}

export function TransformHud({ x, y, w, h, visible = true }: TransformHudProps) {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-20 rounded border border-neutral-700/80 bg-neutral-950/90 px-2 py-1 font-mono text-[10px] text-neutral-300 shadow-lg backdrop-blur-sm"
      aria-hidden
    >
      <span className="text-neutral-500">X</span> {formatNum(x)}{" "}
      <span className="ml-2 text-neutral-500">Y</span> {formatNum(y)}{" "}
      <span className="ml-2 text-neutral-500">W</span> {formatNum(w)}{" "}
      <span className="ml-2 text-neutral-500">H</span> {formatNum(h)}
    </div>
  );
}
