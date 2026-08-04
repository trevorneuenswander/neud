"use client";

import Link from "next/link";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  resolveActivityDisplayActorLabel,
} from "@/lib/projects/activity-panel";
import { getUserDetailsHref } from "@/lib/routes/activity-navigation";

const activityEntityLinkClassName =
  "text-foreground hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

type ActivityUserLinkProps = {
  actorId?: string;
  actorName: string;
  eventType?: string;
  linkableUserIds?: ReadonlySet<string>;
  className?: string;
};

export function ActivityUserLink({
  actorId,
  actorName,
  eventType,
  linkableUserIds,
  className,
}: ActivityUserLinkProps) {
  const label = resolveActivityDisplayActorLabel({
    actorName,
    actorId,
    type: eventType,
  });
  const resolvedActorId = actorId?.trim();
  const canLink = Boolean(
    resolvedActorId &&
      label !== ACTIVITY_SYSTEM_ACTOR_LABEL &&
      (!linkableUserIds || linkableUserIds.has(resolvedActorId)),
  );

  if (!canLink) {
    return <span className={className ?? "text-foreground"}>{label}</span>;
  }

  const href = getUserDetailsHref(resolvedActorId!);

  return (
    <Link
      href={href}
      className={className ?? activityEntityLinkClassName}
      aria-label={`View ${label} user details`}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  );
}

export function toLinkableUserIdSet(userIds: string[] | undefined): ReadonlySet<string> {
  return new Set(userIds ?? []);
}
