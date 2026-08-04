#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  ACTIVITY_UNKNOWN_USER_LABEL,
  isAutomatedActivityEventType,
  resolveActivityActorLabel,
  shouldLookupProfileForActorRow,
} from "./lib/activity-actor-resolution.mjs";
import {
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { isMigrationApplied } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const MIGRATION_049 = "049_display_enabled_activity_events.sql";
const MIGRATION_050 = "050_activity_sync_allowlist_extensions.sql";

function extractEventTypeFromSyncError(message) {
  if (!message) {
    return null;
  }
  const match = String(message).match(/event_type=([^\s)]+)/);
  return match?.[1] ?? null;
}

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);

function hashActorId(value) {
  if (!value) {
    return null;
  }
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function resolveFailureStage(input) {
  const {
    userInitiatedEventCount,
    eventsMissingActorUserId,
    eventsWithActorUserId,
    eventsRenderedAsSystem,
    eventsRenderedAsUnknownUser,
  } = input;

  if (userInitiatedEventCount === 0) {
    return "none";
  }
  if (eventsMissingActorUserId > 0 && eventsWithActorUserId === 0) {
    return "actor_not_recorded";
  }
  if (eventsRenderedAsSystem > 0 && eventsWithActorUserId > 0) {
    return "ui_fallback_wrong";
  }
  if (eventsRenderedAsUnknownUser > 0) {
    return "profile_lookup_incomplete";
  }
  if (eventsMissingActorUserId > 0) {
    return "actor_overwritten";
  }
  return "none";
}

function probeLocalActivityDatabase(localState) {
  if (!localState?.available) {
    return {
      localActivityDatabaseParsed: false,
      localActivityParserSuccess: false,
      localActivityEventCounts: null,
    };
  }

  const pendingCount = localState.pendingActivityEvents?.length ?? 0;
  const counts = {
    pendingActivityEvents: pendingCount,
    pendingDisplayRows: localState.pendingDisplayRows ?? 0,
    pendingRevisionRows: localState.pendingRevisionRows ?? 0,
  };
  const parsed = true;
  const success = Number.isFinite(pendingCount);

  return {
    localActivityDatabaseParsed: parsed,
    localActivityParserSuccess: parsed && success,
    localActivityEventCounts: counts,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    console.error("Missing Supabase URL or service role key.");
    process.exit(1);
  }

  let pgClient;
  try {
    pgClient = await createLiveValidationDbClient();
  } catch (error) {
    console.error(sanitizeError(error).message);
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const localState = await readLocalBroadArrowState(repoRoot);
    const localActivityProbe = probeLocalActivityDatabase(localState);
    let migration049Applied = null;
    let migration050Applied = null;
    try {
      migration049Applied = await isMigrationApplied(pgClient, MIGRATION_049);
      migration050Applied = await isMigrationApplied(pgClient, MIGRATION_050);
    } catch {
      migration049Applied = null;
      migration050Applied = null;
    }

    const { data: events, error } = await admin
      .from("activity_events")
      .select("id, user_id, actor_display_name, event_type, occurred_at")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    const rows = events ?? [];
    const userInitiated = rows.filter(
      (row) =>
        typeof row.event_type === "string" &&
        !String(row.event_type).startsWith("system.") &&
        !["engine.started", "engine.stopped", "engine.error"].includes(String(row.event_type)),
    );

    const eventsWithActorUserId = userInitiated.filter((row) => Boolean(row.user_id)).length;
    const eventsMissingActorUserId = userInitiated.length - eventsWithActorUserId;

    const missingNameUserIds = [
      ...new Set(
        userInitiated.filter(shouldLookupProfileForActorRow).map((row) => String(row.user_id)),
      ),
    ];

    let profileNameByUserId = new Map();
    if (missingNameUserIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missingNameUserIds);
      profileNameByUserId = new Map(
        (profiles ?? []).map((profile) => [
          String(profile.id),
          profile.full_name?.trim() ||
            profile.email?.split("@")[0]?.trim() ||
            null,
        ]),
      );
    }

    let eventsResolvedToProfile = 0;
    let eventsRenderedAsSystem = 0;
    let eventsRenderedAsUnknownUser = 0;
    let eventsRenderedAsAutomatedSystem = 0;

    for (const row of userInitiated) {
      const eventType = String(row.event_type ?? "");
      const actorDisplayName =
        typeof row.actor_display_name === "string" ? row.actor_display_name : null;
      const profileName = row.user_id
        ? profileNameByUserId.get(String(row.user_id)) ?? null
        : null;
      const resolvedLabel = resolveActivityActorLabel({
        actorDisplayName,
        profileName,
        actorId: row.user_id,
        eventType,
      });

      if (profileName) {
        eventsResolvedToProfile += 1;
      }

      if (resolvedLabel === ACTIVITY_SYSTEM_ACTOR_LABEL) {
        if (isAutomatedActivityEventType(eventType)) {
          eventsRenderedAsAutomatedSystem += 1;
        } else {
          eventsRenderedAsSystem += 1;
        }
      } else if (resolvedLabel === ACTIVITY_UNKNOWN_USER_LABEL) {
        eventsRenderedAsUnknownUser += 1;
      }
    }

    const recentActorIdsHashed = [
      ...new Set(userInitiated.map((row) => hashActorId(row.user_id)).filter(Boolean)),
    ].slice(0, 10);

    const recentDisplayAccessEvents = rows.filter(
      (row) =>
        typeof row.event_type === "string" &&
        (String(row.event_type).startsWith("display.") ||
          String(row.event_type).startsWith("access.")),
    );

    const rejectedActivityEvents = (localState?.pendingActivityEvents ?? []).filter(
      (entry) =>
        entry.syncError?.includes("not allowed") ||
        entry.syncError?.includes("event_type="),
    );

    const summary = {
      recentEventCount: rows.length,
      userInitiatedEventCount: userInitiated.length,
      eventsWithActorUserId,
      eventsMissingActorUserId,
      eventsResolvedToProfile,
      eventsRenderedAsSystem,
      eventsRenderedAsUnknownUser,
      eventsRenderedAsAutomatedSystem,
      recentActorIdsHashed,
      migration049Applied,
      migration050Applied,
      rejectedActivityEventType:
        rejectedActivityEvents[0]?.eventType ??
        extractEventTypeFromSyncError(rejectedActivityEvents[0]?.syncError) ??
        null,
      rejectedActivityEventTypes: [
        ...new Set(
          rejectedActivityEvents
            .map(
              (entry) =>
                entry.eventType ?? extractEventTypeFromSyncError(entry.syncError),
            )
            .filter(Boolean),
        ),
      ],
      likelyRejectedWithoutMigration049:
        migration049Applied === false
          ? ["display.enabled", "display.disabled"]
          : [],
      likelyRejectedWithoutMigration050:
        migration050Applied === false ? ["data-source.changed"] : [],
      recentDisplayAccessEvents: recentDisplayAccessEvents.map((row) => ({
        eventType: row.event_type,
        actorDisplayName: row.actor_display_name,
        userIdPresent: Boolean(row.user_id),
        resolvedActorLabel: resolveActivityActorLabel({
          actorDisplayName:
            typeof row.actor_display_name === "string" ? row.actor_display_name : null,
          profileName: row.user_id
            ? profileNameByUserId.get(String(row.user_id)) ?? null
            : null,
          actorId: row.user_id,
          eventType: String(row.event_type ?? ""),
        }),
      })),
      ...localActivityProbe,
      firstActorFailureStage: resolveFailureStage({
        userInitiatedEventCount: userInitiated.length,
        eventsMissingActorUserId,
        eventsWithActorUserId,
        eventsRenderedAsSystem,
        eventsRenderedAsUnknownUser,
      }),
    };

    const outputPath = path.join(repoRoot, "docs", "activity-actor-resolution-diagnostic.json");
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${outputPath}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
