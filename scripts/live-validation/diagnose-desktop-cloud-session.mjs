#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoRoot } from "./lib/env.mjs";
import { readSharedCloudAuthDiagnostics } from "./lib/shared-cloud-auth-diagnostics.mjs";
import {
  buildSharedCloudAuthSnapshot,
  resolveAuthenticatedCloudSessionAvailable,
} from "./lib/shared-cloud-auth-snapshot.mjs";

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
  const diagnostics = await readLocalDiagnostics(repoRoot);
  const sharedAuthSnapshot = buildSharedCloudAuthSnapshot(diagnostics.sharedCloudAuth ?? null, {
    hasRestorableCloudSession: diagnostics.sharedCloudAuth?.persistedSessionPresent ?? false,
    hasCloudSession: Boolean(
      diagnostics.sharedCloudAuth?.accessTokenPresent &&
        diagnostics.sharedCloudAuth?.refreshTokenPresent &&
        !diagnostics.sharedCloudAuth?.reauthenticationRequired,
    ),
  });

  const summary = {
    ...diagnostics,
    sharedAuthSnapshot,
    authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
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
