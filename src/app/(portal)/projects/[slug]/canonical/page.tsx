import { redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/projects/authorization";

type ProjectCanonicalPageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Public Canonical JSON viewer links are deferred to a later milestone.
 * Internal canonical generation remains available via the local API:
 * GET /api/projects/{projectId}/canonical (desktop authenticated).
 */
export default async function ProjectCanonicalPage({ params }: ProjectCanonicalPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  if (!access) {
    redirect("/projects");
  }

  redirect(`/projects/${slug}`);
}
