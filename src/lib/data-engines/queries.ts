import { LOG_DISPLAY_COUNT } from "@/lib/data-engines/constants";
import type {
  DataEngine,
  DataEngineCommand,
  DataEngineListItem,
  DataEngineLog,
  DataEngineSnapshot,
  DataEngineStatus,
  WebpageScraperSettings,
  WebpageScraperSource,
} from "@/lib/data-engines/types";
import {
  localGetEngineDetail,
  localGetProjectEngines,
} from "@/lib/local/api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { createClient } from "@/lib/supabase/server";

export async function getProjectEngines(
  projectId: string,
): Promise<DataEngineListItem[]> {
  if (shouldUseLocalData()) {
    const { getVisibleProjects } = await import("@/lib/projects/queries");
    const projects = await getVisibleProjects();
    const match = projects.find((item) => item.id === projectId);
    if (!match) return [];

    try {
      const { engines } = await localGetProjectEngines(match.slug);
      return engines as DataEngineListItem[];
    } catch {
      return [];
    }
  }

  const supabase = await createClient();

  const { data: engines, error } = await supabase
    .from("data_engines")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error || !engines?.length) {
    return [];
  }

  const engineIds = engines.map((engine) => engine.id);

  const { data: statuses } = await supabase
    .from("data_engine_status")
    .select("*")
    .in("engine_id", engineIds);

  const { data: settings } = await supabase
    .from("webpage_scraper_settings")
    .select("*")
    .in("engine_id", engineIds);

  const statusMap = new Map(
    (statuses as DataEngineStatus[] | null)?.map((row) => [row.engine_id, row]) ?? [],
  );
  const settingsMap = new Map(
    (settings as WebpageScraperSettings[] | null)?.map((row) => [row.engine_id, row]) ?? [],
  );

  return (engines as DataEngine[]).map((engine) => ({
    ...engine,
    status: statusMap.get(engine.id) ?? {
      engine_id: engine.id,
      actual_state: "offline",
      health_state: "unknown",
      worker_id: null,
      worker_version: null,
      last_heartbeat_at: null,
      last_run_started_at: null,
      last_run_succeeded_at: null,
      last_run_failed_at: null,
      current_interval_ms: null,
      total_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
      last_duration_ms: null,
      average_duration_ms: null,
      last_record_count: null,
      last_payload_size_bytes: null,
      last_error: null,
      updated_at: engine.created_at,
    },
    settings: settingsMap.get(engine.id) ?? null,
  }));
}

export async function getEngineById(engineId: string): Promise<DataEngine | null> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      return (bundle.engine as DataEngine | undefined) ?? null;
    } catch {
      return null;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engines")
    .select("*")
    .eq("id", engineId)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataEngine;
}

export async function getEngineForProject(
  projectId: string,
  engineKey: string,
): Promise<DataEngine | null> {
  if (shouldUseLocalData()) {
    const engines = await getProjectEngines(projectId);
    return engines.find((engine) => engine.engine_key === engineKey) ?? null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engines")
    .select("*")
    .eq("project_id", projectId)
    .eq("engine_key", engineKey)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataEngine;
}

export async function getEngineStatus(
  engineId: string,
): Promise<DataEngineStatus | null> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      return (bundle.status as DataEngineStatus | null | undefined) ?? null;
    } catch {
      return null;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engine_status")
    .select("*")
    .eq("engine_id", engineId)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataEngineStatus;
}

export async function getScraperSettings(
  engineId: string,
): Promise<WebpageScraperSettings | null> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      return (bundle.settings as WebpageScraperSettings | null | undefined) ?? null;
    } catch {
      return null;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webpage_scraper_settings")
    .select("*")
    .eq("engine_id", engineId)
    .maybeSingle();

  if (error || !data) return null;
  return data as WebpageScraperSettings;
}

