import type { LocalProjectsListMeta, ProjectDisplay } from "@/lib/displays/types";
import { localFetch } from "@/lib/local/api";

export async function localGetProjectDisplays(projectSlug: string) {
  return localFetch<{ displays: ProjectDisplay[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays`,
  );
}

export async function localGetProjectsMeta(options?: { wait?: boolean }) {
  const suffix =
    options?.wait === false ? "?wait=false" : "";
  return localFetch<LocalProjectsListMeta>(`/api/projects/meta${suffix}`);
}

export async function localRetryIdentitySync() {
  return localFetch<{ ok: boolean; meta: LocalProjectsListMeta }>("/api/identity/retry", {
    method: "POST",
  });
}

export async function localGetAuthSession() {
  return localFetch<{
    authenticated: boolean;
    userId: string | null;
    email: string | null;
    displayName: string | null;
    team: string | null;
    role: string | null;
  }>("/api/auth/session");
}

export async function localClearBagDefaults(engineId: string) {
  return localFetch<{ ok: boolean; removed: string[] }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/clear-bag-defaults`,
    { method: "POST" },
  );
}

export async function localGetPylonDisplayEnabled() {
  return localFetch<{ enabled: boolean }>("/api/displays/pylon/enabled");
}

export async function localSetPylonDisplayEnabled(enabled: boolean) {
  return localFetch<{ enabled: boolean }>("/api/displays/pylon/enabled", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function localGetLowerTickerDisplayEnabled() {
  return localFetch<{ enabled: boolean }>("/api/displays/lower-ticker-v5/enabled");
}

export async function localSetLowerTickerDisplayEnabled(enabled: boolean) {
  return localFetch<{ enabled: boolean }>("/api/displays/lower-ticker-v5/enabled", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

const DISPLAY_ENABLED_ROUTES: Record<string, string> = {
  pylon: "/api/displays/pylon/enabled",
  "lower-ticker-v5": "/api/displays/lower-ticker-v5/enabled",
  "new-bid-display-v1": "/api/displays/new-bid-display-v1/enabled",
  "new-ticker-v1": "/api/displays/new-ticker-v1/enabled",
};

export async function localGetDisplayEnabled(displayId: string) {
  const route = DISPLAY_ENABLED_ROUTES[displayId];
  if (!route) {
    throw new Error(`Unknown display id: ${displayId}`);
  }
  return localFetch<{ enabled: boolean }>(route);
}

export async function localSetDisplayEnabled(displayId: string, enabled: boolean) {
  const route = DISPLAY_ENABLED_ROUTES[displayId];
  if (!route) {
    throw new Error(`Unknown display id: ${displayId}`);
  }
  return localFetch<{ enabled: boolean }>(route, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function localSetDisplayRefreshRate(
  projectSlug: string,
  displayPersistId: string,
  refreshRateMs: number,
) {
  return localFetch<{ displayId: string; refreshRateMs: number }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayPersistId)}/refresh-rate`,
    {
      method: "PATCH",
      body: JSON.stringify({ refreshRateMs }),
    },
  );
}

export async function localSetDisplaySize(
  projectSlug: string,
  displayPersistId: string,
  displayWidth: number,
  displayHeight: number,
) {
  return localFetch<{ displayId: string; displayWidth: number; displayHeight: number }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayPersistId)}/display-size`,
    {
      method: "PATCH",
      body: JSON.stringify({ displayWidth, displayHeight }),
    },
  );
}

export async function localDeleteDisplay(projectSlug: string, displayId: string) {
  return localFetch<{ deleted: boolean; displayId: string }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayId)}`,
    { method: "DELETE" },
  );
}

export type DisplayMetadata = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  displayKey: string;
  description: string | null;
  enabled: boolean;
  archived: boolean;
  publishedRevisionId: string | null;
};

export async function localUpdateDisplayDetails(
  projectSlug: string,
  displayId: string,
  input: { name?: string; description?: string | null },
) {
  return localFetch<{ display: DisplayMetadata }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export type ArchivedDisplaySummary = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  displayKey: string;
  description: string | null;
  enabled: boolean;
  refreshRateMs: number;
  displayWidth: number;
  displayHeight: number;
  activeVersionNumber: number | null;
  archivedAt: string | null;
  archivedByUserId: string | null;
};

export async function localListArchivedDisplays(projectSlug: string) {
  return localFetch<{ displays: ArchivedDisplaySummary[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/archived`,
  );
}

export async function localUnarchiveDisplay(projectSlug: string, displayId: string) {
  return localFetch<{
    display: {
      id: string;
      name: string;
      slug: string;
      enabled: boolean;
      archived: boolean;
    };
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays/${encodeURIComponent(displayId)}/unarchive`,
    { method: "POST" },
  );
}

export type CreatedDisplayPayload = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  displayKey: string;
  description: string | null;
  sourceType: "project-html";
  enabled: boolean;
  archived: boolean;
  refreshRateMs: number;
  displayWidth: number;
  displayHeight: number;
  publishedRevisionId: string;
  activeVersion: {
    id: string;
    versionNumber: number;
    createdAt: string;
  };
};

export async function localCreateDisplay(
  projectSlug: string,
  input: {
    name: string;
    description?: string;
    html: string;
    uploadedFilename?: string;
  },
) {
  return localFetch<{ display: CreatedDisplayPayload; localUrl: string }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/displays`,
    {
      method: "POST",
      body: JSON.stringify({
        ...input,
        enabled: false,
      }),
    },
  );
}
