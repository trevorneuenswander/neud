import fs from "fs";
import type { AppPaths } from "./app-paths";

export type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function loadSupabasePublicConfig(paths: AppPaths): SupabasePublicConfig | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (fromEnv) {
    return {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    };
  }

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
