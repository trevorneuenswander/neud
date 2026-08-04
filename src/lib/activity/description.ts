function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalizeFirstCharacter(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Removes a leading actor prefix from Activity descriptions.
 */
export function removeLeadingActorFromDescription(
  description: string,
  actorDisplayName: string | null,
): string {
  const trimmedMessage = description.trim();
  const trimmedActor = (actorDisplayName ?? "").trim();

  if (!trimmedMessage) {
    return trimmedMessage;
  }

  if (!trimmedActor) {
    return capitalizeFirstCharacter(trimmedMessage);
  }

  const escapedActor = escapeRegExp(trimmedActor);
  const withoutActor = trimmedMessage
    .replace(
      new RegExp(`^${escapedActor}(?:\\s*(?:[—–-]|:)\\s*|\\s+)`, "i"),
      "",
    )
    .trim();

  return capitalizeFirstCharacter(withoutActor || trimmedMessage);
}

/** @deprecated Use removeLeadingActorFromDescription */
export function activityDescriptionWithoutActor(
  message: string,
  actorName: string,
): string {
  return removeLeadingActorFromDescription(message, actorName);
}

/**
 * Removes a leading actor prefix from Activity descriptions at read time.
 */
export function getCleanActivityDescription(
  description: string,
  actorDisplayName: string | null,
): string {
  return removeLeadingActorFromDescription(description, actorDisplayName);
}

/** @deprecated Use getCleanActivityDescription */
export function getActivityDisplayDescription(
  rawDescription: string,
  actorName: string | null,
): string {
  return getCleanActivityDescription(rawDescription, actorName);
}

export function withActivityDisplayDescription<T extends { actorName: string; message: string }>(
  event: T,
): T & { rawMessage: string; displayDescription: string } {
  const rawMessage = event.message;
  return {
    ...event,
    rawMessage,
    displayDescription: getActivityDisplayDescription(rawMessage, event.actorName),
  };
}
