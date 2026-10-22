"use client";

import type { EditorHistoryFrame } from "@/lib/editor/editor-history";

type EditorHistoryPanelProps = {
  history: EditorHistoryFrame[];
  future: EditorHistoryFrame[];
  onJumpBack: (steps: number) => void;
  onJumpForward: (steps: number) => void;
};

export function EditorHistoryPanel({
  history,
  future,
  onJumpBack,
  onJumpForward,
}: EditorHistoryPanelProps) {
  const past = [...history];
  const upcoming = [...future];

  return (
    <div className="space-y-2 p-2 text-xs">
      <p className="text-[10px] text-neutral-500">
        Same stack as Undo/Redo — click a step to restore.
      </p>
      <ul className="max-h-[min(420px,50vh)] space-y-1 overflow-auto">
        {past.map((frame, index) => (
          <li key={`past-${index}-${frame.label}`}>
            <button
              type="button"
              className="w-full rounded border border-neutral-800 px-2 py-1.5 text-left hover:bg-neutral-900"
              onClick={() => onJumpBack(past.length - index)}
            >
              {frame.label}
            </button>
          </li>
        ))}
        <li>
          <div className="rounded border border-sky-700/60 bg-sky-950/30 px-2 py-1.5 font-medium text-sky-100">
            Current
          </div>
        </li>
        {upcoming.map((frame, index) => (
          <li key={`future-${index}-${frame.label}`}>
            <button
              type="button"
              className="w-full rounded border border-dashed border-neutral-700 px-2 py-1.5 text-left text-neutral-400 hover:bg-neutral-900"
              onClick={() => onJumpForward(index + 1)}
            >
              {frame.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
