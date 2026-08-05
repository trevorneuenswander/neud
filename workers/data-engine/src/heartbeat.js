import { isLocalApiEnabled } from "./local-client.js";
import * as localClient from "./local-client.js";
import { getSupabase } from "./cloud-client.js";
import { logFirstHeartbeatSent } from "./lifecycle-diagnostics.js";

export async function updateEngineStatus(engineId, patch) {
  if (isLocalApiEnabled()) {
    return localClient.updateEngineStatus(engineId, patch);
  }

  const supabase = getSupabase();
  await supabase
    .from("data_engine_status")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("engine_id", engineId);
}

export async function writeHeartbeat(engineId, meta) {
  logFirstHeartbeatSent({
    engineId,
    workerId: meta.workerId ?? null,
    actualState: meta.actualState ?? null,
    pollIntervalMs: meta.pollIntervalMs ?? null,
  });

  if (isLocalApiEnabled()) {
    return localClient.writeHeartbeat(engineId, meta);
  }

  await updateEngineStatus(engineId, {
    worker_id: meta.workerId,
    worker_version: meta.workerVersion,
    current_interval_ms: meta.pollIntervalMs,
    actual_state: meta.actualState,
    last_heartbeat_at: new Date().toISOString(),
  });
}

export async function recordRunSuccess(engineId, meta) {
  if (isLocalApiEnabled()) {
    return localClient.recordRunSuccess(engineId, meta);
  }

  const supabase = getSupabase();
  const { data: current } = await supabase
    .from("data_engine_status")
    .select("total_runs, successful_runs, average_duration_ms")
    .eq("engine_id", engineId)
    .maybeSingle();

  const totalRuns = (current?.total_runs ?? 0) + 1;
  const successfulRuns = (current?.successful_runs ?? 0) + 1;
  const previousAverage = current?.average_duration_ms ?? 0;
  const averageDuration = previousAverage
    ? Math.round((previousAverage * (successfulRuns - 1) + meta.durationMs) / successfulRuns)
    : meta.durationMs;

  await updateEngineStatus(engineId, {
    actual_state: meta.actualState,
    last_run_started_at: meta.startedAt,
    last_run_succeeded_at: new Date().toISOString(),
    last_duration_ms: meta.durationMs,
    average_duration_ms: averageDuration,
    total_runs: totalRuns,
    successful_runs: successfulRuns,
    last_record_count: meta.recordCount,
    last_payload_size_bytes: meta.payloadSizeBytes,
    last_error: null,
    health_state: "healthy",
  });
}

export async function recordRunFailure(engineId, meta) {
  if (isLocalApiEnabled()) {
    return localClient.recordRunFailure(engineId, meta);
  }

  const supabase = getSupabase();
  const { data: current } = await supabase
    .from("data_engine_status")
    .select("total_runs, failed_runs")
    .eq("engine_id", engineId)
    .maybeSingle();

  await updateEngineStatus(engineId, {
    actual_state: meta.actualState ?? "error",
    last_run_started_at: meta.startedAt,
    last_run_failed_at: new Date().toISOString(),
    total_runs: (current?.total_runs ?? 0) + 1,
    failed_runs: (current?.failed_runs ?? 0) + 1,
    last_error: meta.errorMessage,
    health_state: "error",
  });
}
