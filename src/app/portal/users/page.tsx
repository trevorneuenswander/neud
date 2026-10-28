import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal/PageHeader";
import { CloudAccessManagementClient } from "@/components/access-management/CloudAccessManagementClient";
import { requireUser } from "@/lib/auth/authorization";
import { fetchAccessManagementDirectory } from "@/lib/access-management/directory-client";
import {
  resolveAccessCapabilities,
} from "@/lib/access-management/role-model";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_HOSTED_LANDING_PATH } from "@/lib/routing/startup-paths";

export default async function HostedUsersPage() {
  // Capability-based: site-wide Owner/NEUD Admin or Team Admin of at least one team.
  const { profile } = await requireUser();
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

  const capabilities = resolveAccessCapabilities(directory, profile.id);
  if (!capabilities.hasSiteWideAccess && capabilities.managedTeamIds.length === 0) {
    redirect(DEFAULT_HOSTED_LANDING_PATH);
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
