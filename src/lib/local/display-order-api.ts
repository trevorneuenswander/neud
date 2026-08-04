import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import { localFetch } from "@/lib/local/api";

export async function localSaveDisplayOrder(
  projectSlug: string,
  projectId: string,
  displayIds: string[],
) {
  const desktop = getDesktopAPI();
  if (isDesktopEnvironment() && desktop?.displays?.saveOrder) {
    return desktop.displays.saveOrder({ projectId, displayIds });
  }

  return localFetch<{ ok: boolean; rowCount?: number }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/order`,
    {
      method: "POST",
      body: JSON.stringify({ displayIds }),
    },
  );
}

export async function localGetDisplayOrder(projectSlug: string, projectId: string) {
  const desktop = getDesktopAPI();
  if (isDesktopEnvironment() && desktop?.displays?.getOrder) {
    return desktop.displays.getOrder(projectId);
  }

  return localFetch<{
    order: Array<{ displayId: string; sortIndex: number; updatedAt: string }>;
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/displays/order`);
}
