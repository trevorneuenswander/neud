import { isLocalApiEnabled } from "./local-client.js";
import * as localClient from "./local-client.js";
import { getSupabase } from "./cloud-client.js";

export async function writeSnapshot(engineId, data, meta) {
  if (isLocalApiEnabled()) {
    return localClient.writeSnapshot(engineId, data, meta);
  }

  const supabase = getSupabase();
  const payload = JSON.stringify(data);
  const { error } = await supabase.from("data_engine_snapshots").insert({
    engine_id: engineId,
    data,
    record_count: meta.recordCount,
    payload_size_bytes: Buffer.byteLength(payload, "utf8"),
    duration_ms: meta.durationMs,
    worker_id: meta.workerId,
    captured_at: new Date().toISOString(),
  });

  if (error) throw error;

  await supabase.rpc("prune_data_engine_snapshots", {
    p_engine_id: engineId,
    p_keep_count: 100,
  });
}
