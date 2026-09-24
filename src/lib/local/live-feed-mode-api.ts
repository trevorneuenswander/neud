import { localFetch } from "@/lib/local/api";

export type LiveFeedModePreference = "faye" | "dom" | "legacy";

export async function localGetLiveFeedMode(projectSlug: string) {
  return localFetch<{ mode: LiveFeedModePreference }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/live-feed-mode`,
  );
}

export async function localSetLiveFeedMode(
  projectSlug: string,
  mode: LiveFeedModePreference,
) {
  return localFetch<{ mode: LiveFeedModePreference; previousMode: LiveFeedModePreference }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/live-feed-mode`,
    {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    },
  );
}
