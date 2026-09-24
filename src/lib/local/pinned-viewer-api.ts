import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import { localFetch } from "@/lib/local/api";

export type PinnedViewerDisplaySummary = {
  id: string;
  name: string;
  displayKey: string;
  url: string;
  width: number;
  height: number;
  settings: Record<string, unknown>;
};

export function buildPinnedViewerDisplaySummary(input: {
  id: string;
  name: string;
  displayKey: string;
  url: string;
  width?: number;
  height?: number;
  settings?: Record<string, unknown>;
}): PinnedViewerDisplaySummary {
  return {
    id: input.id,
    name: input.name,
    displayKey: input.displayKey,
    url: input.url,
    width: input.width ?? 1920,
    height: input.height ?? 1080,
    settings: input.settings ?? {},
  };
}

export type PinnedViewerState = {
  pinnedDisplayIds: string[];
  viewerHeightPx: number;
  updatedAt: string;
  cloudSyncStatus: string;
  displays: PinnedViewerDisplaySummary[];
  displayOrderIds: string[];
  eligible: Array<{ id: string; enabled: boolean; archived: boolean }>;
};

export async function localGetPinnedViewerState(
  projectSlug: string,
  projectId: string,
): Promise<PinnedViewerState> {
  const desktop = getDesktopAPI();
  if (isDesktopEnvironment() && desktop?.displays?.getPinnedViewer) {
    return desktop.displays.getPinnedViewer(projectId) as Promise<PinnedViewerState>;
  }

  return localFetch<PinnedViewerState>(
    `/api/projects/${encodeURIComponent(projectSlug)}/viewer/pinned`,
  );
}

export async function localTogglePinnedDisplay(
  projectSlug: string,
  projectId: string,
  displayId: string,
): Promise<PinnedViewerState> {
  const desktop = getDesktopAPI();
  if (isDesktopEnvironment() && desktop?.displays?.togglePin) {
    return desktop.displays.togglePin({ projectId, displayId }) as Promise<PinnedViewerState>;
  }

  return localFetch<PinnedViewerState>(
    `/api/projects/${encodeURIComponent(projectSlug)}/viewer/pinned`,
    {
      method: "PATCH",
      body: JSON.stringify({ action: "toggle", displayId }),
    },
  );
}

export async function localSetPinnedViewerHeight(
  projectSlug: string,
  projectId: string,
  viewerHeightPx: number,
): Promise<PinnedViewerState> {
  const desktop = getDesktopAPI();
  if (isDesktopEnvironment() && desktop?.displays?.setPinnedViewerHeight) {
    return desktop.displays.setPinnedViewerHeight({
      projectId,
      viewerHeightPx,
    }) as Promise<PinnedViewerState>;
  }

  return localFetch<PinnedViewerState>(
    `/api/projects/${encodeURIComponent(projectSlug)}/viewer/pinned`,
    {
      method: "PATCH",
      body: JSON.stringify({ viewerHeightPx }),
    },
  );
}

export async function localUnpinDisplayIfPinned(
  projectSlug: string,
  projectId: string,
  displayId: string,
): Promise<PinnedViewerState> {
  const trimmedId = displayId.trim();
  if (!trimmedId) {
    return localGetPinnedViewerState(projectSlug, projectId);
  }

  const desktop = getDesktopAPI();
  if (isDesktopEnvironment() && desktop?.displays?.unpinIfPinned) {
    return desktop.displays.unpinIfPinned({
      projectId,
      displayId: trimmedId,
    }) as Promise<PinnedViewerState>;
  }

  return localFetch<PinnedViewerState>(
    `/api/projects/${encodeURIComponent(projectSlug)}/viewer/pinned`,
    {
      method: "PATCH",
      body: JSON.stringify({ action: "unpin", displayId: trimmedId }),
    },
  );
}
