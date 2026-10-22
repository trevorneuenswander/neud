"use client";

import { useCallback, useMemo, useState } from "react";

const RECENT_STORAGE_KEY = "neud:editor:recent-colors";
const MAX_RECENT = 8;

type BrandColorOption = {
  id: string;
  name: string;
  value: string;
};

type ColorFieldProps = {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  brandColors?: BrandColorOption[];
  recentColors?: string[];
  onRecentColorsChange?: (colors: string[]) => void;
  /** Fallback when EyeDropper API is unavailable */
  onPickFromCanvas?: () => void;
};

function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function readStoredRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function pushRecent(existing: string[], hex: string): string[] {
  const next = [hex, ...existing.filter((c) => c !== hex)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

function getEyeDropper(): EyeDropperCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return ctor ?? null;
}

export function ColorField({
  label,
  value,
  onChange,
  brandColors = [],
  recentColors: recentColorsProp,
  onRecentColorsChange,
  onPickFromCanvas,
}: ColorFieldProps) {
  const [internalRecent, setInternalRecent] = useState<string[]>(() => readStoredRecent());
  const recentColors = recentColorsProp ?? internalRecent;

  const swatchStyle = useMemo(
    () => ({ backgroundColor: normalizeHex(value) ?? (value || "#000000") }),
    [value],
  );

  const commitColor = useCallback(
    (hex: string) => {
      const normalized = normalizeHex(hex) ?? hex;
      onChange(normalized);
      if (onRecentColorsChange) {
        onRecentColorsChange(pushRecent(recentColors, normalized));
      } else {
        setInternalRecent((prev) => pushRecent(prev, normalized));
      }
    },
    [onChange, onRecentColorsChange, recentColors],
  );

  async function handleEyedropper() {
    const EyeDropper = getEyeDropper();
    if (EyeDropper) {
      try {
        const dropper = new EyeDropper();
        const result = await dropper.open();
        if (result?.sRGBHex) commitColor(result.sRGBHex);
      } catch {
        // User cancelled or permission denied.
      }
      return;
    }
    onPickFromCanvas?.();
  }

  function handleHexBlur(raw: string) {
    const normalized = normalizeHex(raw);
    if (normalized) commitColor(normalized);
  }

  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <span
          className="h-7 w-7 shrink-0 rounded border border-neutral-700"
          style={swatchStyle}
          aria-hidden
        />
        <input
          type="text"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-100"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => handleHexBlur(e.target.value)}
          spellCheck={false}
          aria-label={label ?? "Color hex"}
        />
        <button
          type="button"
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-800"
          onClick={() => void handleEyedropper()}
          title="Pick color"
        >
          Drop
        </button>
      </div>
      {brandColors.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {brandColors.map((c) => (
            <button
              key={c.id}
              type="button"
              className="h-5 w-5 rounded border border-neutral-700"
              style={{ backgroundColor: c.value }}
              title={c.name}
              onClick={() => commitColor(c.value)}
            />
          ))}
        </div>
      ) : null}
      {recentColors.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {recentColors.map((c) => (
            <button
              key={c}
              type="button"
              className="h-4 w-4 rounded border border-neutral-800"
              style={{ backgroundColor: c }}
              title={c}
              onClick={() => commitColor(c)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
