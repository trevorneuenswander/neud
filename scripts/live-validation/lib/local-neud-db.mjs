import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";

export function resolveLocalNeudDatabasePath(repoRoot) {
  const configured = process.env.NEUD_LOCAL_DATABASE_PATH?.trim();
  if (configured) {
    return configured;
  }

  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "NEUD", "data", "neud.sqlite");
}

function extractErrorCode(message) {
  if (!message) {
    return null;
  }
  const match = String(message).match(/^([a-z0-9_]+):/i);
  return match?.[1] ?? null;
}

export async function readLocalBroadArrowState(repoRoot) {
  const databasePath = resolveLocalNeudDatabasePath(repoRoot);
  if (!fs.existsSync(databasePath)) {
    return {
      databasePath,
      available: false,
      reason: "Local NEUD database file not found.",
    };
  }

  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    return {
      databasePath,
      available: false,
      reason: "sql.js wasm asset not found for local database probe.",
    };
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) =>
      fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
  });

  const db = new SQL.Database(fs.readFileSync(databasePath));
  const projectRows = db.exec(
    `SELECT id, slug, name FROM projects WHERE slug = 'broad-arrow-auctions' LIMIT 1`,
  );
  const project = projectRows[0]?.values?.[0]
    ? {
        id: String(projectRows[0].values[0][0]),
        slug: String(projectRows[0].values[0][1]),
        name: String(projectRows[0].values[0][2]),
      }
    : null;

  if (!project) {
    db.close();
    return {
      databasePath,
      available: true,
      project: null,
      displays: [],
    };
  }

  const displayRows = db.exec(
    `SELECT d.id, d.display_key, d.name, d.sort_order, d.enabled, d.sync_status, d.sync_version, d.updated_at,
            c.slug, c.online_viewer_enabled, c.online_visibility,
            c.published_revision_id, c.online_published_revision_id,
            c.online_published_at, c.online_publish_error, c.archived
     FROM displays d
     LEFT JOIN project_display_code c ON c.display_id = d.id
     WHERE d.project_id = '${project.id.replace(/'/g, "''")}'
     ORDER BY COALESCE(d.sort_order, 999999), d.name`,
  );

  const displays =
    displayRows[0]?.values?.map((row) => ({
      id: String(row[0]),
      displayKey: String(row[1]),
      name: String(row[2]),
      sortOrder: row[3] == null ? null : Number(row[3]),
      localEnabled: row[4] === 1,
      syncStatus: String(row[5]),
      localSyncVersion: Number(row[6]),
      updatedAt: String(row[7]),
      slug: row[8] ? String(row[8]) : String(row[1]),
      localOnlineViewerEnabled: row[9] === 1,
      localOnlineVisibility: row[10] ? String(row[10]) : "private",
      localPublishedRevisionId: row[11] ? String(row[11]) : null,
      localOnlinePublishedRevisionId: row[12] ? String(row[12]) : null,
      localOnlinePublishedAt: row[13] ? String(row[13]) : null,
      localPublishError: row[14] ? String(row[14]) : null,
      archived: row[15] === 1,
    })) ?? [];

  const pendingQueue = db.exec(
    `SELECT COUNT(*) FROM display_sync_queue WHERE sync_state IN ('pending', 'failed')`,
  );
  const pendingQueueCount = Number(pendingQueue[0]?.values?.[0]?.[0] ?? 0);

  const pendingDisplayRows = db.exec(
    `SELECT COUNT(*) FROM display_sync_queue
     WHERE sync_state IN ('pending', 'failed')
       AND operation_type IN (
         'display.update', 'display.create', 'display.archive',
         'display.unarchive', 'display.order.update', 'display.active_revision.update'
       )`,
  );
  const pendingRevisionRows = db.exec(
    `SELECT COUNT(*) FROM display_sync_queue
     WHERE sync_state IN ('pending', 'failed') AND operation_type = 'display.revision.create'`,
  );
  const failedDisplayRows = db.exec(
    `SELECT COUNT(*) FROM display_sync_queue
     WHERE sync_state = 'failed'
       AND operation_type IN (
         'display.update', 'display.create', 'display.archive',
         'display.unarchive', 'display.order.update', 'display.active_revision.update'
       )`,
  );
  const failedRevisionRows = db.exec(
    `SELECT COUNT(*) FROM display_sync_queue
     WHERE sync_state = 'failed' AND operation_type = 'display.revision.create'`,
  );
  const oldestPending = db.exec(
    `SELECT created_at FROM display_sync_queue
     WHERE sync_state IN ('pending', 'failed')
     ORDER BY created_at ASC LIMIT 1`,
  );
  const lastQueueError = db.exec(
    `SELECT last_error FROM display_sync_queue
     WHERE last_error IS NOT NULL
     ORDER BY last_attempt_at DESC, created_at DESC LIMIT 1`,
  );

  const queueEntries = db.exec(
    `SELECT id, entity_id, operation_type, sync_state, last_error, attempt_count, created_at
     FROM display_sync_queue
     WHERE sync_state IN ('pending', 'failed', 'irrecoverable')
     ORDER BY created_at ASC
     LIMIT 200`,
  );

  const revisionRows = db.exec(
    `SELECT id, resource_id, project_id, version_number
     FROM project_code_revisions
     WHERE project_id = '${project.id.replace(/'/g, "''")}' AND resource_type = 'display'`,
  );
  const revisionById = new Map(
    (revisionRows[0]?.values ?? []).map((row) => [String(row[0]), {
      id: String(row[0]),
      displayId: String(row[1]),
      projectId: String(row[2]),
      versionNumber: row[3] == null ? null : Number(row[3]),
    }]),
  );

  const queueByRevisionId = new Map();
  for (const row of queueEntries[0]?.values ?? []) {
    const operationType = String(row[2]);
    if (operationType !== "display.revision.create") {
      continue;
    }
    queueByRevisionId.set(String(row[1]), {
      queueId: String(row[0]),
      syncState: String(row[3]),
      lastError: row[4] ? String(row[4]) : null,
      attemptCount: Number(row[5] ?? 0),
      createdAt: String(row[6]),
    });
  }

  const settingsRows = db.exec(`SELECT key, value_json FROM app_settings`);
  const settings = new Map(
    (settingsRows[0]?.values ?? []).map((row) => [String(row[0]), row[1]]),
  );
  const parseSetting = (key) => {
    const raw = settings.get(key);
    if (raw == null) {
      return null;
    }
    try {
      return JSON.parse(String(raw));
    } catch {
      return String(raw);
    }
  };

  const runtimeStatus = parseSetting("displaySync.runtimeStatus");
  const runtimeAvailable = runtimeStatus && typeof runtimeStatus === "object";
  const publishingRuntimeStatus = parseSetting("publishing.runtimeStatus");
  const sharedCloudAuth = parseSetting("sharedCloudAuth.diagnostics");
  const trustedAccessDiagnostics = parseSetting("trustedAccess.diagnostics");
  const publishingRuntimeAvailable =
    publishingRuntimeStatus && typeof publishingRuntimeStatus === "object";
  const neudInstanceId = parseSetting("neud.instanceId");
  const publishingRuntime = publishingRuntimeAvailable
    ? {
        initialized: Boolean(publishingRuntimeStatus.initialized),
        running: Boolean(publishingRuntimeStatus.running),
        authenticatedSessionAvailable: Boolean(
          publishingRuntimeStatus.authenticatedSessionAvailable,
        ),
        heartbeatTimerActive: Boolean(publishingRuntimeStatus.heartbeatTimerActive),
        lastHeartbeatAttemptAt: publishingRuntimeStatus.lastHeartbeatAttemptAt ?? null,
        lastHeartbeatSuccessAt: publishingRuntimeStatus.lastHeartbeatSuccessAt ?? null,
        lastHeartbeatErrorCode: publishingRuntimeStatus.lastHeartbeatErrorCode ?? null,
        lastStartReason: publishingRuntimeStatus.lastStartReason ?? null,
        lastStopReason: publishingRuntimeStatus.lastStopReason ?? null,
        heartbeatRpcAttempted: publishingRuntimeStatus.heartbeatRpcAttempted ?? null,
        heartbeatRpcName: publishingRuntimeStatus.heartbeatRpcName ?? null,
        heartbeatRpcSucceeded: publishingRuntimeStatus.heartbeatRpcSucceeded ?? null,
        heartbeatRpcErrorCode: publishingRuntimeStatus.heartbeatRpcErrorCode ?? null,
        heartbeatRpcSafeMessage: publishingRuntimeStatus.heartbeatRpcSafeMessage ?? null,
        heartbeatResponseValid: publishingRuntimeStatus.heartbeatResponseValid ?? null,
        heartbeatVerifiedInCloud: publishingRuntimeStatus.heartbeatVerifiedInCloud ?? null,
        updatedAt: publishingRuntimeStatus.updatedAt ?? null,
        source: "persisted_sqlite",
      }
    : {
        initialized: false,
        running: false,
        authenticatedSessionAvailable: false,
        heartbeatTimerActive: false,
        lastHeartbeatAttemptAt: null,
        lastHeartbeatSuccessAt: null,
        lastHeartbeatErrorCode: null,
        lastStartReason: null,
        lastStopReason: null,
        updatedAt: null,
        source: "not_running",
      };
  const displaySyncRuntime = runtimeAvailable
    ? {
        initialized: Boolean(runtimeStatus.initialized),
        running: Boolean(runtimeStatus.running),
        authenticatedSessionAvailable: Boolean(runtimeStatus.authenticatedSessionAvailable),
        publicCloudConfigAvailable: Boolean(runtimeStatus.publicCloudConfigAvailable),
        syncInProgress: Boolean(runtimeStatus.syncInProgress),
        pendingFollowUp: Boolean(runtimeStatus.pendingFollowUp),
        syncRequestedWhileUnavailable: Boolean(runtimeStatus.syncRequestedWhileUnavailable),
        lastStartAt: runtimeStatus.lastStartAt ?? null,
        lastStopAt: runtimeStatus.lastStopAt ?? null,
        lastSyncAttemptAt: runtimeStatus.lastSyncAttemptAt ?? null,
        lastSyncCompletedAt: runtimeStatus.lastSyncCompletedAt ?? null,
        lastSyncResult: runtimeStatus.lastSyncResult ?? null,
        lastCloudErrorCode: runtimeStatus.lastCloudErrorCode ?? null,
        lastUnavailableReason: runtimeStatus.lastUnavailableReason ?? null,
        pendingQueueCount: Number(runtimeStatus.pendingQueueCount ?? pendingQueueCount),
        lastPassAttempted: Number(runtimeStatus.lastPassAttempted ?? 0),
        lastPassSucceeded: Number(runtimeStatus.lastPassSucceeded ?? 0),
        lastPassFailed: Number(runtimeStatus.lastPassFailed ?? 0),
        lastPassSkipped: Number(runtimeStatus.lastPassSkipped ?? 0),
        lastPassRemainingEligible: Number(runtimeStatus.lastPassRemainingEligible ?? 0),
        lastPassRemainingDelayedRetry: Number(runtimeStatus.lastPassRemainingDelayedRetry ?? 0),
        updatedAt: runtimeStatus.updatedAt ?? null,
        source: "persisted_sqlite",
      }
    : {
        initialized: false,
        running: false,
        authenticatedSessionAvailable: false,
        publicCloudConfigAvailable: false,
        syncInProgress: false,
        pendingFollowUp: false,
        syncRequestedWhileUnavailable: false,
        lastStartAt: null,
        lastStopAt: null,
        lastSyncAttemptAt: parseSetting("displaySync.lastAttemptAt"),
        lastSyncCompletedAt: null,
        lastSyncResult: parseSetting("displaySync.lastResult"),
        lastCloudErrorCode:
          parseSetting("displaySync.lastCloudErrorCode") ??
          extractErrorCode(lastQueueError[0]?.values?.[0]?.[0] ?? null),
        lastUnavailableReason: "not_running",
        pendingQueueCount,
        updatedAt: null,
        source: "not_running",
      };

  const displayDiagnostics = displays.map((local) => {
    const selectedRevisionId = local.localPublishedRevisionId;
    const revision = selectedRevisionId ? revisionById.get(selectedRevisionId) ?? null : null;
    const revisionQueue = selectedRevisionId
      ? queueByRevisionId.get(selectedRevisionId) ?? null
      : null;
    const invalidStateDetected =
      local.localEnabled === false && local.localOnlineViewerEnabled === true;
    return {
      ...local,
      invalidStateDetected,
      selectedLocalRevisionId: selectedRevisionId,
      selectedRevisionExistsLocally: Boolean(revision),
      selectedRevisionQueued: Boolean(revisionQueue),
      selectedRevisionQueueState: revisionQueue?.syncState ?? null,
      lastRevisionSyncError: revisionQueue?.lastError ?? null,
      revisionSyncAttemptCount: revisionQueue?.attemptCount ?? 0,
    };
  });

  const activityPendingRows = db.exec(
    `SELECT type, sync_status, sync_error
     FROM activity_events
     WHERE sync_status IN ('pending', 'failed')
     ORDER BY timestamp DESC
     LIMIT 20`,
  );
  const lastActivityRow = db.exec(
    `SELECT type, sync_status, sync_error
     FROM activity_events
     ORDER BY timestamp DESC
     LIMIT 1`,
  );
  const pendingActivityEvents =
    activityPendingRows[0]?.values?.map((row) => ({
      eventType: String(row[0]),
      syncStatus: String(row[1]),
      syncError: row[2] ? String(row[2]) : null,
    })) ?? [];
  const lastActivityEvent = lastActivityRow[0]?.values?.[0]
    ? {
        eventType: String(lastActivityRow[0].values[0][0]),
        syncStatus: String(lastActivityRow[0].values[0][1]),
        syncError: lastActivityRow[0].values[0][2]
          ? String(lastActivityRow[0].values[0][2])
          : null,
      }
    : null;

  db.close();

  return {
    databasePath,
    available: true,
    project,
    displays: displayDiagnostics,
    pendingQueueCount,
    pendingDisplayRows: Number(pendingDisplayRows[0]?.values?.[0]?.[0] ?? 0),
    pendingRevisionRows: Number(pendingRevisionRows[0]?.values?.[0]?.[0] ?? 0),
    failedDisplayRows: Number(failedDisplayRows[0]?.values?.[0]?.[0] ?? 0),
    failedRevisionRows: Number(failedRevisionRows[0]?.values?.[0]?.[0] ?? 0),
    oldestPendingAt: oldestPending[0]?.values?.[0]?.[0]
      ? String(oldestPending[0].values[0][0])
      : null,
    lastDisplaySyncAttemptAt: displaySyncRuntime.lastSyncAttemptAt,
    lastDisplaySyncResult: displaySyncRuntime.lastSyncResult,
    lastCloudErrorCode: displaySyncRuntime.lastCloudErrorCode,
    displaySyncRuntime,
    publishingRuntime,
    neudInstanceId,
    sharedCloudAuth,
    trustedAccessDiagnostics,
    invalidStateDisplayCount: displayDiagnostics.filter((entry) => entry.invalidStateDetected)
      .length,
    pendingActivityEvents,
    lastActivityEvent,
  };
}
