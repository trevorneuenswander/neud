import { localFetch } from "@/lib/local/api";

export type OnlineViewerSettings = {
  onlineViewerEnabled: boolean;
  onlineVisibility: "private" | "public";
  onlinePublishedAt: string | null;
  onlinePublishError: string | null;
};

export async function localGetOnlineViewerSettings(
  projectSlug: string,
  displayId: string,
): Promise<OnlineViewerSettings> {
  return localFetch<OnlineViewerSettings>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayId)}/online-viewer`,
  );
}

export async function localUpdateOnlineViewerSettings(
  projectSlug: string,
  displayId: string,
  input: {
    onlineViewerEnabled?: boolean;
    onlineVisibility?: "private" | "public";
  },
): Promise<OnlineViewerSettings> {
  return localFetch<OnlineViewerSettings>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayId)}/online-viewer`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}
