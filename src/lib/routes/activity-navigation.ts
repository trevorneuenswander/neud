import {
  getAccessManagementUserDetailsHref,
  type AccessManagementSurface,
} from "@/lib/access-management/routes";

export function getProjectOverviewHref(projectSlug: string): string {
  return `/projects/${encodeURIComponent(projectSlug)}`;
}

export function getUserDetailsHref(
  userId: string,
  options?: { surface?: AccessManagementSurface; returnTab?: "users" },
): string {
  return getAccessManagementUserDetailsHref(
    userId,
    options?.surface ?? "desktop",
    options?.returnTab ? { returnTab: options.returnTab } : { returnTab: "users" },
  );
}
