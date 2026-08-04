import { getLocalApiBaseUrl } from "@/lib/local/mode";

type LocalApiError = {
  error?: string;
};

export type ImportProjectAction = "create" | "skip" | "copy";

export type ImportPreviewProject = {
  sourceProjectId: string;
  name: string;
  slug: string;
  engineCount: number;
  scraperSourceCount: number;
  snapshotCount: number;
  status: string;
  recommendedAction: ImportProjectAction;
  allowedActions: ImportProjectAction[];
  selectedAction: ImportProjectAction;
  messages: string[];
};

export type ImportPreviewResponse = {
  validation: {
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
    warnings: Array<{ path: string; message: string }>;
  };
  totals: {
    projects: number;
    engines: number;
    scraperSources: number;
    snapshots: number;
  };
  projects: ImportPreviewProject[];
};

export type ImportExecuteResponse = {
  ok: boolean;
  backupPath: string | null;
  importedProjects: number;
  copiedProjects: number;
  skippedProjects: number;
  importedEngines: number;
  importedScraperSources: number;
  importedSnapshots: number;
  projects: Array<{
    sourceProjectId: string;
    action: ImportProjectAction;
    status: "imported" | "copied" | "skipped" | "failed";
    localProjectId?: string;
    localSlug?: string;
    message?: string;
  }>;
  warnings: Array<{ path: string; message: string }>;
  errors: Array<{ path: string; message: string }>;
};

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getLocalApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & LocalApiError;

  if (!response.ok) {
    throw new Error(payload.error ?? `Local API request failed (${response.status}).`);
  }

  return payload;
}

export async function previewSupabaseImport(): Promise<ImportPreviewResponse> {
  return localFetch<ImportPreviewResponse>("/api/import/supabase/preview", {
    method: "POST",
  });
}

export async function executeSupabaseImport(
  selections: Array<{ sourceProjectId: string; action: ImportProjectAction }>,
): Promise<ImportExecuteResponse> {
  const response = await fetch(`${getLocalApiBaseUrl()}/api/import/supabase/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ selections }),
  });

  const payload = (await response.json().catch(() => ({}))) as
    | ImportExecuteResponse
    | LocalApiError;

  if (!response.ok && !("ok" in payload)) {
    const errorPayload = payload as LocalApiError;
    throw new Error(
      errorPayload.error ?? `Local API request failed (${response.status}).`,
    );
  }

  return payload as ImportExecuteResponse;
}

export async function createLocalBackup(): Promise<{ backupPath: string }> {
  return localFetch<{ ok: boolean; backupPath: string }>("/api/backup/create", {
    method: "POST",
  });
}
