"use client";

import { useCallback, useEffect, useState } from "react";
import { AddUserToProjectDialog } from "@/components/projects/AddUserToProjectDialog";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  localGetProjectAccessUsers,
  localRemoveProjectAccess,
} from "@/lib/local/access-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type ProjectAccessPath = {
  type: "owner" | "team_admin" | "project_operator" | "project_viewer";
  teamId: string | null;
  teamName: string | null;
  membershipId: string | null;
};

type ProjectAccessUser = {
  id: string;
  name: string;
  email: string | null;
  role: "Owner" | "Admin" | "Operator" | "Viewer";
  paths: ProjectAccessPath[];
  removablePaths: ProjectAccessPath[];
};

type UsersWithAccessSectionProps = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  canManageMembers?: boolean;
  canViewEmails?: boolean;
};

function removalDescription(path: ProjectAccessPath): string {
  if (path.type === "team_admin") {
    return `This removes ${path.teamName ?? "the team"}'s access to this project, including team admins such as this user. Their account will not be changed.`;
  }
  return "This user will no longer be able to access this project. Their account and other team access will not be changed.";
}

function accessSourceLabel(user: ProjectAccessUser): string {
  if (user.paths.some((path) => path.type === "owner")) {
    return "Owner";
  }
  if (user.removablePaths.some((path) => path.type === "team_admin")) {
    return "Access inherited from Team";
  }
  if (user.removablePaths.length > 0) {
    return "Direct assignment";
  }
  if (user.paths.some((path) => path.type === "team_admin")) {
    return "Access inherited from Team";
  }
  return "Team access";
}

export function UsersWithAccessSection({
  projectId,
  projectSlug,
  projectName,
  canManageMembers = false,
  canViewEmails = false,
}: UsersWithAccessSectionProps) {
  const [users, setUsers] = useState<ProjectAccessUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    user: ProjectAccessUser;
    path: ProjectAccessPath;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    if (!shouldUseLocalDataClient()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await localGetProjectAccessUsers(projectSlug);
      setUsers(
        (result.users ?? []).map((user) => ({
          ...user,
          role: user.role as ProjectAccessUser["role"],
          paths: (user as ProjectAccessUser).paths ?? [],
          removablePaths: (user as ProjectAccessUser).removablePaths ?? [],
        })),
      );
    } catch (loadError) {
      setUsers([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load users with access.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    const { user, path } = pendingRemoval;
    if (!path.teamId) return;
    if (
      path.type !== "project_operator" &&
      path.type !== "project_viewer" &&
      path.type !== "team_admin"
    ) {
      return;
    }

    setBusyUserId(user.id);
    setError(null);
    try {
      await localRemoveProjectAccess({
        projectSlug,
        userId: user.id,
        teamId: path.teamId,
        pathType: path.type,
      });
      setPendingRemoval(null);
      await loadUsers();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove project access.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  if (!shouldUseLocalDataClient()) {
    return null;
  }

  return (
    <>
      <DisclosureSection title={`Users With Access (${users.length})`}>
        {canManageMembers ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Manage who can access this project.</p>
            <Button
              type="button"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setShowAddUserDialog(true);
              }}
            >
              Add User
            </Button>
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted">No active users with access.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                    Access
                  </th>
                  {canViewEmails ? (
                    <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                      Email
                    </th>
                  ) : null}
                  {canManageMembers ? (
                    <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                      Action
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-2 align-top font-medium text-foreground">{user.name}</td>
                    <td className="px-3 py-2 align-top text-foreground">{user.role}</td>
                    <td className="px-3 py-2 align-top text-muted">{accessSourceLabel(user)}</td>
                    {canViewEmails ? (
                      <td className="px-3 py-2 align-top text-muted">{user.email ?? "—"}</td>
                    ) : null}
                    {canManageMembers ? (
                      <td className="px-3 py-2 align-top">
                        {user.removablePaths.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busyUserId === user.id}
                            onClick={() =>
                              setPendingRemoval({
                                user,
                                path: user.removablePaths[0]!,
                              })
                            }
                          >
                            Remove Access
                          </Button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pendingRemoval ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-surface-raised p-4">
            <p className="text-sm font-medium text-foreground">Remove project access?</p>
            <p className="text-sm text-muted">{removalDescription(pendingRemoval.path)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busyUserId === pendingRemoval.user.id}
                onClick={() => void confirmRemoval()}
              >
                Remove Access
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyUserId === pendingRemoval.user.id}
                onClick={() => setPendingRemoval(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
      </DisclosureSection>

      {showAddUserDialog ? (
        <AddUserToProjectDialog
          projectId={projectId}
          projectName={projectName}
          existingUserIds={users.map((user) => user.id)}
          onClose={() => setShowAddUserDialog(false)}
          onAdded={() => void loadUsers()}
        />
      ) : null}
    </>
  );
}
