import fs from "fs";
import path from "path";
import { app } from "electron";
import type { SupabasePublicConfig } from "./supabase-public-config";
import { isPackagedDesktopRuntime } from "../lib/packaged-runtime";
import { isValidSupabasePublishableKey } from "../lib/supabase-public-config-validation";

export type CloudRuntimeConfigSource =
  | "process_env"
  | "packaged_runtime_json"
  | "server_env_file"
  | "missing";

export type CloudRuntimeConfigDiagnostic = {
  configPresent: boolean;
  urlHost: string | null;
  keyPresent: boolean;
  source: CloudRuntimeConfigSource;
  validationResult: "valid" | "missing" | "invalid";
  configPath: string | null;
};

function packagedCloudConfigPath(): string {
  return path.join(process.resourcesPath, "runtime-config", "cloud.json");
}

function parseUrlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function loadPackagedCloudRuntimeConfig(): SupabasePublicConfig | null {
  if (!isPackagedDesktopRuntime()) {
    return null;
  }

  const configPath = packagedCloudConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      supabaseUrl?: string;
      supabasePublishableKey?: string;
    };
    if (!parsed.supabaseUrl || !parsed.supabasePublishableKey) {
      return null;
    }
    if (!isValidSupabasePublishableKey(parsed.supabasePublishableKey)) {
      return null;
    }
    return {
      supabaseUrl: parsed.supabaseUrl,
      supabasePublishableKey: parsed.supabasePublishableKey,
    };
  } catch {
    return null;
  }
}

export function describeCloudRuntimeConfig(input: {
  config: SupabasePublicConfig | null;
  source: CloudRuntimeConfigSource;
}): CloudRuntimeConfigDiagnostic {
  const configPath =
    input.source === "packaged_runtime_json" && isPackagedDesktopRuntime()
      ? packagedCloudConfigPath()
      : null;

  if (!input.config) {
    return {
      configPresent: false,
      urlHost: null,
      keyPresent: false,
      source: input.source,
      validationResult: input.source === "missing" ? "missing" : "invalid",
      configPath,
    };
  }

  return {
    configPresent: true,
    urlHost: parseUrlHost(input.config.supabaseUrl),
    keyPresent: Boolean(input.config.supabasePublishableKey),
    source: input.source,
    validationResult: "valid",
    configPath,
  };
}

export function writeCloudRuntimeConfigDiagnostic(
  logsDir: string,
  diagnostic: CloudRuntimeConfigDiagnostic,
): void {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const line = [
      `[${new Date().toISOString()}]`,
      "cloud-config",
      `present=${diagnostic.configPresent}`,
      `source=${diagnostic.source}`,
      `urlHost=${diagnostic.urlHost ?? "none"}`,
      `keyPresent=${diagnostic.keyPresent}`,
      `validation=${diagnostic.validationResult}`,
      diagnostic.configPath ? `path=${diagnostic.configPath}` : "path=none",
    ].join(" ");
    fs.appendFileSync(path.join(logsDir, "startup-bootstrap.log"), `${line}\n`);
  } catch {
    // diagnostics must not break startup
  }
}

export function isDesktopPackaged(): boolean {
  return app?.isPackaged === true || isPackagedDesktopRuntime();
}
