#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoRoot } from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import { readSharedCloudAuthDiagnostics } from "./lib/shared-cloud-auth-diagnostics.mjs";
import {
  buildSharedCloudAuthSnapshot,
  resolveAuthenticatedCloudSessionAvailable,
} from "./lib/shared-cloud-auth-snapshot.mjs";

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
      // try next probe
    }
  }
  return false;
}

function resolveFirstCloudFailureStage(input) {
  if (!input.networkReachable) {
    return "network_unreachable";
  }
  if (!input.persistedCloudTokensPresent) {
    return "no_persisted_session";
  }
  if (input.reauthenticationRequired || input.refreshErrorCode === "invalid_refresh_token") {
    return "invalid_refresh_token";
  }
  if (input.accessTokenExpired && input.refreshResult === "failure") {
    return "refresh_failed";
  }
  if (input.accessTokenExpired && !input.refreshAttempted) {
    return "access_token_expired";
  }
  if (!input.authenticatedClientReady) {
    return input.refreshResult === "failure"
      ? "refresh_failed"
      : "authenticated_client_creation_failed";
  }
  if (!input.authenticatedCloudSessionAvailable) {
    return "cloud_services_not_started";
  }
  if (!input.displaySyncRunning || !input.displaySyncAuthenticated) {
    return "display_sync_unavailable";
  }
  if (input.cloudAccessBridgeAvailable === false) {
    return "cloud_access_bridge_unavailable";
  }
  return "none";
}

