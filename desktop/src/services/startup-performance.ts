import { getCloudAccessStartupMetrics } from "./authenticated-client-provider";
import { getAppSettingsWriteMetrics } from "../repositories/app-settings-repository";
import { getSqlitePersistMetrics } from "../database/connection";

const startupOriginMs = Date.now();
const phases: Array<{ name: string; elapsedMs: number; meta?: Record<string, unknown> }> = [];

export function isStartupDebugEnabled(): boolean {
  return process.env.NEUD_DEBUG_STARTUP === "1" || process.env.NEUD_DEBUG === "1";
}

export function markStartupPhase(name: string, meta: Record<string, unknown> = {}): void {
  const elapsedMs = Date.now() - startupOriginMs;
  phases.push({ name, elapsedMs, meta });
  if (isStartupDebugEnabled()) {
    console.info(`[Startup] ${name} +${elapsedMs}ms`, Object.keys(meta).length ? meta : "");
  }
}

export function printStartupPerformanceSummary(): void {
  if (!isStartupDebugEnabled()) {
    return;
  }

  const pick = (name: string) => phases.find((entry) => entry.name === name)?.elapsedMs ?? null;

  console.info("Startup Performance");
  console.info("-------------------");
  console.info(`Electron origin: 0 ms`);
  console.info(`SQLite ready: ${pick("sqlite.ready") ?? "—"} ms`);
  console.info(`Auth restore waited: ${pick("auth.restore.waited") ?? "—"} ms`);
  console.info(`Identity reconciled: ${pick("identity.reconciled") ?? "—"} ms`);
  console.info(`Local API ready: ${pick("local_api.ready") ?? "—"} ms`);
  console.info(`Cloud bootstrap complete: ${pick("cloud.bootstrap.complete") ?? "—"} ms`);
  console.info(`Renderer load requested: ${pick("renderer.load.requested") ?? "—"} ms`);
  console.info(`Window shown: ${pick("window.shown") ?? "—"} ms`);

  const cloud = getCloudAccessStartupMetrics();
  console.info(
    `CloudAccess client requests: ${cloud.clientRequestCount} (refresh attempts: ${cloud.sessionRefreshAttempts}, cache hits: ${cloud.clientCacheHits})`,
  );

  const settings = getAppSettingsWriteMetrics();
  console.info(
    `SQLite app_settings writes: ${settings.writes} (skipped unchanged: ${settings.skippedUnchanged})`,
  );
  const categories = Object.entries(settings.byCategory).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (categories.length > 0) {
    console.info("SQLite app_settings writes by category:");
    for (const [category, count] of categories) {
      console.info(`  ${category}: ${count}`);
    }
  }

  const sqlite = getSqlitePersistMetrics();
  console.info(`SQLite persist/export count: ${sqlite.persistCount}`);
}
