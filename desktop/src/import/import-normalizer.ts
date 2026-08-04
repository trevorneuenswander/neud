import type {
  NeudEngineImport,
  NeudEngineSettingsImport,
  NeudImportPackage,
  NeudProjectImportRecord,
  NeudScraperSourceImport,
  NeudSnapshotImport,
} from "./import-types";
import { NEUD_IMPORT_VERSION } from "./import-types";

type SupabaseProjectRow = {
  id: string;
  project_number?: number | null;
  name: string;
  slug: string;
  description?: string | null;
  project_type: string;
  status: string;
  display_token?: string | null;
  theme?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  icon?: string | null;
  settings?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type SupabaseEngineRow = {
  id: string;
  project_id: string;
  name: string;
  engine_key: string;
  engine_type: string;
  enabled: boolean;
  desired_state: string;
  execution_mode?: string | null;
  config?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

type SupabaseSettingsRow = {
  engine_id: string;
  poll_interval_ms: number;
  details_ttl_ms: number;
  max_detail_checks_per_poll: number;
  headless: boolean;
};

type SupabaseSourceRow = {
  id: string;
  engine_id: string;
  name: string;
  source_key: string;
  url: string;
  source_type: string;
  enabled: boolean;
  position: number;
  config?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

type SupabaseSnapshotRow = {
  id?: number;
  engine_id: string;
  data: Record<string, unknown>;
  record_count?: number | null;
  payload_size_bytes?: number | null;
  duration_ms?: number | null;
  captured_at?: string;
  created_at?: string;
};

export function buildImportPackage(input: {
  projects: SupabaseProjectRow[];
  engines: SupabaseEngineRow[];
  settings: SupabaseSettingsRow[];
  scraperSources: SupabaseSourceRow[];
  snapshots: SupabaseSnapshotRow[];
}): NeudImportPackage {
  const settingsByEngine = groupBy(input.settings, (row) => row.engine_id);
  const sourcesByEngine = groupBy(input.scraperSources, (row) => row.engine_id);
  const snapshotByEngine = new Map<string, SupabaseSnapshotRow>();

  for (const snapshot of input.snapshots) {
    if (!snapshotByEngine.has(snapshot.engine_id)) {
      snapshotByEngine.set(snapshot.engine_id, snapshot);
    }
  }

  const enginesByProject = groupBy(input.engines, (row) => row.project_id);

  const projects: NeudProjectImportRecord[] = input.projects.map((project) => {
    const engines = (enginesByProject.get(project.id) ?? []).map((engine) =>
      normalizeEngine(
        engine,
        settingsByEngine.get(engine.id)?.[0] ?? null,
        sourcesByEngine.get(engine.id) ?? [],
        snapshotByEngine.get(engine.id) ?? null,
      ),
    );

    return normalizeProject(project, engines);
  });

  return {
    version: NEUD_IMPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: "supabase",
    projects,
  };
}

function normalizeProject(
  project: SupabaseProjectRow,
  engines: NeudEngineImport[],
): NeudProjectImportRecord {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description ?? null,
    projectType: project.project_type,
    status: normalizeProjectStatus(project.status),
    displayToken: project.display_token ?? null,
    theme: project.theme ?? "default",
    icon: project.icon ?? "folder",
    logoUrl: project.logo_url ?? null,
    primaryColor: project.primary_color ?? null,
    secondaryColor: project.secondary_color ?? null,
    settings: asRecord(project.settings),
    metadata: asRecord(project.metadata),
    archivedAt: project.archived_at ?? null,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    engines,
  };
}

function normalizeEngine(
  engine: SupabaseEngineRow,
  settings: SupabaseSettingsRow | null,
  scraperSources: SupabaseSourceRow[],
  snapshot: SupabaseSnapshotRow | null,
): NeudEngineImport {
  const config = asRecord(engine.config);
  const executionMode =
    typeof engine.execution_mode === "string"
      ? engine.execution_mode
      : typeof config.execution_mode === "string"
        ? String(config.execution_mode)
        : "local-desktop";

  return {
    id: engine.id,
    name: engine.name,
    engineKey: engine.engine_key,
    engineType: engine.engine_type,
    enabled: engine.enabled !== false,
    desiredState: engine.desired_state === "running" ? "running" : "stopped",
    executionMode,
    config: {
      ...config,
      execution_mode: executionMode,
    },
    settings: settings ? normalizeSettings(settings) : null,
    scraperSources: scraperSources
      .sort((left, right) => left.position - right.position)
      .map(normalizeScraperSource),
    latestSnapshot: snapshot ? normalizeSnapshot(snapshot) : null,
    createdAt: engine.created_at,
    updatedAt: engine.updated_at,
  };
}

function normalizeSettings(settings: SupabaseSettingsRow): NeudEngineSettingsImport {
  return {
    pollIntervalMs: settings.poll_interval_ms,
    detailsTtlMs: settings.details_ttl_ms,
    maxDetailChecksPerPoll: settings.max_detail_checks_per_poll,
    headless: settings.headless !== false,
  };
}

function normalizeScraperSource(source: SupabaseSourceRow): NeudScraperSourceImport {
  return {
    id: source.id,
    name: source.name,
    sourceKey: source.source_key,
    url: source.url,
    pageType: source.source_type,
    enabled: source.enabled !== false,
    position: source.position,
    config: asRecord(source.config),
    createdAt: source.created_at,
    updatedAt: source.updated_at,
  };
}

function normalizeSnapshot(snapshot: SupabaseSnapshotRow): NeudSnapshotImport {
  return {
    id: snapshot.id ? String(snapshot.id) : undefined,
    data: asRecord(snapshot.data),
    recordCount: snapshot.record_count ?? null,
    payloadSizeBytes: snapshot.payload_size_bytes ?? null,
    durationMs: snapshot.duration_ms ?? null,
    capturedAt: snapshot.captured_at,
    createdAt: snapshot.created_at,
  };
}

function normalizeProjectStatus(status: string): string {
  if (status === "draft" || status === "maintenance" || status === "archived") {
    return status;
  }
  return "active";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}
