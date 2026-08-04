"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deterministicActivityCloudId = deterministicActivityCloudId;
exports.resolveCloudIdForLocalEvent = resolveCloudIdForLocalEvent;
exports.toCloudActivityRow = toCloudActivityRow;
exports.fromCloudActivityRow = fromCloudActivityRow;
const crypto_1 = require("crypto");
function deterministicActivityCloudId(instanceId, localId) {
    const hash = (0, crypto_1.createHash)("sha256")
        .update(`neud:activity:${instanceId}:${localId}`)
        .digest("hex");
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        `4${hash.slice(13, 16)}`,
        ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") +
            hash.slice(18, 20),
        hash.slice(20, 32),
    ].join("-");
}
function resolveCloudIdForLocalEvent(input) {
    if (input.cloudId?.trim()) {
        return input.cloudId.trim();
    }
    if (/^[0-9a-f-]{36}$/i.test(input.event.id)) {
        return input.event.id;
    }
    return deterministicActivityCloudId(input.instanceId, input.event.id);
}
function toCloudActivityRow(input) {
    const metadata = { ...(input.event.metadata ?? {}) };
    const projectId = typeof metadata.projectId === "string" && metadata.projectId.trim()
        ? metadata.projectId.trim()
        : null;
    const teamId = input.teamId ??
        (typeof metadata.teamId === "string" && metadata.teamId.trim()
            ? metadata.teamId.trim()
            : null);
    return {
        id: input.cloudId,
        project_id: projectId,
        team_id: teamId,
        user_id: input.event.actor?.id ?? null,
        actor_display_name: input.event.actor?.name ?? null,
        event_type: input.event.type,
        description: input.event.message,
        metadata,
        source: input.event.source ?? null,
        severity: input.event.severity ?? "info",
        source_instance_id: input.instanceId,
        source_local_id: input.event.id,
        occurred_at: input.event.timestamp,
        created_at: input.event.timestamp,
        updated_at: input.event.timestamp,
        deleted_at: null,
    };
}
function fromCloudActivityRow(row) {
    const metadata = {
        ...(row.metadata ?? {}),
        ...(row.project_id ? { projectId: row.project_id } : {}),
        ...(row.team_id ? { teamId: row.team_id } : {}),
        description: row.description,
    };
    return {
        id: row.source_local_id ?? row.id,
        type: row.event_type,
        message: row.description,
        timestamp: row.occurred_at,
        source: row.source ?? undefined,
        severity: row.severity === "warning" || row.severity === "error"
            ? row.severity
            : "info",
        actor: {
            id: row.user_id ?? undefined,
            name: row.actor_display_name ?? "System",
        },
        metadata,
    };
}
