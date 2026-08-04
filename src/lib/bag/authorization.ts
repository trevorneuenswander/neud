import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/projects/authorization";

export async function requireBagGraphicsProject(slug: string) {
  const access = await requireProjectAccess(slug);

  if (access.project.project_type !== "bag-graphics") {
    notFound();
  }

  return access;
}