function parseSetting(settings, key) {
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

async function readLocalDiagnostics(repoRoot) {
  const databasePath = path.join(
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
    "NEUD",
    "data",
    "neud.sqlite",
  );
  const configured = process.env.NEUD_LOCAL_DATABASE_PATH?.trim();
  const resolvedPath = configured ?? databasePath;
  const sessionFilePath = path.join(
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
    "NEUD",
    "config",
    "supabase-user-session.enc",
  );

  if (!fs.existsSync(resolvedPath)) {
    return {
      localDatabasePath: resolvedPath,
      sessionFilePath,
      available: false,
    };
  }

  let initSqlJs;
  try {
    initSqlJs = (await import("sql.js")).default;
  } catch {
    return {
      localDatabasePath: resolvedPath,
      sessionFilePath,
      available: false,
      reason: "sql.js unavailable",
    };
  }

  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    return {
      localDatabasePath: resolvedPath,
      sessionFilePath,
      available: false,
      reason: "wasm missing",
    };
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) =>
      fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
  });
  const db = new SQL.Database(fs.readFileSync(resolvedPath));
  const settingsRows = db.exec(`SELECT key, value_json FROM app_settings`);
  const settings = new Map(
    (settingsRows[0]?.values ?? []).map((row) => [String(row[0]), row[1]]),
  );

  const cloudSessionDiagnostics = parseSetting(settings, "cloudSession.diagnostics");
  const publishingRuntime = parseSetting(settings, "publishing.runtimeStatus");
  const sharedCloudAuth = readSharedCloudAuthDiagnostics(settings);
  db.close();

  const sessionFileExists = fs.existsSync(sessionFilePath);
  const sessionFileBytes = sessionFileExists ? fs.statSync(sessionFilePath).size : 0;

  return {
    localDatabasePath: resolvedPath,
    sessionFilePath,
    available: true,
    persistedSessionRowExists: sessionFileExists,
    encryptedSessionFileBytes: sessionFileBytes,
    encryptedRefreshTokenPresent: sessionFileExists && sessionFileBytes > 0,
    encryptedAccessTokenPresent: sessionFileExists && sessionFileBytes > 0,
    sessionDecryptable: cloudSessionDiagnostics?.persistedSessionDecryptable ?? null,
    mainProcessSessionAvailable: cloudSessionDiagnostics?.sessionStoredInMain ?? null,
    tokenExpiryAt: cloudSessionDiagnostics?.tokenExpiryAt ?? null,
    cloudSessionDiagnostics: cloudSessionDiagnostics ?? null,
    publishingRuntime: publishingRuntime ?? null,
    sharedCloudAuth,
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  const [diagnostics, localState, networkReachable] = await Promise.all([
    readLocalDiagnostics(repoRoot),
    readLocalBroadArrowState(repoRoot),
    probeNetworkReachable(),
  ]);
  const sharedAuthSnapshot = buildSharedCloudAuthSnapshot(diagnostics.sharedCloudAuth ?? null, {
    hasRestorableCloudSession: diagnostics.sharedCloudAuth?.persistedSessionPresent ?? false,
    hasCloudSession: Boolean(
      diagnostics.sharedCloudAuth?.accessTokenPresent &&
        diagnostics.sharedCloudAuth?.refreshTokenPresent &&
        !diagnostics.sharedCloudAuth?.reauthenticationRequired,
    ),
  });

  const profileIndicatorState = sharedAuthSnapshot.authenticatedCloudSessionAvailable
    ? "online"
    : diagnostics.encryptedRefreshTokenPresent
      ? "offline"
      : "sign_in";
  const dashboardConnectionState = sharedAuthSnapshot.authenticatedCloudSessionAvailable
    ? "connected"
    : "offline";
  const usersPageAuthState = sharedAuthSnapshot.authenticatedCloudSessionAvailable
    ? "cloud_ready"
    : diagnostics.encryptedRefreshTokenPresent
      ? "local_or_restorable"
      : "sign_in_required";

  const shared = diagnostics.sharedCloudAuth ?? {};
  const displaySyncRuntime = localState.displaySyncRuntime ?? {};
  const publishingRuntime = localState.publishingRuntime ?? diagnostics.publishingRuntime ?? {};
  const cloudHealth = {
    networkReachable,
    localOfflineSessionValid: null,
    persistedCloudTokensPresent: Boolean(
      diagnostics.encryptedRefreshTokenPresent || shared.refreshTokenPresent,
    ),
    accessTokenPresent: shared.accessTokenPresent ?? diagnostics.encryptedAccessTokenPresent ?? null,
    refreshTokenPresent:
      shared.refreshTokenPresent ?? diagnostics.encryptedRefreshTokenPresent ?? null,
    accessTokenExpired: shared.accessTokenExpired ?? shared.tokenExpired ?? null,
    refreshAttempted: Boolean(shared.refreshAttemptedAt ?? shared.lastRefreshAttemptAt),
    refreshHttpAttempted: shared.refreshHttpAttempted ?? null,
    refreshResult: shared.refreshResult ?? shared.lastRefreshResult ?? null,
    refreshErrorCode: shared.refreshErrorCode ?? shared.lastRefreshErrorCode ?? null,
    refreshErrorCategory: shared.refreshErrorCategory ?? null,
    authenticatedClientCreationAttempted: shared.authenticatedClientCreated ?? null,
    authenticatedClientReady: shared.authenticatedClientReady ?? null,
    authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
    reauthenticationRequired: shared.reauthenticationRequired ?? null,
    sessionGeneration: shared.sessionGeneration ?? null,
    publishingManagerRunning: Boolean(publishingRuntime.running),
    publisherHeartbeatHealthy: Boolean(
      publishingRuntime.heartbeatTimerActive && publishingRuntime.lastHeartbeatSuccessAt,
    ),
    displaySyncRunning: Boolean(displaySyncRuntime.running),
    displaySyncAuthenticated: Boolean(displaySyncRuntime.authenticatedSessionAvailable),
    displaySyncLastResult: displaySyncRuntime.lastSyncResult ?? localState.lastDisplaySyncResult ?? null,
    displaySyncLastError:
      displaySyncRuntime.lastCloudErrorCode ?? localState.lastCloudErrorCode ?? null,
    activitySyncRunning: null,
    activitySyncAuthenticated: null,
    activitySyncLastResult: null,
    cloudAccessBridgeAvailable: null,
    cloudDirectoryRpcAttempted: null,
    cloudDirectoryRpcResult: null,
    firstCloudFailureStage: resolveFirstCloudFailureStage({
      networkReachable,
      persistedCloudTokensPresent: Boolean(
        diagnostics.encryptedRefreshTokenPresent || shared.refreshTokenPresent,
      ),
      reauthenticationRequired: shared.reauthenticationRequired,
      refreshErrorCode: shared.refreshErrorCode ?? shared.lastRefreshErrorCode,
      accessTokenExpired: shared.accessTokenExpired ?? shared.tokenExpired,
      refreshAttempted: Boolean(shared.refreshAttemptedAt ?? shared.lastRefreshAttemptAt),
      refreshResult: shared.refreshResult ?? shared.lastRefreshResult,
      authenticatedClientReady: shared.authenticatedClientReady,
      authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
      displaySyncRunning: displaySyncRuntime.running,
      displaySyncAuthenticated: displaySyncRuntime.authenticatedSessionAvailable,
      cloudAccessBridgeAvailable: null,
    }),
  };

  const summary = {
    ...diagnostics,
    cloudHealth,
    displaySyncRuntime,
    publishingRuntime,
    pendingDisplayRows: localState.pendingDisplayRows ?? null,
    pendingRevisionRows: localState.pendingRevisionRows ?? null,
    sharedAuthSnapshot,
    authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
    profileIndicatorState,
    dashboardConnectionState,
    usersPageAuthState,
    sharedAuthSnapshotState: sharedAuthSnapshot,
    statesAgree:
      (profileIndicatorState === "online" && dashboardConnectionState === "connected") ||
      profileIndicatorState !== "online",
    firstAuthStateDivergence:
      profileIndicatorState === "online" && dashboardConnectionState !== "connected"
        ? "dashboard_vs_profile"
        : "none",
    rendererSignInSucceeded: diagnostics.cloudSessionDiagnostics?.rendererSignInSucceeded ?? null,
    accessTokenReceived: diagnostics.cloudSessionDiagnostics?.accessTokenReceived ?? null,
    refreshTokenReceived: diagnostics.cloudSessionDiagnostics?.refreshTokenReceived ?? null,
    sessionSentToMain: diagnostics.cloudSessionDiagnostics?.sessionSentToMain ?? null,
    sessionStoredInMain: diagnostics.cloudSessionDiagnostics?.sessionStoredInMain ?? null,
    refreshTokenPersisted: diagnostics.cloudSessionDiagnostics?.refreshTokenPersisted ?? null,
    accessTokenPersisted: diagnostics.cloudSessionDiagnostics?.accessTokenPersisted ?? null,
    sessionStoredNotificationFired:
      diagnostics.cloudSessionDiagnostics?.sessionStoredNotificationFired ?? null,
    coordinatorReceivedSession:
      diagnostics.cloudSessionDiagnostics?.coordinatorReceivedSession ?? null,
    cloudServicesStartRequested:
      diagnostics.cloudSessionDiagnostics?.cloudServicesStartRequested ?? null,
    publishingManagerStartRequested:
      diagnostics.cloudSessionDiagnostics?.publishingManagerStartRequested ?? null,
    lastSessionStoreAt: diagnostics.cloudSessionDiagnostics?.lastSessionStoreAt ?? null,
    lastSessionRestoreAt: diagnostics.cloudSessionDiagnostics?.lastSessionRestoreAt ?? null,
    lastSessionErrorCode: diagnostics.cloudSessionDiagnostics?.lastSessionErrorCode ?? null,
    lastNotificationAt: diagnostics.cloudSessionDiagnostics?.lastNotificationAt ?? null,
    publishingManagerStartReason:
      diagnostics.cloudSessionDiagnostics?.lastPublishingManagerStartReason ??
      diagnostics.publishingRuntime?.lastStartReason ??
      null,
    publishingManagerRunning: diagnostics.publishingRuntime?.running ?? false,
    publishingManagerHeartbeatTimerActive:
      diagnostics.publishingRuntime?.heartbeatTimerActive ?? false,
    publishingManagerStartAccepted: diagnostics.publishingRuntime?.startAccepted ?? false,
    publishingManagerStartRejectedReason:
      diagnostics.publishingRuntime?.startRejectedReason ?? null,
    firstHeartbeatAttemptAt: diagnostics.publishingRuntime?.firstHeartbeatAttemptAt ?? null,
    firstHeartbeatResult: diagnostics.publishingRuntime?.firstHeartbeatResult ?? null,
    sharedCloudAuth: diagnostics.sharedCloudAuth ?? null,
    persistedSessionPresent: diagnostics.sharedCloudAuth?.persistedSessionPresent ?? null,
    persistedSessionDecryptable: diagnostics.sharedCloudAuth?.persistedSessionDecryptable ?? null,
    tokenExpired: diagnostics.sharedCloudAuth?.tokenExpired ?? null,
    refreshTokenPresent: diagnostics.sharedCloudAuth?.refreshTokenPresent ?? null,
    lastRefreshAttemptAt: diagnostics.sharedCloudAuth?.lastRefreshAttemptAt ?? null,
    lastRefreshResult: diagnostics.sharedCloudAuth?.lastRefreshResult ?? null,
    lastRefreshErrorCode: diagnostics.sharedCloudAuth?.lastRefreshErrorCode ?? null,
    authenticatedClientReady: diagnostics.sharedCloudAuth?.authenticatedClientReady ?? null,
    reauthenticationRequired: diagnostics.sharedCloudAuth?.reauthenticationRequired ?? null,
    sessionGeneration: diagnostics.sharedCloudAuth?.sessionGeneration ?? null,
    sessionUpdatedAt: diagnostics.sharedCloudAuth?.sessionUpdatedAt ?? null,
    firstSharedCloudFailureStage: diagnostics.sharedCloudAuth?.firstSharedCloudFailureStage ?? null,
    notes: [
      "Boolean diagnostics only. Token values and secrets are intentionally excluded.",
      "Run while NEUD Desktop is closed or immediately after login to inspect persisted handoff state.",
    ],
  };

  const outputPath = path.join(repoRoot, "docs", "desktop-cloud-session-diagnostic.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
