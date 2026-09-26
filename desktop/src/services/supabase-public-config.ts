import fs from "fs";
import type { AppPaths } from "./app-paths";
import {
  describeCloudRuntimeConfig,
  loadPackagedCloudRuntimeConfig,
  type CloudRuntimeConfigDiagnostic,
  type CloudRuntimeConfigSource,
} from "./cloud-runtime-config";
import { isPackagedDesktopRuntime } from "../lib/packaged-runtime";
import { isValidSupabasePublishableKey } from "../lib/supabase-public-config-validation";

export type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const ref = hostname.split(".")[0]?.trim();
    return ref || null;
  } catch {
    return null;
  }
}

export type SupabasePublicConfigLoadResult = {
  config: SupabasePublicConfig | null;
  source: CloudRuntimeConfigSource;
  diagnostic: CloudRuntimeConfigDiagnostic;
};

function loadFromProcessEnv(): SupabasePublicConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }
  return { supabaseUrl, supabasePublishableKey };
}

function loadFromServerEnvFile(paths: AppPaths): SupabasePublicConfig | null {
  if (!fs.existsSync(paths.serverEnvFile)) {
    return null;
  }

  const lines = fs.readFileSync(paths.serverEnvFile, "utf8").split(/\r?\n/);
  const values: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }

  if (!values.NEXT_PUBLIC_SUPABASE_URL || !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  return {
    supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function isUsablePublicConfig(config: SupabasePublicConfig | null): config is SupabasePublicConfig {
  if (!config?.supabaseUrl?.trim() || !config.supabasePublishableKey?.trim()) {
    return false;
  }
  return isValidSupabasePublishableKey(config.supabasePublishableKey);
}

export function loadSupabasePublicConfigWithSource(
  paths: AppPaths,
): SupabasePublicConfigLoadResult {
  if (isPackagedDesktopRuntime()) {
    const fromPackaged = loadPackagedCloudRuntimeConfig();
    if (isUsablePublicConfig(fromPackaged)) {
      return {
        config: fromPackaged,
        source: "packaged_runtime_json",
        diagnostic: describeCloudRuntimeConfig({
          config: fromPackaged,
          source: "packaged_runtime_json",
        }),
      };
    }
  }

  const fromEnv = loadFromProcessEnv();
  if (isUsablePublicConfig(fromEnv)) {
    return {
      config: fromEnv,
      source: "process_env",
      diagnostic: describeCloudRuntimeConfig({
        config: fromEnv,
        source: "process_env",
      }),
    };
  }

  const fromPackaged = loadPackagedCloudRuntimeConfig();
  if (isUsablePublicConfig(fromPackaged)) {
    return {
      config: fromPackaged,
      source: "packaged_runtime_json",
      diagnostic: describeCloudRuntimeConfig({
        config: fromPackaged,
        source: "packaged_runtime_json",
      }),
    };
  }

  const fromServerEnv = loadFromServerEnvFile(paths);
  if (fromServerEnv) {
    return {
      config: fromServerEnv,
      source: "server_env_file",
      diagnostic: describeCloudRuntimeConfig({
        config: fromServerEnv,
        source: "server_env_file",
      }),
    };
  }

  return {
    config: null,
    source: "missing",
    diagnostic: describeCloudRuntimeConfig({
      config: null,
      source: "missing",
    }),
  };
}

export function loadSupabasePublicConfig(paths: AppPaths): SupabasePublicConfig | null {
  return loadSupabasePublicConfigWithSource(paths).config;
}
