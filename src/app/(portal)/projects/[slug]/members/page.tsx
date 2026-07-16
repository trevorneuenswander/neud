import { AddProjectMemberForm } from "@/components/projects/ProjectMemberActions";
import { ProjectMembersTable } from "@/components/projects/ProjectMembersTable";
import { PageHeader } from "@/components/portal/PageHeader";
import {
  countProjectManagers,
  requireProjectMemberManagement,
  requireProjectAccess,
} from "@/lib/projects/authorization";
import {
  getAssignableUsers,
  getProjectMembersDirectory,
} from "@/lib/projects/queries";
import { notFound } from "next/navigation";

type ProjectMembersPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectMembersPage({
  params,
}: ProjectMembersPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);

  if (!access.canManageMembers) {
    notFound();
  }

  await requireProjectMemberManagement(slug);

  const [members, assignableUsers, managerCount] = await Promise.all([
    getProjectMembersDirectory(access.project.id),
    getAssignableUsers(access.project.id),
    countProjectManagers(access.project.id),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Members"
        description="Manage Project access for approved users. Newly invited users are not added automatically."
      />
      <AddProjectMemberForm slug={slug} assignableUsers={assignableUsers} />
      <ProjectMembersTable
        slug={slug}
        members={members}
        managerCount={managerCount}
        canManage
      />
    </div>
  );
}
