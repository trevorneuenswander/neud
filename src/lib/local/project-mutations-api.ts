/**
 * Desktop-first project mutations (Pass 22).
 * Prefer IPC through main-process LocalDataService; fall back to local HTTP.
 */

import { getDesktopAPI } from "@/lib/desktop/client";
import { localFetch } from "@/lib/local/api";

export async function localCreateProject(input: {
  name: string;
  slug: string;
  projectType: string;
  description?: string | null;
  theme?: string;
  icon?: string;
  capabilities?: string[];
  teamIds?: string[];
}) {
  const desktop = getDesktopAPI();
  if (desktop?.local?.createProject) {
    return desktop.local.createProject(input);
  }
  return localFetch<{ project: unknown }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 60_000,
  });
}

export async function localUpdateProjectCapabilities(
  projectSlug: string,
  capabilities: string[],
) {
  const desktop = getDesktopAPI();
  if (desktop?.local?.updateProjectCapabilities) {
    return desktop.local.updateProjectCapabilities({
      projectSlug,
      capabilities,
    });
  }
  return localFetch<{ project: unknown; capabilities: string[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/capabilities`,
    {
      method: "PUT",
      body: JSON.stringify({ capabilities }),
      timeoutMs: 30_000,
    },
  );
}
