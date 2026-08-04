export const ACTIVITY_SYSTEM_ACTOR_LABEL = "System";
export const ACTIVITY_UNKNOWN_USER_LABEL = "Unknown User";

const AUTOMATED_ACTIVITY_EVENT_TYPES = new Set([
  "display.online_published",
  "display.online_publish_failed",
  "display.online_publish_resumed",
  "engine.started",
  "engine.stopped",
]);

export function isAutomatedActivityEventType(eventType?: string | null): boolean {
  const type = eventType?.trim() ?? "";
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

function isStaleSystemActorPlaceholder(input: {
  storedName?: string | null;
  actorId?: string | null;
  eventType?: string | null;
}): boolean {
  const storedName = input.storedName?.trim();
  if (storedName !== ACTIVITY_SYSTEM_ACTOR_LABEL) {
    return false;
  }
  if (isAutomatedActivityEventType(input.eventType)) {
    return false;
  }
  return Boolean(input.actorId?.trim());
}

export function shouldTreatActivityAsSystem(input: {
  actorId?: string | null;
  actorDisplayName?: string | null;
  actorName?: string | null;
  eventType?: string | null;
}): boolean {
  if (isAutomatedActivityEventType(input.eventType)) {
    return true;
  }
  const name = input.actorDisplayName?.trim() || input.actorName?.trim();
  if (name && !isStaleSystemActorPlaceholder({ storedName: name, ...input })) {
    return false;
  }
  if (input.actorId?.trim()) {
    return false;
  }
  const eventType = input.eventType?.trim() ?? "";
  return (
    eventType.startsWith("system.") ||
    eventType.startsWith("engine.error") ||
    eventType === "engine.started" ||
    eventType === "engine.stopped"
  );
}

export function resolveActivityActorLabel(input: {
  actorDisplayName?: string | null;
  actorName?: string | null;
  profileName?: string | null;
  actorId?: string | null;
  eventType?: string | null;
}): string {
  if (isAutomatedActivityEventType(input.eventType)) {
    return ACTIVITY_SYSTEM_ACTOR_LABEL;
  }

  const storedName = input.actorDisplayName?.trim() || input.actorName?.trim();
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

  const profileName = input.profileName?.trim();
  if (profileName) {
    return profileName;
  }

  if (input.actorId?.trim()) {
    return ACTIVITY_UNKNOWN_USER_LABEL;
  }

  if (shouldTreatActivityAsSystem(input)) {
    return ACTIVITY_SYSTEM_ACTOR_LABEL;
  }

  return ACTIVITY_SYSTEM_ACTOR_LABEL;
}

export function resolveActivityDisplayActorLabel(event: {
  actorName?: string | null;
  actorDisplayName?: string | null;
  profileName?: string | null;
  actorId?: string | null;
  type?: string | null;
}): string {
  return resolveActivityActorLabel({
    actorName: event.actorName,
    actorDisplayName: event.actorDisplayName,
    profileName: event.profileName,
    actorId: event.actorId,
    eventType: event.type,
  });
}

export function resolveProfileActorLabel(profile: {
  full_name?: string | null;
  email?: string | null;
} | null): string | null {
  if (!profile) {
    return null;
  }
  const fullName = profile.full_name?.trim();
  if (fullName) {
    return fullName;
  }
  const email = profile.email?.trim();
  if (email) {
    const localPart = email.split("@")[0]?.trim();
    return localPart || null;
  }
  return null;
}
