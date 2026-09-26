import fs from "fs";
import path from "path";
import {
  loadSupabasePublicConfigWithSource,
  type SupabasePublicConfigLoadResult,
} from "../services/supabase-public-config";
import type { AppPaths } from "../services/app-paths";
import { registerIpcHandler } from "./channels";

function appendAuthLoginDiagnostic(
  logsDir: string,
  payload: { stage?: unknown; [key: string]: unknown },
): { ok: true } {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const stage = typeof payload.stage === "string" ? payload.stage : "unknown";
    const detail = { ...payload };
    delete detail.stage;
    const line = `[${new Date().toISOString()}] auth-login stage=${stage} detail=${JSON.stringify(detail)}`;
    fs.appendFileSync(path.join(logsDir, "auth-login.log"), `${line}\n`);
  } catch {
    // diagnostics must not break login
  }
  return { ok: true };
}

export function registerSupabasePublicConfigIpc(
  paths: AppPaths,
  resolveConfig: () => SupabasePublicConfigLoadResult = () =>
    loadSupabasePublicConfigWithSource(paths),
) {
  registerIpcHandler("neud:app:getSupabasePublicConfig", () => {
    const loaded = resolveConfig();
    return {
      supabaseUrl: loaded.config?.supabaseUrl ?? null,
      supabasePublishableKey: loaded.config?.supabasePublishableKey ?? null,
      diagnostic: loaded.diagnostic,
    };
  });

  registerIpcHandler("neud:app:recordAuthLoginDiagnostic", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false };
    }
    return appendAuthLoginDiagnostic(paths.logs, payload as Record<string, unknown>);
  });
}
