function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalizeFirstCharacter(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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

export function getCleanActivityDescription(
  description: string,
  actorDisplayName: string | null,
): string {
  return removeLeadingActorFromDescription(description, actorDisplayName);
}
