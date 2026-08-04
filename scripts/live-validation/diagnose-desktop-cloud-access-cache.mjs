#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSharedCloudAuthDiagnostics } from "./lib/shared-cloud-auth-diagnostics.mjs";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  probeLocalAccessManagementApi,
  resolveLocalApiOrigin,
} from "./lib/shared-local-api-origin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function resolveDatabasePath() {
  const configured = process.env.NEUD_LOCAL_DATABASE_PATH?.trim();
  if (configured) {
    return configured;
  }
  const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
  return path.join(appData, "NEUD", "data", "neud.sqlite");
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

async function openDatabase(databasePath) {
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
  return new SQL.Database(fs.readFileSync(databasePath));
}

async function inspectDatabase(databasePath) {
  if (!fs.existsSync(databasePath)) {
    return {
      databaseExists: false,
      migration035Registered: read("desktop/src/database/migrate.ts").includes("035_cloud_access_cache.sql"),
      migration035Applied: false,
      cloudAccessCacheTableExists: false,
      schemaVersion: null,
      cacheRowCount: 0,
      cacheSyncedAt: null,
      settings: new Map(),
    };
  }

  const db = await openDatabase(databasePath);
  const migration035Registered = read("desktop/src/database/migrate.ts").includes(
    "035_cloud_access_cache.sql",
  );
  const appliedRows = db.exec(
    "SELECT version, name FROM schema_migrations WHERE name = '035_cloud_access_cache.sql'",
  );
  const migration035Applied = appliedRows.length > 0 && appliedRows[0].values.length > 0;
  const tableRows = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cloud_access_cache'",
  );
  const cloudAccessCacheTableExists = tableRows.length > 0 && tableRows[0].values.length > 0;
  let cacheRowCount = 0;
  let cacheSyncedAt = null;
  if (cloudAccessCacheTableExists) {
    const cacheRows = db.exec("SELECT COUNT(*), MAX(synced_at) FROM cloud_access_cache");
    cacheRowCount = Number(cacheRows[0]?.values?.[0]?.[0] ?? 0);
    cacheSyncedAt = cacheRows[0]?.values?.[0]?.[1] ?? null;
  }
  const versionRows = db.exec("SELECT MAX(version) FROM schema_migrations");
  const schemaVersion = versionRows[0]?.values?.[0]?.[0] ?? null;
  const settingsRows = db.exec(`SELECT key, value_json FROM app_settings`);
  const settings = new Map(
    (settingsRows[0]?.values ?? []).map((row) => [String(row[0]), row[1]]),
  );
  db.close();

  return {
    databaseExists: true,
    migration035Registered,
    migration035Applied,
    cloudAccessCacheTableExists,
    cacheRowCount,
    cacheSyncedAt,
    schemaVersion,
    settings,
  };
}

async function fetchLiveDirectoryDiagnostics(settings) {
  const originResolution = resolveLocalApiOrigin({ settings });
  if (!originResolution.sessionToken || typeof originResolution.sessionToken !== "string") {
    return {
      resolvedLocalApiOrigin: originResolution.resolvedLocalApiOrigin,
      localApiReachable: false,
      directoryRouteRegistered: false,
      diagnosticsRouteRegistered: false,
      cloudDirectoryRequestAttemptedAt: null,
      cloudDirectoryRequestResult: "not_attempted",
      directoryProbeCategory: "session_token_missing",
      actualFallbackReason: "local_api_unreachable",
      note: "Local API session token unavailable while desktop is not running.",
    };
  }

  return probeLocalAccessManagementApi({ settings });
}

