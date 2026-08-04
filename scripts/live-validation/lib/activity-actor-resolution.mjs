export const ACTIVITY_SYSTEM_ACTOR_LABEL = "System";
export const ACTIVITY_UNKNOWN_USER_LABEL = "Unknown User";

const AUTOMATED_ACTIVITY_EVENT_TYPES = new Set([
  "display.online_published",
  "display.online_publish_failed",
  "display.online_publish_resumed",
  "engine.started",
  "engine.stopped",
]);

export function isAutomatedActivityEventType(eventType) {
  const type = String(eventType ?? "").trim();
  if (!type) {
    return false;
  }
  if (type.startsWith("system.")) {
    return true;
  }
  if (AUTOMATED_ACTIVITY_EVENT_TYPES.has(type)) {
    return true;
  }
  return type.startsWith("engine.error");
}

function isStaleSystemActorPlaceholder(input) {
  const storedName = String(input.storedName ?? "").trim();
  if (storedName !== ACTIVITY_SYSTEM_ACTOR_LABEL) {
    return false;
  }
  if (isAutomatedActivityEventType(input.eventType)) {
    return false;
  }
  return Boolean(String(input.actorId ?? "").trim());
}

export function resolveActivityActorLabel(input) {
  if (isAutomatedActivityEventType(input.eventType)) {
    return ACTIVITY_SYSTEM_ACTOR_LABEL;
  }

  const storedName =
    String(input.actorDisplayName ?? "").trim() || String(input.actorName ?? "").trim();
  if (
    storedName &&
    !isStaleSystemActorPlaceholder({
      storedName,
      actorId: input.actorId,
      eventType: input.eventType,
    })
  ) {
    return storedName;
  }

  const profileName = String(input.profileName ?? "").trim();
  if (profileName) {
    return profileName;
  }

  if (String(input.actorId ?? "").trim()) {
    return ACTIVITY_UNKNOWN_USER_LABEL;
  }

  return ACTIVITY_SYSTEM_ACTOR_LABEL;
}

export function shouldLookupProfileForActorRow(row) {
  if (!row.user_id) {
    return false;
  }
  const eventType = String(row.event_type ?? "");
  if (isAutomatedActivityEventType(eventType)) {
    return false;
  }
  const actorDisplayName = String(row.actor_display_name ?? "").trim();
  if (!actorDisplayName) {
    return true;
  }
  return actorDisplayName === ACTIVITY_SYSTEM_ACTOR_LABEL;
}
