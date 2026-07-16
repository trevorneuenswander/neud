import { ProjectAccessBadge } from "@/components/projects/ProjectAccessBadge";
import { ProjectMemberActions } from "@/components/projects/ProjectMemberActions";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import { formatProjectDate } from "@/lib/projects/format";
import type { ProjectMemberRow } from "@/lib/projects/types";

type ProjectMembersTableProps = {
  slug: string;
  members: ProjectMemberRow[];
  managerCount: number;
  canManage: boolean;
};

export function ProjectMembersTable({
  slug,
  members,
  managerCount,
  canManage,
}: ProjectMembersTableProps) {
  if (members.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted">
        No members assigned yet.
      </p>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <DataTableHeaderCell>Name</DataTableHeaderCell>
        <DataTableHeaderCell>Email</DataTableHeaderCell>
        <DataTableHeaderCell>Company</DataTableHeaderCell>
        <DataTableHeaderCell>Access</DataTableHeaderCell>
        <DataTableHeaderCell>Assigned</DataTableHeaderCell>
        {canManage ? (
          <DataTableHeaderCell>
            <span className="sr-only">Actions</span>
          </DataTableHeaderCell>
        ) : null}
      </DataTableHead>
      <DataTableBody>
        {members.map((member) => (
          <DataTableRow key={member.user_id}>
            <DataTableCell>
              {member.profile.full_name ?? "Unnamed user"}
            </DataTableCell>
            <DataTableCell className="break-all text-muted">
              {member.profile.email}
            </DataTableCell>
            <DataTableCell className="text-muted">
              {member.profile.company ?? "—"}
            </DataTableCell>
            <DataTableCell>
              <ProjectAccessBadge accessLevel={member.access_level} />
            </DataTableCell>
            <DataTableCell className="text-muted">
              {formatProjectDate(member.created_at)}
            </DataTableCell>
            {canManage ? (
              <DataTableCell>
                <ProjectMemberActions
                  slug={slug}
                  member={member}
                  managerCount={managerCount}
                />
              </DataTableCell>
            ) : null}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
