const MAX_QUEUE_ATTEMPTS = 10;
const DISPLAY_SYNC_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000];

const DISPLAY_OPERATION_TYPES = new Set([
  "display.update",
  "display.create",
  "display.archive",
  "display.unarchive",
  "display.order.update",
  "display.active_revision.update",
]);

export function getQueueEligibility(entry, now = Date.now()) {
  if (entry.syncState === "synced" || entry.syncState === "irrecoverable") {
    return { eligibleNow: false, exclusionReason: "not_pending" };
  }

  const attemptCount = Number.isFinite(entry.attemptCount) ? entry.attemptCount : 0;
  if (attemptCount >= MAX_QUEUE_ATTEMPTS) {
    return { eligibleNow: false, exclusionReason: "max_attempts_exceeded" };
  }

  if (entry.syncState === "failed" && entry.lastAttemptAt) {
    const backoffIndex = Math.min(
      Math.max(attemptCount - 1, 0),
      DISPLAY_SYNC_BACKOFF_MS.length - 1,
    );
    const nextAttemptAt =
      new Date(entry.lastAttemptAt).getTime() + DISPLAY_SYNC_BACKOFF_MS[backoffIndex];
    if (now < nextAttemptAt) {
      return { eligibleNow: false, exclusionReason: "delayed_retry" };
    }
  }

  return { eligibleNow: true, exclusionReason: null };
}

export function summarizeQueueRows(rows, displaySlugByEntityId = new Map()) {
  const now = Date.now();
  let eligibleNowCount = 0;
  let delayedRetryCount = 0;

  const items = rows.map((row) => {
    const eligibility = getQueueEligibility(row, now);
    if (eligibility.eligibleNow) {
      eligibleNowCount += 1;
    } else if (eligibility.exclusionReason === "delayed_retry") {
      delayedRetryCount += 1;
    }

    const displaySlug =
      row.entityType === "display"
        ? displaySlugByEntityId.get(row.entityId) ?? null
        : displaySlugByEntityId.get(row.payload?.displayId ?? "") ?? null;

    return {
      queueId: row.id,
      operationType: row.operationType,
      entityType: row.entityType,
      entityId: row.entityId,
      displaySlug,
      status: row.syncState,
      attemptCount: row.attemptCount ?? 0,
      nextAttemptAt: row.lastAttemptAt ?? null,
      eligibleNow: eligibility.eligibleNow,
      exclusionReason: eligibility.exclusionReason,
      lastErrorCode: extractErrorCode(row.lastError),
      createdAt: row.createdAt,
      updatedAt: row.lastAttemptAt ?? row.createdAt,
      projectId: typeof row.payload?.projectId === "string" ? row.payload.projectId : null,
      isDisplayOperation: DISPLAY_OPERATION_TYPES.has(row.operationType),
      isRevisionOperation: row.operationType === "display.revision.create",
    };
  });

  return {
    items,
    eligibleNowCount,
    delayedRetryCount,
    pendingDisplayRows: items.filter((item) => item.isDisplayOperation && item.status !== "synced")
      .length,
    pendingRevisionRows: items.filter(
      (item) => item.isRevisionOperation && item.status !== "synced",
    ).length,
  };
}

function extractErrorCode(message) {
  if (!message) {
    return null;
  }
  const match = String(message).match(/^([a-z0-9_]+):/i);
  return match?.[1] ?? null;
}

export function mapQueueRow(row) {
  let payload = {};
  try {
    payload = JSON.parse(String(row.payload_json ?? "{}"));
  } catch {
    payload = {};
  }

  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    operationType: String(row.operation_type),
    payload,
    createdAt: String(row.created_at),
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    syncState: String(row.sync_state ?? "pending"),
    sourceInstanceId: String(row.source_instance_id),
  };
}
