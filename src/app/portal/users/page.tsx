import { PageHeader } from "@/components/portal/PageHeader";
import { CloudAccessManagementClient } from "@/components/access-management/CloudAccessManagementClient";
import { requireAdmin } from "@/lib/auth/authorization";
import { fetchAccessManagementDirectory } from "@/lib/access-management/directory-client";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import { createClient } from "@/lib/supabase/server";

export default async function HostedUsersPage() {
  const { profile } = await requireAdmin();
  const supabase = await createClient();

  let directory: AccessManagementDirectory = {
    ok: true,
    teams: [],
    teamMemberships: [],
    users: [],
    projects: [],
    projectMembers: [],
    projectTeams: [],
    invitations: [],
  };

  try {
    directory = await fetchAccessManagementDirectory(supabase);
  } catch {
    directory = {
      ok: true,
      teams: [],
      teamMemberships: [],
      users: [],
      projects: [],
      projectMembers: [],
      projectTeams: [],
      invitations: [],
    };
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Users & Access"
        description="Manage teams, users, project access, and invitations for your NEUD cloud workspace."
      />
      <CloudAccessManagementClient
        initialDirectory={directory}
        currentUserId={profile.id}
      />
    </div>
  );
}
