import type { LocalDatabase } from "../database/connection";
import { DISK_RECORDING_DEVICE_ID } from "./disk-recording-model";
import {
  normalizeOutputRouteSource,
  withComputerDisplayConfiguration,
  type OutputRoute,
  type OutputRouteStore,
} from "./output-engine-core";

type RouteRow = {
  id: string;
  name: string;
  project_id: string;
  display_id: string;
  source_type?: string | null;
  source_id?: string | null;
  adapter_type: string;
  device_id: string;
  mode: string;
  enabled: number;
  configuration_json: string;
  created_at: string;
  updated_at: string;
};

function parseAdapterType(value: string): OutputRoute["adapterType"] {
  if (value === "decklink") return "decklink";
  if (value === "disk") return "disk";
  // Legacy / mistyped disk rows still carry the virtual device id.
  return "display";
}

function parseRoute(row: RouteRow): OutputRoute {
  const raw = JSON.parse(row.configuration_json) as Partial<OutputRoute["configuration"]> & {
    sourceType?: string;
    sourceId?: string;
  };
  let adapterType = parseAdapterType(row.adapter_type);
  if (
    adapterType === "display" &&
    (row.device_id === DISK_RECORDING_DEVICE_ID || row.device_id.startsWith("disk:"))
  ) {
    adapterType = "disk";
  }
  const configuration = withComputerDisplayConfiguration(raw);
  if (adapterType === "decklink" && raw.decklink) {
    configuration.decklink = raw.decklink;
  }
  if (adapterType === "disk" && raw.recording) {
    configuration.recording = raw.recording;
  }
  const source = normalizeOutputRouteSource({
    displayId: row.display_id,
    sourceType: row.source_type ?? raw.sourceType ?? null,
    sourceId: row.source_id ?? raw.sourceId ?? null,
  });
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    displayId: source.displayId,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    adapterType,
    deviceId: adapterType === "disk" ? DISK_RECORDING_DEVICE_ID : row.device_id,
    mode: "borderless",
    enabled: row.enabled !== 0,
    configuration,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasSourceColumns(db: LocalDatabase): boolean {
  const columns = db.prepare("PRAGMA table_info(output_routes)").all() as Array<{ name: string }>;
  return columns.some((column) => column.name === "source_type");
}

export class SqliteOutputRouteStore implements OutputRouteStore {
  constructor(private readonly db: LocalDatabase) {}

  list(): OutputRoute[] {
    const rows = this.db
      .prepare("SELECT * FROM output_routes ORDER BY created_at ASC")
      .all() as RouteRow[];
    return rows.map(parseRoute);
  }

  get(id: string): OutputRoute | null {
    const row = this.db.prepare("SELECT * FROM output_routes WHERE id = ?").get(id) as
      | RouteRow
      | undefined;
    return row ? parseRoute(row) : null;
  }

  save(route: OutputRoute): void {
    const source = normalizeOutputRouteSource(route);
    if (hasSourceColumns(this.db)) {
      this.db
        .prepare(
          `INSERT INTO output_routes (
            id, name, project_id, display_id, source_type, source_id, adapter_type, device_id, mode, enabled,
            configuration_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            project_id = excluded.project_id,
            display_id = excluded.display_id,
            source_type = excluded.source_type,
            source_id = excluded.source_id,
            adapter_type = excluded.adapter_type,
            device_id = excluded.device_id,
            mode = excluded.mode,
            enabled = excluded.enabled,
            configuration_json = excluded.configuration_json,
            updated_at = excluded.updated_at`,
        )
        .run(
          route.id,
          route.name,
          route.projectId,
          source.displayId,
          source.sourceType,
          source.sourceId,
          route.adapterType,
          route.deviceId,
          route.mode,
          route.enabled ? 1 : 0,
          JSON.stringify(route.configuration),
          route.createdAt,
          route.updatedAt,
        );
      return;
    }
    this.db
      .prepare(
        `INSERT INTO output_routes (
          id, name, project_id, display_id, adapter_type, device_id, mode, enabled,
          configuration_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          project_id = excluded.project_id,
          display_id = excluded.display_id,
          adapter_type = excluded.adapter_type,
          device_id = excluded.device_id,
          mode = excluded.mode,
          enabled = excluded.enabled,
          configuration_json = excluded.configuration_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        route.id,
        route.name,
        route.projectId,
        // Pre-migration schema: keep display id for display sources only.
        source.sourceType === "display" ? source.sourceId : source.displayId,
        route.adapterType,
        route.deviceId,
        route.mode,
        route.enabled ? 1 : 0,
        JSON.stringify({
          ...route.configuration,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
        }),
        route.createdAt,
        route.updatedAt,
      );
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM output_routes WHERE id = ?").run(id);
  }
}
