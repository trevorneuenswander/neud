import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import type {
  NeudEngineImport,
  NeudProjectImportRecord,
  NeudScraperSourceImport,
  NeudSnapshotImport,
  ImportIdMaps,
} from "./import-types";

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export class ImportWriter {
  constructor(private readonly db: LocalDatabase) {}

  insertProject(
    project: NeudProjectImportRecord,
    maps: ImportIdMaps,
    overrides: { slug: string; name: string },
  ) {
    const localProjectId = maps.projectIdMap.get(project.id) ?? project.id;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO projects (
          id, project_number, name, slug, description, project_type, status,
          display_token, theme, logo_url, primary_color, secondary_color, icon,
          settings_json, metadata_json, archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        localProjectId,
        this.nextProjectNumber(),
        overrides.name,
        overrides.slug,
        project.description,
        project.projectType,
        project.status,
        project.displayToken ?? randomUUID(),
        project.theme ?? "default",
        project.logoUrl,
        project.primaryColor,
        project.secondaryColor,
        project.icon ?? "folder",
        JSON.stringify(project.settings ?? {}),
        JSON.stringify(project.metadata ?? {}),
        project.archivedAt ?? null,
        project.createdAt ?? now,
        project.updatedAt ?? now,
      );

    for (const engine of project.engines) {
      this.insertEngine(localProjectId, engine, maps);
    }
  }

  private insertEngine(
    localProjectId: string,
    engine: NeudEngineImport,
    maps: ImportIdMaps,
  ) {
    const localEngineId = maps.engineIdMap.get(engine.id) ?? engine.id;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO data_sources (
          id, project_id, name, source_key, source_type, enabled,
          desired_state, config_json, auto_start, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        localEngineId,
        localProjectId,
        engine.name,
        engine.engineKey,
        engine.engineType,
        engine.enabled ? 1 : 0,
        engine.desiredState === "running" ? "running" : "stopped",
        JSON.stringify({
          ...engine.config,
          execution_mode: engine.executionMode,
        }),
        0,
        engine.createdAt ?? now,
        engine.updatedAt ?? now,
      );

    const settings = engine.settings ?? {
      pollIntervalMs: 5000,
      detailsTtlMs: 300000,
      maxDetailChecksPerPoll: 3,
      headless: true,
    };

    this.db
      .prepare(
        `INSERT INTO data_source_settings (
          source_id, poll_interval_ms, details_ttl_ms,
          max_detail_checks_per_poll, headless, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        localEngineId,
        settings.pollIntervalMs,
        settings.detailsTtlMs,
        settings.maxDetailChecksPerPoll,
        settings.headless ? 1 : 0,
        now,
      );

    this.db
      .prepare(
        `INSERT INTO data_source_status (
          source_id, actual_state, health_state, updated_at
        ) VALUES (?, 'stopped', 'unknown', ?)`,
      )
      .run(localEngineId, now);

    for (const source of engine.scraperSources) {
      this.insertScraperSource(localEngineId, source, maps);
    }

    if (engine.latestSnapshot && this.isSnapshotCompatible(engine.latestSnapshot)) {
      this.insertSnapshot(localEngineId, engine.latestSnapshot);
    }
  }

  private insertScraperSource(
    localEngineId: string,
    source: NeudScraperSourceImport,
    maps: ImportIdMaps,
  ) {
    const localSourceId = maps.scraperSourceIdMap.get(source.id) ?? source.id;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO data_source_sources (
          id, source_id, name, source_key, url, page_type, enabled, position,
          config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        localSourceId,
        localEngineId,
        source.name,
        source.sourceKey,
        source.url,
        source.pageType,
        source.enabled ? 1 : 0,
        source.position,
        JSON.stringify(source.config ?? {}),
        source.createdAt ?? now,
        source.updatedAt ?? now,
      );
  }

  private insertSnapshot(localEngineId: string, snapshot: NeudSnapshotImport) {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO data_source_snapshots (
          id, source_id, data_json, record_count, payload_size_bytes,
          duration_ms, captured_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        localEngineId,
        JSON.stringify(snapshot.data),
        snapshot.recordCount ?? null,
        snapshot.payloadSizeBytes ?? null,
        snapshot.durationMs ?? null,
        snapshot.capturedAt ?? now,
        snapshot.createdAt ?? now,
      );
  }

  private nextProjectNumber(): number {
    const row = this.db
      .prepare("SELECT MAX(project_number) AS max_number FROM projects")
      .get() as { max_number: number | null };
    return (row.max_number ?? 0) + 1;
  }

  private isSnapshotCompatible(snapshot: NeudSnapshotImport): boolean {
    const payloadSize =
      snapshot.payloadSizeBytes ??
      Buffer.byteLength(JSON.stringify(snapshot.data), "utf8");
    return payloadSize <= MAX_SNAPSHOT_BYTES;
  }
}

export function buildCopyMaps(project: NeudProjectImportRecord, targetSlug: string) {
  const projectIdMap = new Map<string, string>([[project.id, randomUUID()]]);
  const engineIdMap = new Map<string, string>();
  const scraperSourceIdMap = new Map<string, string>();

  for (const engine of project.engines) {
    engineIdMap.set(engine.id, randomUUID());
    for (const source of engine.scraperSources) {
      scraperSourceIdMap.set(source.id, randomUUID());
    }
  }

  return {
    projectIdMap,
    engineIdMap,
    scraperSourceIdMap,
    targetName: buildCopyName(project.name),
    targetSlug,
  };
}

export function buildCreateMaps(project: NeudProjectImportRecord): ImportIdMaps {
  return {
    projectIdMap: new Map([[project.id, project.id]]),
    engineIdMap: new Map(project.engines.map((engine) => [engine.id, engine.id])),
    scraperSourceIdMap: new Map(
      project.engines.flatMap((engine) =>
        engine.scraperSources.map((source) => [source.id, source.id]),
      ),
    ),
  };
}

export function buildCopySlug(baseSlug: string, reserved: Set<string>): string {
  let candidate = `${baseSlug}-imported-copy`;
  let suffix = 2;
  while (reserved.has(candidate)) {
    candidate = `${baseSlug}-imported-copy-${suffix}`;
    suffix += 1;
  }
  return candidate.slice(0, 120);
}

export function buildCopyName(name: string): string {
  const suffix = " (Imported Copy)";
  if (name.endsWith(suffix)) {
    return `${name} (2)`;
  }
  return `${name}${suffix}`;
}

export function getImportVersion(): number {
  return 1;
}
