"use client";

import type { ReactNode } from "react";

type DisplayCardControlRowProps = {
  label: string;
  children: ReactNode;
  hint?: string;
};

export function DisplayCardControlRow({
  label,
  children,
  hint,
}: DisplayCardControlRowProps) {
  return (
    <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <span className="text-xs text-muted">{label}</span>
        {hint ? <p className="text-[10px] text-muted/80">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}

type DisplayCardControlsProps = {
  children: ReactNode;
};

export function DisplayCardControls({ children }: DisplayCardControlsProps) {
  return <div className="flex w-full min-w-[12rem] flex-col gap-2">{children}</div>;
}

type DisplayCardActionSizeRowProps = {
  actions: ReactNode;
  sizeControl: ReactNode;
};

/** Action buttons aligned with the Display Size control on one row. */
export function DisplayCardActionSizeRow({
  actions,
  sizeControl,
}: DisplayCardActionSizeRowProps) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
      <div className="grid shrink-0 grid-cols-[auto_auto] items-center gap-3">
        <span className="whitespace-nowrap text-xs text-muted">Display Size</span>
        <div className="flex items-center justify-end">{sizeControl}</div>
      </div>
    </div>
  );
}
