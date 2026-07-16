import { ProjectOverview } from "@/components/projects/ProjectOverview";
import { requireProjectAccess } from "@/lib/projects/authorization";
import {
  getOwnerProfile,
  getProjectMemberCount,
} from "@/lib/projects/queries";

type ProjectOverviewPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectOverviewPage({
  params,
}: ProjectOverviewPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  const owner = await getOwnerProfile(access.project.owner_id);
  const memberCount =
    access.canManageMembers || access.isPlatformAdmin
      ? await getProjectMemberCount(access.project.id)
      : null;

  return (
    <ProjectOverview
      access={access}
      ownerName={owner?.full_name ?? null}
      memberCount={memberCount}
    />
  );
}