async function main() {
  const databasePath = resolveDatabasePath();
  const migrateSource = read("desktop/src/database/migrate.ts");
  const repositorySource = read("desktop/src/repositories/cloud-access-cache-repository.ts");
  const inspection = await inspectDatabase(databasePath);
  const cloudSessionDiagnostics = parseSetting(inspection.settings, "cloudSession.diagnostics");
  const sharedCloudAuth = readSharedCloudAuthDiagnostics(inspection.settings);
  const liveDiagnostics = inspection.databaseExists
    ? await fetchLiveDirectoryDiagnostics(inspection.settings)
    : {
        cloudDirectoryRequestAttemptedAt: null,
        cloudDirectoryRequestResult: "not_attempted",
      };

  const authenticatedCloudSessionAvailable =
    liveDiagnostics.authenticatedCloudSessionAvailable ??
    (Boolean(sharedCloudAuth.authenticatedClientReady) && !sharedCloudAuth.reauthenticationRequired) ??
    Boolean(cloudSessionDiagnostics?.sessionStoredInMain);

  const actualFallbackReason = liveDiagnostics.actualFallbackReason ??
    (!inspection.cloudAccessCacheTableExists
      ? "schema_missing"
      : inspection.cacheRowCount > 0
        ? "none"
        : authenticatedCloudSessionAvailable
          ? "cache_empty"
          : "no_session");

  const result = {
    completedAt: new Date().toISOString(),
    localDatabasePath: databasePath,
    defaultLocalApiOrigin: DEFAULT_LOCAL_API_ORIGIN,
    resolvedLocalApiOrigin:
      liveDiagnostics.resolvedLocalApiOrigin ??
      resolveLocalApiOrigin({ settings: inspection.settings }).resolvedLocalApiOrigin,
    localApiReachable: liveDiagnostics.localApiReachable ?? false,
    directoryRouteRegistered: liveDiagnostics.directoryRouteRegistered ?? false,
    diagnosticsRouteRegistered: liveDiagnostics.diagnosticsRouteRegistered ?? false,
    directoryResponseParsed: liveDiagnostics.directoryResponseParsed ?? false,
    directoryProbeCategory: liveDiagnostics.directoryProbeCategory ?? null,
    healthHttpStatus: liveDiagnostics.healthHttpStatus ?? null,
    migration035Registered: inspection.migration035Registered,
    migration035Applied: inspection.migration035Applied,
    cloudAccessCacheTableExists: inspection.cloudAccessCacheTableExists,
    cacheRepositoryUsesMatchingTableName:
      repositorySource.includes("cloud_access_cache") &&
      repositorySource.includes("Access cache could not be initialized"),
    cacheRepositoryRegisteredInMigrate:
      migrateSource.indexOf("035_cloud_access_cache.sql") >= 0,
    schemaVersion: inspection.schemaVersion,
    cacheRowCount: liveDiagnostics.cacheRowCount ?? inspection.cacheRowCount ?? 0,
    cacheSyncedAt: liveDiagnostics.cacheSyncedAt ?? inspection.cacheSyncedAt ?? null,
    lastCacheReadResult: !inspection.cloudAccessCacheTableExists
      ? "schema_missing"
      : (liveDiagnostics.cacheRowCount ?? inspection.cacheRowCount) > 0
        ? "cache_present"
        : "cache_empty",
    authenticatedCloudSessionAvailable,
    cloudSessionRestoreAt:
      liveDiagnostics.cloudSessionRestoreAt ??
      cloudSessionDiagnostics?.lastSessionRestoreAt ??
      null,
    cloudDirectoryRequestAttemptedAt: liveDiagnostics.cloudDirectoryRequestAttemptedAt ?? null,
    cloudDirectoryRequestResult: liveDiagnostics.cloudDirectoryRequestResult ?? "not_attempted",
    cloudDirectoryHttpStatus: liveDiagnostics.cloudDirectoryHttpStatus ?? null,
    cloudDirectoryRpcAttempted: liveDiagnostics.cloudDirectoryRpcAttempted ?? false,
    cloudDirectoryRpcResult: liveDiagnostics.cloudDirectoryRpcResult ?? "not_attempted",
    cloudDirectoryErrorCode: liveDiagnostics.cloudDirectoryErrorCode ?? null,
    cloudDirectoryParsed: liveDiagnostics.cloudDirectoryParsed ?? false,
    cloudDirectoryEntityCounts: liveDiagnostics.cloudDirectoryEntityCounts ?? {
      teams: 0,
      users: 0,
      projects: 0,
      invitations: 0,
    },
    cacheWriteAttempted: liveDiagnostics.cacheWriteAttempted ?? false,
    cacheWriteSucceeded: liveDiagnostics.cacheWriteSucceeded ?? false,
    sessionServiceInstanceIdHash: liveDiagnostics.sessionServiceInstanceIdHash ?? null,
    cloudAccessBridgeInstanceInitialized:
      liveDiagnostics.cloudAccessBridgeInstanceInitialized ?? false,
    bridgeUsesSharedSessionService: liveDiagnostics.bridgeUsesSharedSessionService ?? false,
    persistedTokensPresent:
      liveDiagnostics.persistedTokensPresent ?? authenticatedCloudSessionAvailable,
    authenticatedClientCreationAttempted:
      liveDiagnostics.authenticatedClientCreationAttempted ?? false,
    authenticatedClientCreationResult:
      liveDiagnostics.authenticatedClientCreationResult ?? "not_attempted",
    authenticatedClientCreationErrorCode:
      liveDiagnostics.authenticatedClientCreationErrorCode ?? null,
    sessionRefreshAttempted: liveDiagnostics.sessionRefreshAttempted ?? false,
    sessionRefreshResult: liveDiagnostics.sessionRefreshResult ?? "not_attempted",
    directoryRpcAttempted:
      liveDiagnostics.directoryRpcAttempted ?? liveDiagnostics.cloudDirectoryRpcAttempted ?? false,
    firstCloudAccessFailureStage: liveDiagnostics.firstCloudAccessFailureStage ?? sharedCloudAuth.firstSharedCloudFailureStage ?? "none",
    sharedCloudAuth,
    reauthenticationRequired: sharedCloudAuth.reauthenticationRequired ?? false,
    authenticatedClientReady: sharedCloudAuth.authenticatedClientReady ?? false,
    actualFallbackReason,
    recommendedFallbackReason: actualFallbackReason,
    safeToDeleteDatabase: false,
    notes: [
      liveDiagnostics.localApiReachable
        ? "Live local API probes succeeded against the running desktop."
        : liveDiagnostics.directoryProbeCategory === "connection_refused"
          ? "Local API connection was refused. Confirm NEUD Desktop is open and the origin matches resolvedLocalApiOrigin."
          : liveDiagnostics.directoryProbeCategory === "route_not_found"
            ? "Local API responded but the cloud directory route was missing."
            : liveDiagnostics.directoryProbeCategory === "session_token_missing"
              ? "Local API session token unavailable while desktop is not running."
              : "Run while NEUD Desktop is open to populate live directory diagnostics from the local API.",
      "Token values, emails, and directory contents are intentionally excluded.",
    ],
  };

  const outputPath = path.join(repoRoot, "docs", "desktop-cloud-access-cache-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
