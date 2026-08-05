export const ENGINE_DESIRED_STATES = ["running", "stopped"] as const;
export type EngineDesiredState = (typeof ENGINE_DESIRED_STATES)[number];

export const ENGINE_EXECUTION_MODES = [
  "remote-worker",
  "local-desktop",
] as const;
export type ExecutionMode = (typeof ENGINE_EXECUTION_MODES)[number];

export const ENGINE_ACTUAL_STATES = [
  "offline",
  "starting",
  "authenticating",
  "running",
  "stopping",
  "stopped",
  "error",
] as const;
export type EngineActualState = (typeof ENGINE_ACTUAL_STATES)[number];

export const ENGINE_HEALTH_STATES = [
  "unknown",
  "healthy",
  "warning",
  "error",
  "stale",
] as const;
export type EngineHealthState = (typeof ENGINE_HEALTH_STATES)[number];

export const ENGINE_COMMANDS = [
  "start",
  "stop",
  "restart",
  "run_once",
] as const;
export type EngineCommand = (typeof ENGINE_COMMANDS)[number];

export const ENGINE_COMMAND_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export type EngineCommandStatus = (typeof ENGINE_COMMAND_STATUSES)[number];

export const ENGINE_TYPES = [
  "webpage-scraper",
  "json-ingest",
  "google-sheet-ingest",
  "rest-api",
  "mqtt",
  "timing-feed",
] as const;
export type EngineType = (typeof ENGINE_TYPES)[number];

export const IMPLEMENTED_ENGINE_TYPES = ["webpage-scraper"] as const;
export type ImplementedEngineType = (typeof IMPLEMENTED_ENGINE_TYPES)[number];

export const LOG_LEVELS = ["info", "warning", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const ENGINE_TYPE_LABELS: Record<EngineType, string> = {
  "webpage-scraper": "Webpage Scraper",
  "json-ingest": "JSON Ingest",
  "google-sheet-ingest": "Google Sheet Ingest",
  "rest-api": "REST API",
  mqtt: "MQTT",
  "timing-feed": "Timing Feed",
};

export const ENGINE_ACTUAL_STATE_LABELS: Record<EngineActualState, string> = {
  offline: "Offline",
  starting: "Starting",
  authenticating: "Authenticating",
  running: "Running",
  stopping: "Stopping",
  stopped: "Stopped",
  error: "Error",
};

export const ENGINE_HEALTH_STATE_LABELS: Record<EngineHealthState, string> = {
  unknown: "Unknown",
  healthy: "Healthy",
  warning: "Warning",
  error: "Error",
  stale: "Stale",
};

export const PROJECT_DATA_TYPES_WITH_ENGINES = [
  "webpage-scraper",
  "bag-graphics",
] as const;

export function projectSupportsDataEngines(projectType: string): boolean {
  return (PROJECT_DATA_TYPES_WITH_ENGINES as readonly string[]).includes(
    projectType,
  );
}

export const SNAPSHOT_RETENTION_COUNT = 100;
export const LOG_RETENTION_COUNT = 500;
export const LOG_DISPLAY_COUNT = 100;

/** Processing commands older than this are treated as stuck in the portal UI. */
export const COMMAND_STALE_AFTER_MS = 600_000;

export const POLL_PRESETS_MS = [
  1000, 2500, 5000, 10000, 15000, 30000, 60000,
] as const;

export const POLL_SLIDER_STEPS_MS = [
  1000, 2000, 2500, 3000, 4000, 5000, 10000, 15000, 20000, 30000, 45000, 60000,
  120000, 180000, 300000, 600000, 900000, 1200000, 1800000, 2700000, 3600000,
] as const;

export const POLL_SLIDER_MIN_MS = POLL_SLIDER_STEPS_MS[0];
export const POLL_SLIDER_MAX_MS =
  POLL_SLIDER_STEPS_MS[POLL_SLIDER_STEPS_MS.length - 1];
export const POLL_INPUT_MIN_MS = 1000;
export const POLL_INPUT_MAX_MS = 3600000;

export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_DETAILS_TTL_MS = 300000;
export const DEFAULT_MAX_DETAIL_CHECKS = 8;

export const SOURCE_TYPES = [
  "page",
  "login",
  "detail",
  "display",
  "detail-template",
  "custom",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  page: "Page",
  login: "Login",
  detail: "Detail",
  display: "Display",
  "detail-template": "Detail template",
  custom: "Custom",
};
