import { localFetch } from "@/lib/local/api";
import type { LocalCanonicalApiResponse } from "@/lib/publishing";

export async function localGetCanonicalProjectPayload(
  projectId: string,
): Promise<LocalCanonicalApiResponse> {
  return localFetch<LocalCanonicalApiResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/canonical`,
  );
}
