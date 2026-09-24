import type {
  EngineActualState,
  EngineCommand,
  EngineCommandStatus,
  EngineDesiredState,
  EngineHealthState,
  EngineType,
  ExecutionMode,
  LogLevel,
  SourceType,
} from "@/lib/data-engines/constants";

export type DataEngine = {
  id: string;
  project_id: string;
  name: string;
  engine_key: string;
  engine_type: EngineType;
  enabled: boolean;
  desired_state: EngineDesiredState;
  execution_mode?: ExecutionMode;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DataEngineStatus = {
  engine_id: string;
  actual_state: EngineActualState;
  health_state: EngineHealthState;
  worker_id: string | null;
  worker_version: string | null;
  last_heartbeat_at: string | null;
  last_run_started_at: string | null;
  last_run_succeeded_at: string | null;
  last_run_failed_at: string | null;
  current_interval_ms: number | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_duration_ms: number | null;
  average_duration_ms: number | null;
  last_record_count: number | null;
  last_payload_size_bytes: number | null;
  scrapes_today?: number;
  successful_today?: number;
  failed_today?: number;
  stats_day?: string | null;
  last_error: string | null;
  updated_at: string;
  execution_host_id?: string | null;
};

export type DataEngineCommand = {
  id: number;
  engine_id: string;
  command: EngineCommand;
  status: EngineCommandStatus;
  requested_by: string;
  error_message: string | null;
  created_at: string;
  processing_started_at: string | null;
  processed_at: string | null;
  claimed_by_worker_id?: string | null;
};

export type DataEngineSnapshot = {
  id: number;
  engine_id: string;
  data: Record<string, unknown>;
  record_count: number | null;
  payload_size_bytes: number | null;
  duration_ms: number | null;
  worker_id: string | null;
  captured_at: string;
  created_at: string;
};

export type DataEngineLog = {
  id: number;
  engine_id: string;
  level: LogLevel;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type LiveFeedModePreference = "faye" | "dom" | "legacy";

export type WebpageScraperSettings = {
  engine_id: string;
  poll_interval_ms: number;
  details_ttl_ms: number;
  max_detail_checks_per_poll: number;
  headless: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  live_feed_mode?: LiveFeedModePreference;
  auction_day_selection?: "all" | number;
};

export type WebpageScraperSource = {
  id: string;
  engine_id: string;
  name: string;
  source_key: string;
  url: string;
  source_type: SourceType;
  enabled: boolean;
  position: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DataEngineListItem = DataEngine & {
  status: DataEngineStatus;
  settings?: WebpageScraperSettings | null;
};

export type DataEngineAccessContext = {
  engine: DataEngine;
  projectId: string;
  projectSlug: string;
  accessLevel: "admin" | "manager" | "operator" | "viewer";
  canControl: boolean;
  canConfigure: boolean;
};

export type BagSnapshotData = {
  prev?: Record<string, unknown> | null;
  current?: Record<string, unknown> | null;
  next?: Record<string, unknown>[];
  lots?: Record<string, unknown>[];
  lastSold?: Record<string, unknown> | null;
  auctionDisplay?: Record<string, unknown> | null;
  updatedAt?: string;
};
