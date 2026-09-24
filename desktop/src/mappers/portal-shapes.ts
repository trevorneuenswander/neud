import type { LocalDisplay } from "../repositories/displays-repository";
import type { LocalProject } from "../repositories/projects-repository";
import type {
  LocalDataSource,
  LocalScraperSettings,
  LocalScraperSource,
  LocalSourceLog,
  LocalSourceSnapshot,
  LocalSourceStatus,
} from "../repositories/data-sources-repository";
import { resolveSessionFacingEngineLastError } from "../services/engine-session-facing-errors";

export function toPortalDisplay(display: LocalDisplay, localApiBaseUrl: string) {
  const settings = display.settings ?? {};
  const url =
    typeof settings.url === "string" && settings.url.trim()
      ? settings.url
      : `${localApiBaseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(display.projectId)}/bag/display`;

  return {
    id: display.id,
    project_id: display.projectId,
    name: display.name,
    display_key: display.displayKey,
    display_type:
      typeof settings.displayType === "string" ? settings.displayType : "custom",
    url,
    width: display.displayWidth,
    height: display.displayHeight,
    background:
      typeof settings.background === "string" ? settings.background : null,
    enabled: display.enabled,
    refresh_rate_ms: display.refreshRateMs,
    settings,
    created_at: display.createdAt,
    updated_at: display.updatedAt,
  };
}

export function toPortalProject(
  project: LocalProject,
  ownerId = "00000000-0000-0000-0000-000000000000",
) {
  return {
    id: project.id,
    project_number: project.projectNumber ?? 0,
    owner_id: ownerId,
    name: project.name,
    slug: project.slug,
    description: project.description,
    project_type: project.projectType,
    status: project.status,
    is_active: project.isActive,
    display_token: project.displayToken ?? project.id,
    theme: project.theme ?? "default",
    logo_url: project.logoUrl,
    primary_color: project.primaryColor,
    secondary_color: project.secondaryColor,
    icon: project.icon ?? "folder",
    settings: project.settings,
    metadata: project.metadata,
    archived_at: project.archivedAt,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

export function toPortalDataEngine(source: LocalDataSource) {
  const executionMode =
    (source.config.execution_mode as string | undefined) ?? "local-desktop";

  return {
    id: source.id,
    project_id: source.projectId,
    name: source.name,
    engine_key: source.sourceKey,
    engine_type: source.sourceType,
    enabled: source.enabled,
    desired_state: source.desiredState,
    execution_mode: executionMode,
    config: source.config,
    created_by: null,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
  };
}

export function toPortalEngineStatus(
  sourceId: string,
  status: LocalSourceStatus | null,
  createdAt: string,
  options: { pollIntervalMs?: number | null } = {},
) {
  if (!status) {
    return {
      engine_id: sourceId,
      actual_state: "offline",
      health_state: "unknown",
      worker_id: null,
      worker_version: null,
      last_heartbeat_at: null,
      last_run_started_at: null,
      last_run_succeeded_at: null,
      last_run_failed_at: null,
      current_interval_ms: options.pollIntervalMs ?? null,
      total_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
      last_duration_ms: null,
      average_duration_ms: null,
      last_record_count: null,
      last_payload_size_bytes: null,
      scrapes_today: 0,
      successful_today: 0,
      failed_today: 0,
      last_error: null,
      updated_at: createdAt,
      execution_host_id: null,
    };
  }

  return {
    engine_id: sourceId,
    actual_state: status.actualState,
    health_state: status.healthState,
    worker_id: status.workerId,
    worker_version: null,
    last_heartbeat_at: status.lastHeartbeatAt,
    last_run_started_at: status.lastRunAt,
    last_run_succeeded_at: status.lastSuccessAt,
    last_run_failed_at: status.lastRunFailedAt,
    current_interval_ms: options.pollIntervalMs ?? null,
    total_runs: status.runCount,
    successful_runs: status.successCount,
    failed_runs: status.failureCount,
    last_duration_ms: status.lastDurationMs,
    average_duration_ms: status.lastDurationMs,
    last_record_count: status.lastRecordCount,
    last_payload_size_bytes: status.lastPayloadSizeBytes,
    scrapes_today: status.scrapesToday,
    successful_today: status.successfulToday,
    failed_today: status.failedToday,
    stats_day: status.statsDay,
    last_error: resolveSessionFacingEngineLastError(status),
    updated_at: status.updatedAt,
    execution_host_id: null,
  };
}

export function toPortalScraperSettings(
  sourceId: string,
  settings: LocalScraperSettings | null,
  createdAt: string,
) {
  if (!settings) return null;

  return {
    engine_id: sourceId,
    poll_interval_ms: settings.pollIntervalMs,
    details_ttl_ms: settings.detailsTtlMs,
    max_detail_checks_per_poll: settings.maxDetailChecksPerPoll,
    headless: settings.headless,
    updated_by: null,
    created_at: createdAt,
    updated_at: settings.updatedAt,
  };
}

export function toPortalScraperSource(source: LocalScraperSource) {
  return {
    id: source.id,
    engine_id: source.sourceId,
    name: source.name,
    source_key: source.sourceKey,
    url: source.url,
    source_type: source.pageType,
    enabled: source.enabled,
    position: source.position,
    config: source.config,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
  };
}

export function toPortalSnapshot(snapshot: LocalSourceSnapshot) {
  return {
    id: hashStringToNumber(snapshot.id),
    engine_id: snapshot.sourceId,
    data: snapshot.data,
    record_count: snapshot.recordCount,
    payload_size_bytes: snapshot.payloadSizeBytes,
    duration_ms: snapshot.durationMs,
    worker_id: null,
    captured_at: snapshot.capturedAt,
    created_at: snapshot.createdAt,
  };
}

export function toPortalLog(log: LocalSourceLog) {
  return {
    id: log.id,
    engine_id: log.sourceId,
    level: log.level,
    event_type: log.eventType ?? "",
    message: log.message,
    metadata: log.metadata,
    created_at: log.createdAt,
  };
}

function hashStringToNumber(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}
