#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot } from "./lib/env.mjs";
import { readSharedCloudAuthDiagnostics } from "./lib/shared-cloud-auth-diagnostics.mjs";
import { openLocalSettingsDatabase, resolveLocalDatabasePath } from "./lib/shared-cloud-auth-diagnostics.mjs";
import { buildSharedCloudAuthSnapshot } from "./lib/shared-cloud-auth-snapshot.mjs";
import { getNodeSupabaseRuntimeDiagnostics } from "./lib/supabase-node-client.mjs";

async function probeNetworkReachable() {
  const urls = [
    "https://www.msftconnecttest.com/connecttest.txt",
    "https://connectivitycheck.gstatic.com/generate_204",
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok || response.status === 204) {
        return true;
      }
    } catch {
      // try next
    }
  }
  return false;
}

function readConfiguredProjectRef(repoRoot) {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (envUrl) {
    try {
      return new URL(envUrl).hostname.split(".")[0] ?? null;
    } catch {
      return null;
    }
  }
  const packaged = path.join(repoRoot, "desktop", "resources", "runtime-config", "cloud.json");
  if (fs.existsSync(packaged)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packaged, "utf8"));
      if (parsed.supabaseUrl) {
        return new URL(parsed.supabaseUrl).hostname.split(".")[0] ?? null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  const databasePath = resolveLocalDatabasePath(repoRoot);
  const networkReachable = await probeNetworkReachable();
  const configuredSupabaseProjectRef = readConfiguredProjectRef(repoRoot);

  let shared = createEmptyDiagnostics();
  if (fs.existsSync(databasePath)) {
    try {
      const settings = await openLocalSettingsDatabase(databasePath, repoRoot);
      shared = readSharedCloudAuthDiagnostics(settings);
    } catch {
      shared = createEmptyDiagnostics();
    }
  }

  const snapshot = buildSharedCloudAuthSnapshot(shared, {
    hasRestorableCloudSession: Boolean(shared.refreshTokenPresent),
    hasCloudSession: Boolean(shared.accessTokenPresent && shared.refreshTokenPresent),
  });

  const runtimeDiagnostics = getNodeSupabaseRuntimeDiagnostics();

  const report = {
    ...runtimeDiagnostics,
    networkReachable,
    publicConfigPresent: shared.publicConfigPresent ?? Boolean(configuredSupabaseProjectRef),
    configuredSupabaseProjectRef:
      shared.configuredSupabaseProjectRef ?? configuredSupabaseProjectRef,
    persistedSessionPresent: shared.persistedSessionPresent ?? false,
    persistedSessionDecryptable: shared.persistedSessionDecryptable ?? false,
    refreshTokenPresent: shared.refreshTokenPresent ?? false,
    accessTokenExpired: shared.accessTokenExpired ?? shared.tokenExpired ?? null,
    refreshHttpAttempted: shared.refreshHttpAttempted ?? false,
    refreshHttpStatus: shared.refreshHttpStatus ?? null,
    refreshSupabaseErrorCode: shared.refreshSupabaseErrorCode ?? null,
    refreshSupabaseErrorName: shared.refreshSupabaseErrorName ?? null,
    refreshSafeMessage: shared.refreshSafeMessage ?? null,
    refreshErrorCategory: shared.refreshErrorCategory ?? null,
    responseContainedSession: shared.responseContainedSession ?? false,
    responseContainedAccessToken: shared.responseContainedAccessToken ?? false,
    responseContainedRefreshToken: shared.responseContainedRefreshToken ?? false,
    refreshTokenRotated: shared.refreshTokenRotated ?? false,
    refreshTokenChangedAfterSuccess: shared.refreshTokenChangedAfterSuccess ?? false,
    refreshedSessionPersisted: shared.refreshedSessionPersisted ?? false,
    storedSessionIssuerProjectRef: shared.storedSessionIssuerProjectRef ?? null,
    projectRefsMatch: shared.projectRefsMatch ?? null,
    configSource: shared.configSource ?? null,
    authenticatedClientReady: shared.authenticatedClientReady ?? false,
    authenticatedCloudSessionAvailable: snapshot.authenticatedCloudSessionAvailable,
    reauthenticationRequired: shared.reauthenticationRequired ?? false,
    sessionGeneration: shared.sessionGeneration ?? 0,
    firstRefreshFailureStage: shared.firstRefreshFailureStage ?? shared.firstSharedCloudFailureStage ?? null,
    lastRefreshResult: shared.lastRefreshResult ?? null,
    lastRefreshErrorCode: shared.lastRefreshErrorCode ?? null,
    localDatabasePath: databasePath,
    note: "Run with NEUD Desktop started recently so sharedCloudAuth.diagnostics reflects the latest refresh attempt.",
  };

  console.log(JSON.stringify(report, null, 2));
}

function createEmptyDiagnostics() {
  return {
    persistedSessionPresent: false,
    persistedSessionDecryptable: false,
    refreshTokenPresent: false,
    accessTokenExpired: false,
    refreshHttpAttempted: false,
    refreshHttpStatus: null,
    refreshSupabaseErrorCode: null,
    refreshSupabaseErrorName: null,
    refreshSafeMessage: null,
    refreshErrorCategory: null,
    responseContainedSession: false,
    refreshTokenRotated: false,
    refreshTokenChangedAfterSuccess: false,
    refreshedSessionPersisted: false,
    configuredSupabaseProjectRef: null,
    storedSessionIssuerProjectRef: null,
    projectRefsMatch: null,
    configSource: null,
    publicConfigPresent: false,
    authenticatedClientReady: false,
    reauthenticationRequired: false,
    sessionGeneration: 0,
    firstRefreshFailureStage: null,
    firstSharedCloudFailureStage: "none",
    lastRefreshResult: "not_attempted",
    lastRefreshErrorCode: null,
    tokenExpired: false,
    accessTokenPresent: false,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
