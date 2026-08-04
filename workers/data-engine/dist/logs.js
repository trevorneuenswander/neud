import { isLocalApiEnabled } from "./local-client.js";
import * as localClient from "./local-client.js";
import { getSupabase } from "./cloud-client.js";

export async function writeLog(engineId, level, eventType, message, metadata = {}) {
  if (isLocalApiEnabled()) {
    return localClient.writeLog(engineId, level, eventType, message, metadata);
  }

  const supabase = getSupabase();
  await supabase.from("data_engine_logs").insert({
    engine_id: engineId,
    level,
    event_type: eventType,
    message: message.slice(0, 1000),
    metadata,
  });
}

export async function pruneLogs(engineId, keepCount = 500) {
  if (isLocalApiEnabled()) {
    return localClient.pruneLogs(engineId, keepCount);
  }

  const supabase = getSupabase();
  await supabase.rpc("prune_data_engine_logs", {
    p_engine_id: engineId,
    p_keep_count: keepCount,
  });
}
