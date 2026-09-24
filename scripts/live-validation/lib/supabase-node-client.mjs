import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export const NODE_SUPABASE_CLIENT_FACTORY = "createNodeSupabaseClient";

export function getNodeSupabaseRuntimeDiagnostics() {
  const nodeVersion = process.versions.node ?? "unknown";
  const electronVersion = process.versions.electron ?? null;
  const nativeWebSocketAvailable = typeof globalThis.WebSocket !== "undefined";
  return {
    runtimeKind: electronVersion ? "electron-main" : "node-script",
    nodeVersion,
    electronVersion,
    nativeWebSocketAvailable,
    configuredWebSocketTransport: "ws",
    supabaseClientFactory: NODE_SUPABASE_CLIENT_FACTORY,
    realtimeEnabled: true,
    authRefreshTransportReady: true,
  };
}

export function buildNodeSupabaseClientOptions(overrides = {}) {
  const transport = overrides.realtime?.transport ?? WebSocket;
  return {
    ...overrides,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      ...overrides.auth,
    },
    realtime: {
      ...overrides.realtime,
      transport,
    },
  };
}

export function createNodeSupabaseClient(url, key, overrides = {}) {
  return createClient(url, key, buildNodeSupabaseClientOptions(overrides));
}