export async function getScraperSources(
  engineId: string,
): Promise<WebpageScraperSource[]> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      return (bundle.sources as WebpageScraperSource[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webpage_scraper_sources")
    .select("*")
    .eq("engine_id", engineId)
    .order("position", { ascending: true });

  if (error || !data) return [];
  return data as WebpageScraperSource[];
}

export async function getLatestSnapshot(
  engineId: string,
): Promise<DataEngineSnapshot | null> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      return (bundle.latestSnapshot as DataEngineSnapshot | null | undefined) ?? null;
    } catch {
      return null;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engine_snapshots")
    .select("*")
    .eq("engine_id", engineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataEngineSnapshot;
}

export async function getRecentSnapshots(
  engineId: string,
  limit = 100,
): Promise<DataEngineSnapshot[]> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      const snapshots =
        (bundle.recentSnapshots as DataEngineSnapshot[] | undefined) ?? [];
      return snapshots.slice(0, limit);
    } catch {
      return [];
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engine_snapshots")
    .select("*")
    .eq("engine_id", engineId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as DataEngineSnapshot[];
}

export async function getEngineLogs(
  engineId: string,
  level?: string,
  limit = LOG_DISPLAY_COUNT,
): Promise<DataEngineLog[]> {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      const logs = (bundle.logs as DataEngineLog[] | undefined) ?? [];
      if (level && level !== "all") {
        return logs.filter((entry) => entry.level === level).slice(0, limit);
      }
      return logs.slice(0, limit);
    } catch {
      return [];
    }
  }

  const supabase = await createClient();
  let query = supabase
    .from("data_engine_logs")
    .select("*")
    .eq("engine_id", engineId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (level && level !== "all") {
    query = query.eq("level", level);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as DataEngineLog[];
}

export async function getPendingCommand(
  engineId: string,
): Promise<DataEngineCommand | null> {
  if (shouldUseLocalData()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engine_commands")
    .select("*")
    .eq("engine_id", engineId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataEngineCommand;
}

export async function getLatestCommand(
  engineId: string,
): Promise<DataEngineCommand | null> {
  if (shouldUseLocalData()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_engine_commands")
    .select("*")
    .eq("engine_id", engineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataEngineCommand;
}

export async function countActiveCommands(engineId: string): Promise<number> {
  if (shouldUseLocalData()) {
    return 0;
  }

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("data_engine_commands")
    .select("id", { count: "exact", head: true })
    .eq("engine_id", engineId)
    .in("status", ["pending", "processing"]);

  if (error || count === null) return 0;
  return count;
}

/** @deprecated Use countActiveCommands */
export async function countPendingCommands(engineId: string): Promise<number> {
  return countActiveCommands(engineId);
}

export async function getEngineDetailBundle(
  projectSlug: string,
  engineId: string,
) {
  if (shouldUseLocalData()) {
    try {
      const bundle = await localGetEngineDetail(engineId);
      return {
        engine: bundle.engine as DataEngine,
        status: (bundle.status as DataEngineStatus | null | undefined) ?? null,
        settings:
          (bundle.settings as WebpageScraperSettings | null | undefined) ?? null,
        sources: (bundle.sources as WebpageScraperSource[] | undefined) ?? [],
        latestSnapshot:
          (bundle.latestSnapshot as DataEngineSnapshot | null | undefined) ?? null,
        recentSnapshots:
          (bundle.recentSnapshots as DataEngineSnapshot[] | undefined) ?? [],
        logs: (bundle.logs as DataEngineLog[] | undefined) ?? [],
        pendingCommand: null,
        latestCommand: null,
        activeCommandCount: 0,
        bagContamination:
          (bundle.bagContamination as { untouchedKeys: string[] } | null | undefined) ??
          null,
        adapterContamination:
          (bundle.adapterContamination as { adapter: string } | null | undefined) ??
          null,
      };
    } catch {
      return null;
    }
  }

  const engine = await getEngineById(engineId);
  if (!engine) return null;

  const [
    status,
    settings,
    sources,
    latestSnapshot,
    recentSnapshots,
    logs,
    pendingCommand,
    latestCommand,
    activeCommandCount,
  ] = await Promise.all([
    getEngineStatus(engineId),
    getScraperSettings(engineId),
    getScraperSources(engineId),
    getLatestSnapshot(engineId),
    getRecentSnapshots(engineId, 100),
    getEngineLogs(engineId),
    getPendingCommand(engineId),
    getLatestCommand(engineId),
    countActiveCommands(engineId),
  ]);

  return {
    engine,
    status,
    settings,
    sources,
    latestSnapshot,
    recentSnapshots,
    logs,
    pendingCommand,
    latestCommand,
    activeCommandCount,
    bagContamination: null,
    adapterContamination: null,
  };
}
