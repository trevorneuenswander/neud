import fs from "fs";
import path from "path";
import { NEUD_APP_DATA_DIR } from "./neud-env.js";

const LOG_FILENAME = "worker-lifecycle.log";

const state = {
  bootLogged: false,
  heartbeatRegistrationLogged: false,
  firstHeartbeatSent: false,
  firstLocalApiRequest: false,
  lastDesiredState: null,
};

function logPath() {
  const root = NEUD_APP_DATA_DIR();
  if (!root) {
    return null;
  }
  return path.join(root, "logs", LOG_FILENAME);
}

function captureStackTrace() {
  const stack = new Error("worker-lifecycle-trace").stack ?? "";
  return stack
    .split("\n")
    .slice(2)
    .join("\n")
    .trim();
}

export function appendWorkerLifecycleEvent(input) {
  const target = logPath();
  if (!target) {
    return;
  }

  const entry = {
    at: new Date().toISOString(),
    actor: "worker",
    ...input,
  };

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // diagnostics must not throw
  }
}

export function logWorkerBoot(input = {}) {
  if (state.bootLogged) {
    return;
  }
  state.bootLogged = true;
  appendWorkerLifecycleEvent({
    phase: "timeline",
    event: "worker-boot",
    engineId: process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: {
      pid: process.pid,
      execPath: process.execPath,
      ...input,
    },
  });
}

export function logHeartbeatRegistration(input = {}) {
  if (state.heartbeatRegistrationLogged) {
    return;
  }
  state.heartbeatRegistrationLogged = true;
  appendWorkerLifecycleEvent({
    phase: "heartbeat",
    event: "heartbeat-registration",
    engineId: process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: input,
  });
}

export function logFirstHeartbeatSent(input = {}) {
  if (state.firstHeartbeatSent) {
    return;
  }
  state.firstHeartbeatSent = true;
  appendWorkerLifecycleEvent({
    phase: "heartbeat",
    event: "first-heartbeat-sent",
    engineId: input.engineId ?? process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: input,
  });
}

export function logWorkerSigtermReceived(input = {}) {
  appendWorkerLifecycleEvent({
    phase: "termination",
    event: "sigterm-received",
    engineId: process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: input,
    stack: captureStackTrace(),
  });
}

export function logWorkerShutdownInitiated(input = {}) {
  appendWorkerLifecycleEvent({
    phase: "termination",
    event: "worker-shutdown-initiated",
    engineId: process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: input,
    stack: captureStackTrace(),
  });
}

export function logWorkerDesiredStateObserved(input = {}) {
  const nextDesiredState = input.desiredState ?? null;
  if (state.lastDesiredState === nextDesiredState) {
    return;
  }

  appendWorkerLifecycleEvent({
    phase: "desired-state",
    event: "worker-desired-state-observed",
    engineId: input.engineId ?? process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: {
      previousDesiredState: state.lastDesiredState,
      nextDesiredState,
      actualState: input.actualState ?? null,
      source: input.source ?? "engine-runtime",
    },
  });

  state.lastDesiredState = nextDesiredState;
}

export function logWorkerLocalApiEvent(input = {}) {
  const isFirstRequest = !state.firstLocalApiRequest && input.outcome === "request";
  if (isFirstRequest) {
    state.firstLocalApiRequest = true;
  }

  appendWorkerLifecycleEvent({
    phase: "local-api",
    event: isFirstRequest ? "first-local-api-request" : `local-api.${input.outcome}`,
    engineId: input.engineId ?? process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: {
      method: input.method ?? null,
      path: input.path ?? null,
      statusCode: input.statusCode ?? null,
      error: input.error ?? null,
      ...(input.details ?? {}),
    },
  });
}

export function logWorkerPollWaitInterrupted(input = {}) {
  appendWorkerLifecycleEvent({
    phase: "heartbeat",
    event: "poll-wait-interrupted",
    engineId: input.engineId ?? process.env.ENGINE_ID ?? null,
    correlationId: process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null,
    details: input,
  });
}
