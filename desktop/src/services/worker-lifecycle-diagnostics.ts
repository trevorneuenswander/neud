import fs from "fs";
import path from "path";
import { app } from "electron";

const WORKER_LIFECYCLE_LOG_FILENAME = "worker-lifecycle.log";

export type WorkerLifecycleActor = "parent" | "worker";

export type WorkerLifecycleEvent = {
  at: string;
  phase: "timeline" | "termination" | "heartbeat" | "local-api" | "desired-state";
  actor: WorkerLifecycleActor;
  event: string;
  engineId?: string | null;
  correlationId?: string | null;
  details?: Record<string, unknown>;
  stack?: string | null;
};

export function getWorkerLifecycleLogPath(): string {
  return path.join(app.getPath("userData"), "logs", WORKER_LIFECYCLE_LOG_FILENAME);
}

export function captureLifecycleStackTrace(): string {
  const stack = new Error("worker-lifecycle-trace").stack ?? "";
  return stack
    .split("\n")
    .slice(2)
    .join("\n")
    .trim();
}

function appendLifecycleLine(line: string): void {
  try {
    const logPath = getWorkerLifecycleLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    try {
      const fallback = path.join(
        process.env.APPDATA ?? process.env.TEMP ?? "",
        "NEUD",
        "logs",
        WORKER_LIFECYCLE_LOG_FILENAME,
      );
      if (!fallback || fallback.includes("undefined")) {
        return;
      }
      fs.mkdirSync(path.dirname(fallback), { recursive: true });
      fs.appendFileSync(fallback, line, "utf8");
    } catch {
      // diagnostics must not throw
    }
  }
}

export function appendWorkerLifecycleEvent(input: WorkerLifecycleEvent): void {
  appendLifecycleLine(`${JSON.stringify(input)}\n`);
}

export function logWorkerLifecycleTimeline(
  event: string,
  input: {
    engineId?: string | null;
    correlationId?: string | null;
    details?: Record<string, unknown>;
    includeStack?: boolean;
  } = {},
): void {
  appendWorkerLifecycleEvent({
    at: new Date().toISOString(),
    phase: "timeline",
    actor: "parent",
    event,
    engineId: input.engineId ?? null,
    correlationId: input.correlationId ?? null,
    details: input.details ?? {},
    stack: input.includeStack ? captureLifecycleStackTrace() : null,
  });
}

export function logWorkerSigtermInitiated(input: {
  processName: string;
  engineId?: string | null;
  reason?: string | null;
  signal?: "SIGTERM" | "SIGKILL";
  details?: Record<string, unknown>;
}): void {
  appendWorkerLifecycleEvent({
    at: new Date().toISOString(),
    phase: "termination",
    actor: "parent",
    event: "sigterm-initiated",
    engineId: input.engineId ?? extractEngineIdFromProcessName(input.processName),
    correlationId: null,
    details: {
      processName: input.processName,
      reason: input.reason ?? null,
      signal: input.signal ?? "SIGTERM",
      ...(input.details ?? {}),
    },
    stack: captureLifecycleStackTrace(),
  });
}

export function logEngineManagerStopRequested(input: {
  engineId?: string | null;
  reason?: string | null;
  requestedBy?: string | null;
  source: string;
  details?: Record<string, unknown>;
}): void {
  appendWorkerLifecycleEvent({
    at: new Date().toISOString(),
    phase: "termination",
    actor: "parent",
    event: "engine-manager.stop-requested",
    engineId: input.engineId ?? null,
    correlationId: null,
    details: {
      reason: input.reason ?? null,
      requestedBy: input.requestedBy ?? null,
      source: input.source,
      ...(input.details ?? {}),
    },
    stack: captureLifecycleStackTrace(),
  });
}

export function logDesiredStateTransition(input: {
  engineId: string;
  previousDesiredState?: string | null;
  nextDesiredState: string;
  source: string;
  requestedBy?: string | null;
  details?: Record<string, unknown>;
}): void {
  appendWorkerLifecycleEvent({
    at: new Date().toISOString(),
    phase: "desired-state",
    actor: "parent",
    event: "desired-state-transition",
    engineId: input.engineId,
    correlationId: null,
    details: {
      previousDesiredState: input.previousDesiredState ?? null,
      nextDesiredState: input.nextDesiredState,
      source: input.source,
      requestedBy: input.requestedBy ?? null,
      ...(input.details ?? {}),
    },
    stack: captureLifecycleStackTrace(),
  });
}

export function logHeartbeatReceivedByParent(input: {
  engineId: string;
  lastHeartbeatAt: string;
  actualState?: string | null;
  workerId?: string | null;
  source: string;
}): void {
  appendWorkerLifecycleEvent({
    at: new Date().toISOString(),
    phase: "heartbeat",
    actor: "parent",
    event: "heartbeat-received",
    engineId: input.engineId,
    correlationId: null,
    details: {
      lastHeartbeatAt: input.lastHeartbeatAt,
      actualState: input.actualState ?? null,
      workerId: input.workerId ?? null,
      source: input.source,
    },
  });
}

export function logWorkerLocalApiEvent(input: {
  engineId?: string | null;
  method: string;
  path: string;
  outcome: "request" | "response" | "failure";
  statusCode?: number | null;
  error?: string | null;
  details?: Record<string, unknown>;
}): void {
  appendWorkerLifecycleEvent({
    at: new Date().toISOString(),
    phase: "local-api",
    actor: "parent",
    event: `local-api.${input.outcome}`,
    engineId: input.engineId ?? null,
    correlationId: null,
    details: {
      method: input.method,
      path: input.path,
      statusCode: input.statusCode ?? null,
      error: input.error ?? null,
      ...(input.details ?? {}),
    },
  });
}

function extractEngineIdFromProcessName(processName: string): string | null {
  if (!processName.startsWith("engine:")) {
    return null;
  }
  return processName.slice("engine:".length) || null;
}
