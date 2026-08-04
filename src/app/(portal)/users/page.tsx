import Link from "next/link";
import { redirect } from "next/navigation";
import { DesktopCloudAccessManagementClient } from "@/components/access-management/DesktopCloudAccessManagementClient";
import { InviteUserForm } from "@/components/users/InviteUserForm";
import { UsersTable } from "@/components/users/UsersTable";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { PageSection } from "@/components/portal/PageSection";
import { getApplicationRole } from "@/lib/auth/application-roles";
import { requireAdmin } from "@/lib/auth/authorization";
import { getUserManagementContext } from "@/lib/users/actions";
import { countActiveOwners, getPlatformUsersDirectory } from "@/lib/users/queries";
import { shouldUseLocalData } from "@/lib/local/mode";
import { localGetProjectsMeta } from "@/lib/local/displays-api";

export default async function UsersPage() {
  const localMode = shouldUseLocalData();

  if (localMode) {
    await requireAdmin();
    const meta = await localGetProjectsMeta();
    if (!meta.canManageUsersAndAccess) {
      redirect("/dashboard");
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Users"
          description="Manage teams, users, project assignments, and invitations for your NEUD workspace."
        />
        <DesktopCloudAccessManagementClient />
      </div>
    );
  }

  const { profile } = await requireAdmin();
  const [users, activeOwnerCount, managementContext] = await Promise.all([
    getPlatformUsersDirectory(),
    countActiveOwners(),
    getUserManagementContext(),
  ]);
  const actorRole = getApplicationRole(profile);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team & Access"
        description="Manage platform users, roles, and project assignments. Owners and Admins can invite users through the secure Supabase invitation flow."
      />

      {false ? (
        <Alert variant="info">
          Desktop-only mode does not include a local user directory. User
          management requires hosted authentication and the cloud Supabase project.
        </Alert>
      ) : null}

      <PageSection title="Invite user">
        <InviteUserForm
          actorRole={actorRole}
          projects={managementContext.projects}
          localMode={false}
        />
      </PageSection>

      <PageSection title="Users">
        {users.length > 0 ? (
          <UsersTable
            users={users}
            actor={{ id: profile.id, role: actorRole }}
            activeOwnerCount={activeOwnerCount}
          />
        ) : (
          <EmptyState
            title="No users yet"
            description="Invited and approved users appear here."
          />
        )}
      </PageSection>

      <PageSection title="Access model">
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          <p>
            <strong className="text-foreground">Owner</strong> and{" "}
            <strong className="text-foreground">Admin</strong> have global access to
            all projects and may create or delete projects.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Operator</strong> and{" "}
            <strong className="text-foreground">Viewer</strong> only see projects
            explicitly assigned through project memberships. Project assignment does
            not elevate the global role.
          </p>
        </div>
      </PageSection>
    </div>
  );
}
