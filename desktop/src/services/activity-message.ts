import { resolveActivityActorLabel } from "../lib/activity/actor-resolution";

export type ActivityActor = {
  id?: string;
  name: string;
  email?: string;
};

export function resolveActivityActorName(
  actor?: ActivityActor | null,
  eventType?: string | null,
): string {
  return resolveActivityActorLabel({
    actorName: actor?.name,
    actorId: actor?.id,
    eventType,
  });
}

export function formatActivityDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** @deprecated New events store clean descriptions; actor is stored separately. */
export function formatUserActivityMessage(
  action: string,
  actor?: ActivityActor | null,
): string {
  return formatActivityDescription(action);
}

export function formatSystemActivityMessage(message: string): string {
  return message;
}
