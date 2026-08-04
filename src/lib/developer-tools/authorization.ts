import { notFound } from "next/navigation";
import { requireProjectRole } from "@/lib/projects/authorization";

export async function requireDeveloperToolsAccess(projectSlug: string) {
  return requireProjectRole(projectSlug, ["admin"]);
}

export async function getDeveloperToolsAccess(projectSlug: string) {
  try {
    return await requireDeveloperToolsAccess(projectSlug);
  } catch {
    return null;
  }
}

export async function requireDeveloperToolsAccessOrNotFound(projectSlug: string) {
  try {
    return await requireDeveloperToolsAccess(projectSlug);
  } catch {
    notFound();
  }
}
