import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import WebSocket from "ws";
import type { SupabasePublicConfig } from "./supabase-public-config";

export const DESKTOP_SUPABASE_CLIENT_FACTORY = "createDesktopSupabaseClient";

export type DesktopSupabaseRuntimeDiagnostics = {
  runtimeKind: "electron-main" | "node-script";
  nodeVersion: string;
  electronVersion: string | null;
  nativeWebSocketAvailable: boolean;
  configuredWebSocketTransport: "ws";
  supabaseClientFactory: typeof DESKTOP_SUPABASE_CLIENT_FACTORY;
  realtimeEnabled: true;
  authRefreshTransportReady: true;
};

export function getDesktopSupabaseRuntimeDiagnostics(): DesktopSupabaseRuntimeDiagnostics {
  const nodeVersion = process.versions.node ?? "unknown";
  const electronVersion = process.versions.electron ?? null;
  const nativeWebSocketAvailable = typeof globalThis.WebSocket !== "undefined";
  return {
    runtimeKind: electronVersion ? "electron-main" : "node-script",
    nodeVersion,
    electronVersion,
    nativeWebSocketAvailable,
    configuredWebSocketTransport: "ws",
    supabaseClientFactory: DESKTOP_SUPABASE_CLIENT_FACTORY,
    realtimeEnabled: true,
    authRefreshTransportReady: true,
  };
}

/** Node/Electron Realtime transport required by @supabase/realtime-js when native WebSocket is absent. */
export function getDesktopSupabaseWebSocketTransport(): typeof globalThis.WebSocket {
  return WebSocket as unknown as typeof globalThis.WebSocket;
}

export function buildDesktopSupabaseClientOptions(
  overrides: SupabaseClientOptions<"public"> = {},
): SupabaseClientOptions<"public"> {
  const baseAuth = {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  };
  const baseRealtime = {
    transport: getDesktopSupabaseWebSocketTransport(),
  };

  return {
    ...overrides,
    auth: {
      ...baseAuth,
      ...overrides.auth,
    },
    realtime: {
      ...baseRealtime,
      ...overrides.realtime,
      transport:
        overrides.realtime?.transport ?? getDesktopSupabaseWebSocketTransport(),
    },
  };
}

export function createDesktopSupabaseClient(
  config: SupabasePublicConfig,
  overrides: SupabaseClientOptions<"public"> = {},
): SupabaseClient {
  return createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    buildDesktopSupabaseClientOptions(overrides),
  );
}
