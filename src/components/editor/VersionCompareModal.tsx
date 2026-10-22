"use client";

import type { EditableGraphicSchema } from "@/lib/editor/editable-graphic-types";
import type { CSSProperties, ReactNode } from "react";

type VersionCompareModalProps = {
  open: boolean;
  leftLabel: string;
  rightLabel: string;
  leftSchema: EditableGraphicSchema;
  rightSchema: EditableGraphicSchema;
  renderStage: (schema: EditableGraphicSchema, scale: number) => ReactNode;
  onClose: () => void;
};

export function VersionCompareModal({
  open,
  leftLabel,
  rightLabel,
  leftSchema,
  rightSchema,
  renderStage,
  onClose,
}: VersionCompareModalProps) {
  if (!open) return null;
  const scale = 0.18;
  const frameStyle: CSSProperties = {
    width: leftSchema.width * scale,
    height: leftSchema.height * scale,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Version Comparison</h2>
          <button type="button" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mb-3 text-[11px] text-neutral-500">
          Side-by-side visual preview only — no automated diff.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-300">{leftLabel}</div>
            <div className="overflow-auto rounded border border-neutral-700 bg-neutral-950 p-2">
              <div style={frameStyle}>{renderStage(leftSchema, scale)}</div>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-300">{rightLabel}</div>
            <div className="overflow-auto rounded border border-neutral-700 bg-neutral-950 p-2">
              <div style={frameStyle}>{renderStage(rightSchema, scale)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
