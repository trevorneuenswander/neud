#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export function resolveLocalDatabasePath(repoRoot) {
  const configured = process.env.NEUD_LOCAL_DATABASE_PATH?.trim();
  if (configured) {
    return configured;
  }
  const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
  return path.join(appData, "NEUD", "data", "neud.sqlite");
}

export function parseSetting(settings, key) {
  const raw = settings?.get?.(key);
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}

export async function openLocalSettingsDatabase(databasePath, repoRoot) {
  const initSqlJs = (await import("sql.js")).default;
  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "dist", "database", "assets", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    throw new Error("sql-wasm.wasm not found for diagnostics.");
  }
  const SQL = await initSqlJs({
    locateFile: (fileName) => (fileName === "sql-wasm.wasm" ? wasmPath : wasmPath),
  });
  const db = new SQL.Database(fs.readFileSync(databasePath));
  const settingsRows = db.exec(`SELECT key, value_json FROM app_settings`);
  const settings = new Map(
    (settingsRows[0]?.values ?? []).map((row) => [String(row[0]), row[1]]),
  );
  db.close();
  return settings;
}

export function readSharedCloudAuthDiagnostics(settings) {
  return (
    parseSetting(settings, "sharedCloudAuth.diagnostics") ?? {
      persistedSessionPresent: false,
      persistedSessionDecryptable: false,
      tokenExpiryAt: null,
      tokenExpired: false,
      refreshTokenPresent: false,
      accessTokenPresent: false,
      accessTokenExpired: false,
      refreshAttemptedAt: null,
      refreshHttpAttempted: false,
      refreshHttpStatus: null,
      refreshSupabaseErrorCode: null,
      refreshSupabaseErrorName: null,
      refreshSafeMessage: null,
      refreshResult: "not_attempted",
      refreshErrorCode: null,
      refreshErrorCategory: null,
      refreshTokenChangedAfterSuccess: false,
      responseContainedSession: false,
      responseContainedAccessToken: false,
      responseContainedRefreshToken: false,
      configuredSupabaseProjectRef: null,
      storedSessionIssuerProjectRef: null,
      projectRefsMatch: null,
      configSource: null,
      publicConfigPresent: false,
      firstRefreshFailureStage: null,
      runtimeKind: null,
      nodeVersion: null,
      electronVersion: null,
      nativeWebSocketAvailable: null,
      configuredWebSocketTransport: null,
      supabaseClientFactory: null,
      realtimeEnabled: null,
      authRefreshTransportReady: null,
      refreshTokenRotated: false,
      refreshedSessionPersisted: false,
      authenticatedClientCreated: false,
      setSessionSucceeded: false,
      authenticatedClientReady: false,
      reauthenticationRequired: false,
      sessionGeneration: 0,
      sessionUpdatedAt: null,
      lastRefreshAttemptAt: null,
      lastRefreshResult: "not_attempted",
      lastRefreshErrorCode: null,
      firstSharedCloudFailureStage: "none",
      sessionNotificationFired: false,
      sessionServiceInstanceIdHash: null,
      updatedAt: null,
    }
  );
}
