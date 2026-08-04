"use client";

import Link from "next/link";
import { getProjectOverviewHref } from "@/lib/routes/activity-navigation";

const activityEntityLinkClassName =
  "font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

type ActivityProjectLinkProps = {
  projectSlug?: string;
  projectName: string;
  projectAvailable?: boolean;
  className?: string;
};

export function ActivityProjectLink({
  projectSlug,
  projectName,
  projectAvailable = true,
  className,
}: ActivityProjectLinkProps) {
  const label = projectName.trim() || "Project unavailable";
  const canLink = Boolean(projectSlug?.trim()) && projectAvailable;

  if (!canLink) {
    return (
      <span
        className={className ?? "font-medium text-foreground"}
        title={projectAvailable ? undefined : "Project no longer available"}
      >
        {label}
      </span>
    );
  }

  const href = getProjectOverviewHref(projectSlug!.trim());

  return (
    <Link
      href={href}
      className={className ?? activityEntityLinkClassName}
      aria-label={`View ${label} project`}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  );
}
