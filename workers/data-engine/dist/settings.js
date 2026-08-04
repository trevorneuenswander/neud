import { isLocalApiEnabled } from "./local-client.js";
import * as localClient from "./local-client.js";
import { getSupabase } from "./cloud-client.js";

export async function loadEngineBundle(engineId) {
  if (isLocalApiEnabled()) {
    return localClient.loadEngineBundle(engineId);
  }

  const supabase = getSupabase();
  const { data: engine, error: engineError } = await supabase
    .from("data_engines")
    .select("*")
    .eq("id", engineId)
    .maybeSingle();

  if (engineError || !engine) {
    throw new Error("Data Engine not found.");
  }

  const [{ data: settings }, { data: sources }, { data: status }] =
    await Promise.all([
      supabase
        .from("webpage_scraper_settings")
        .select("*")
        .eq("engine_id", engineId)
        .maybeSingle(),
      supabase
        .from("webpage_scraper_sources")
        .select("*")
        .eq("engine_id", engineId)
        .eq("enabled", true)
        .order("position", { ascending: true }),
      supabase
        .from("data_engine_status")
        .select("*")
        .eq("engine_id", engineId)
        .maybeSingle(),
    ]);

  return { engine, settings, sources: sources ?? [], status };
}

export function getSourceUrl(sources, key) {
  const source = sources.find((row) => row.source_key === key && row.enabled);
  return source?.url ?? null;
}
