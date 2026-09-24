"use client";

import { DISPLAY_METADATA_BADGE_BOX_CLASS } from "@/components/displays/display-metadata-badge-classes";
import { usePinnedViewer } from "@/lib/displays/pinned-viewer-context";
import type { PinnedViewerDisplaySummary } from "@/lib/local/pinned-viewer-api";

type DisplayPinButtonProps = {
  displayId: string;
  enabled: boolean;
  archived?: boolean;
  displaySummary?: PinnedViewerDisplaySummary;
};

export function DisplayPinButton({
  displayId,
  enabled,
  archived = false,
  displaySummary,
}: DisplayPinButtonProps) {
  const pinnedViewer = usePinnedViewer();
  if (!pinnedViewer || archived || !enabled) {
    return null;
  }

  const active = pinnedViewer.isPinned(displayId);

  return (
    <button
      type="button"
      className={`${DISPLAY_METADATA_BADGE_BOX_CLASS} transition ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted hover:border-primary/30 hover:text-foreground"
      }`}
      aria-label={active ? "Unpin display" : "Pin display"}
      aria-pressed={active}
      title={active ? "Unpin display" : "Pin display"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void pinnedViewer.togglePin(displayId, displaySummary);
      }}
    >
      Pin
    </button>
  );
}
