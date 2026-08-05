export type EngineProcessState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export type LocalEngineStatus = {
  engineId: string;
  pid: number | null;
  state: EngineProcessState;
  startedAt: string | null;
  lastExitCode: number | null;
  hostId: string;
};

export type EngineControlResult = {
  ok: boolean;
  code: string;
  message: string;
  status?: LocalEngineStatus | null;
};

export type EngineLogEntry = {
  engineId: string;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
};

export type WorkerTerminationReason =
  | "user-stop"
  | "restart"
  | "application-exit"
  | "replacement"
  | "unexpected"
  | "force-kill-after-timeout";

export type ManagedEngineProcess = {
  engineId: string;
  pid: number;
  state: EngineProcessState;
  startedAt: string;
  lastExitCode: number | null;
  pendingTerminationReason: WorkerTerminationReason | null;
  logBuffer: EngineLogEntry[];
  child: import("child_process").ChildProcess;
};

export type HostIdentity = {
  id: string;
  displayName: string;
  hostname: string;
  platform: string;
  appVersion: string;
  createdAt: string;
};

export type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type AuthStatus = {
  mode: "locked" | "offline" | "online";
  allowed: boolean;
  email: string | null;
  role: string | null;
  offlineExpiresAt: string | null;
  lastVerifiedAt: string | null;
  requiresOnlineVerification: boolean;
  message: string;
};

export type LocalRuntimeStatus = {
  localApi: { baseUrl: string; port: number } | null;
  auth: AuthStatus;
};
