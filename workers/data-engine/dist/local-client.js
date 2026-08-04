import {
  NEUD_APP_DATA_DIR,
  NEUD_BROWSER_USER_DATA_DIR,
  NEUD_COOKIES_DIR,
  NEUD_LOCAL_API_URL,
} from "./neud-env.js";

const baseUrl = () => {
  const url = NEUD_LOCAL_API_URL();
  if (!url) {
    throw new Error("Missing NEUD_LOCAL_API_URL.");
  }
  return url.replace(/\/$/, "");
};

export function isLocalApiEnabled() {
  return Boolean(NEUD_LOCAL_API_URL());
}

const workerHeaders = {
  "Content-Type": "application/json",
  "X-NEUD-Worker-Client": "data-engine",
};

async function request(path, init) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...workerHeaders,
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `Local API request failed (${response.status}).`);
  }

  return payload;
}

export async function loadWorkerCredentials(engineId) {
  const payload = await request(
    `/api/data-sources/${encodeURIComponent(engineId)}/worker-credentials`,
  );

  return {
    email: String(payload.email ?? "").trim(),
    password: String(payload.password ?? ""),
  };
}

export async function loadEngineBundle(engineId) {
  const payload = await request(
    `/api/data-sources/${encodeURIComponent(engineId)}/worker-bundle`,
  );

  return {
    engine: payload.engine,
    settings: payload.settings,
    sources: payload.sources ?? [],
    status: payload.status,
    pendingRunOnce: payload.pendingRunOnce === true,
    bagRuntime: payload.bagRuntime ?? null,
  };
}

export async function consumeRunOnce(engineId) {
  const payload = await request(
    `/api/data-sources/${encodeURIComponent(engineId)}/run-once/consume`,
    { method: "POST" },
  );
  return payload.pending === true;
}

export async function updateEngineStatus(engineId, patch) {
  await request(`/api/data-sources/${encodeURIComponent(engineId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      actualState: patch.actual_state ?? patch.actualState,
      healthState: patch.health_state ?? patch.healthState,
      workerId: patch.worker_id ?? patch.workerId,
      lastHeartbeatAt: patch.last_heartbeat_at ?? patch.lastHeartbeatAt,
      lastRunAt: patch.last_run_started_at ?? patch.lastRunAt,
      lastError: patch.last_error ?? patch.lastError,
    }),
  });
}

export async function writeHeartbeat(engineId, meta) {
  await updateEngineStatus(engineId, {
    worker_id: meta.workerId,
    actual_state: meta.actualState,
    last_heartbeat_at: new Date().toISOString(),
  });
}

export async function recordRunSuccess(engineId, meta) {
  await request(`/api/data-sources/${encodeURIComponent(engineId)}/run-success`, {
    method: "POST",
    body: JSON.stringify({
      actualState: meta.actualState,
      startedAt: meta.startedAt,
    }),
  });
}

export async function recordRunFailure(engineId, meta) {
  await request(`/api/data-sources/${encodeURIComponent(engineId)}/run-failure`, {
    method: "POST",
    body: JSON.stringify({
      actualState: meta.actualState ?? "error",
      startedAt: meta.startedAt,
      errorMessage: meta.errorMessage,
    }),
  });
}

export async function writeSnapshot(engineId, data, meta) {
  const payload = JSON.stringify(data);
  await request(`/api/data-sources/${encodeURIComponent(engineId)}/snapshots`, {
    method: "POST",
    body: JSON.stringify({
      data,
      recordCount: meta.recordCount,
      payloadSizeBytes: meta.payloadSizeBytes ?? Buffer.byteLength(payload, "utf8"),
      durationMs: meta.durationMs,
    }),
  });
}

export async function writeLog(
  engineId,
  level,
  eventType,
  message,
  metadata = {},
) {
  await request(`/api/data-sources/${encodeURIComponent(engineId)}/logs`, {
    method: "POST",
    body: JSON.stringify({
      level,
      eventType,
      message: message.slice(0, 1000),
      metadata,
    }),
  });
}

export async function pruneLogs() {
  // Local API prunes on insert.
}

export async function claimExportCurrentAuction(engineId) {
  const payload = await request(
    `/api/data-sources/${encodeURIComponent(engineId)}/export-current-auction/claim`,
    { method: "POST" },
  );
  return payload.command ?? null;
}

export async function completeExportCurrentAuction(requestId, result, meta = {}) {
  await request(
    `/api/data-sources/export-current-auction/${encodeURIComponent(requestId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        ...result,
        workerId: meta.workerId,
        operationId: meta.operationId,
      }),
    },
  );
}

export async function failExportCurrentAuction(requestId, errorMessage, meta = {}) {
  await request(
    `/api/data-sources/export-current-auction/${encodeURIComponent(requestId)}/fail`,
    {
      method: "POST",
      body: JSON.stringify({
        error: errorMessage,
        workerId: meta.workerId,
        operationId: meta.operationId,
      }),
    },
  );
}

export async function reportExportStarted(requestId, meta) {
  await request(
    `/api/data-sources/export-current-auction/${encodeURIComponent(requestId)}/started`,
    {
      method: "POST",
      body: JSON.stringify({
        workerId: meta.workerId,
        operationId: meta.operationId,
        projectId: meta.projectId,
      }),
    },
  );
}

export async function reportExportProgress(requestId, progress) {
  await request(
    `/api/data-sources/export-current-auction/${encodeURIComponent(requestId)}/progress`,
    {
      method: "POST",
      body: JSON.stringify(progress),
    },
  );
}

export async function isExportCancelled(requestId) {
  const payload = await request(
    `/api/data-sources/export-current-auction/${encodeURIComponent(requestId)}/cancelled`,
  );
  return payload.cancelled === true;
}

export async function claimNextCommand() {
  return null;
}

export async function failAbandonedCommands() {
  return 0;
}

export async function finalizeCommandSuccess() {}

export async function finalizeCommandFailure() {
  return "";
}
