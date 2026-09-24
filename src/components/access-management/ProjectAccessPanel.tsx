"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import { AccessManagementTable } from "@/components/access-management/AccessManagementTable";
import {
  PROJECT_ACCESS_COLUMN_WIDTHS,
  PROJECT_TEAM_COLUMN_WIDTHS,
} from "@/lib/access-management/table-layout";
import { ACCESS_TABLE_ACTION_BUTTON_CLASS } from "@/lib/access-management/table-action-buttons";
import type { AccessManagementActions } from "@/lib/access-management/actions";
import type { AccessManagementDirectory, CloudProjectRole } from "@/lib/access-management/types";
import { accessManagementErrorMessage } from "@/lib/access-management/errors";
import {
  PROJECT_ROLES,
  buildProjectAccessRows,
  canManageProjectAccess,
  formatUserWithTeams,
  resolveAccessCapabilities,
} from "@/lib/access-management/role-model";

type ProjectAccessPanelProps = {
  directory: AccessManagementDirectory;
  currentUserId?: string | null;
  isOnline?: boolean;
  actions?: Pick<
    AccessManagementActions,
    | "assignProjectTeam"
    | "removeProjectTeam"
    | "addProjectMember"
    | "changeProjectMemberRole"
    | "removeProjectMember"
  >;
};

export function ProjectAccessPanel({
  directory,
  currentUserId = null,
  isOnline = true,
  actions,
}: ProjectAccessPanelProps) {
  const { projects, teams, users } = directory;
  const capabilities = useMemo(
    () => resolveAccessCapabilities(directory, currentUserId),
    [directory, currentUserId],
  );

  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [teamId, setTeamId] = useState("");
  const [userId, setUserId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [role, setRole] = useState<CloudProjectRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessRows = useMemo(
    () => (projectId ? buildProjectAccessRows(projectId, directory) : []),
    [projectId, directory],
  );
  const assignedTeams = useMemo(
    () => directory.projectTeams.filter((assignment) => assignment.projectId === projectId),
    [projectId, directory.projectTeams],
  );
  const canManage =
    Boolean(projectId) &&
    canManageProjectAccess(capabilities, projectId, directory, currentUserId) &&
    Boolean(actions) &&
    isOnline;

  const filteredUsers = useMemo(() => {
    const normalized = userQuery.trim().toLowerCase();
    if (!normalized) {
      return users;
    }
    return users.filter((user) => {
      const label = formatUserWithTeams(user, directory).toLowerCase();
      return (
        label.includes(normalized) ||
        user.fullName.toLowerCase().includes(normalized) ||
        user.email.toLowerCase().includes(normalized)
      );
    });
  }, [directory, userQuery, users]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(accessManagementErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects available"
        description="Project access appears once you can view at least one project."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="project-access-project" className="block text-sm font-medium text-foreground">
          Project
        </label>
        <select
          id="project-access-project"
          name="project-access-project"
          className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          required
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {canManage ? (
        <div className="grid gap-4 md:grid-cols-2">
          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction(async () => {
                await actions!.assignProjectTeam!({ projectId, teamId });
                setTeamId("");
              });
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">Assign team</h3>
            <div>
              <label htmlFor="assign-team" className="block text-sm font-medium text-foreground">
                Team
              </label>
              <select
                id="assign-team"
                name="assign-team"
                className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                required
              >
                <option value="">Select team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || !teamId}>
              Assign team
            </Button>
          </form>

          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction(async () => {
                await actions!.addProjectMember!({ projectId, userId, role });
                setUserId("");
                setUserQuery("");
              });
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">Add direct member</h3>
            <div>
              <label htmlFor="assign-user-search" className="block text-sm font-medium text-foreground">
                Search user
              </label>
              <input
                id="assign-user-search"
                name="assign-user-search"
                className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Name or team"
              />
            </div>
            <div>
              <label htmlFor="assign-user" className="block text-sm font-medium text-foreground">
                User
              </label>
              <select
                id="assign-user"
                name="assign-user"
                className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                required
              >
                <option value="">Select user</option>
                {filteredUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {formatUserWithTeams(user, directory)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="project-role" className="block text-sm font-medium text-foreground">
                Project role
              </label>
              <select
                id="project-role"
                name="project-role"
                className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                value={role}
                onChange={(event) => setRole(event.target.value as CloudProjectRole)}
                required
              >
                {PROJECT_ROLES.map((projectRole) => (
                  <option key={projectRole} value={projectRole}>
                    {projectRole.charAt(0).toUpperCase() + projectRole.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || !userId}>
              Add member
            </Button>
          </form>
        </div>
      ) : null}

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Assigned Teams
        </h3>
        {assignedTeams.length === 0 ? (
          <p className="text-sm text-muted">No teams assigned to this project.</p>
        ) : (
          <AccessManagementTable
            columnWidths={PROJECT_TEAM_COLUMN_WIDTHS}
            headers={["Team", "Actions"]}
          >
            {assignedTeams.map((assignment) => {
              const team = teams.find((entry) => entry.id === assignment.teamId);
              return (
                <DataTableRow key={`${assignment.projectId}:${assignment.teamId}`}>
                  <DataTableCell className="truncate">{team?.name || assignment.teamId}</DataTableCell>
                  <DataTableCell>
                    {canManage && actions?.removeProjectTeam ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          className={ACCESS_TABLE_ACTION_BUTTON_CLASS}
                          disabled={busy}
                          onClick={() =>
                            void runAction(async () => {
                              await actions.removeProjectTeam!({
                                projectId: assignment.projectId,
                                teamId: assignment.teamId,
                              });
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </AccessManagementTable>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          User Access
        </h3>
        {accessRows.length === 0 ? (
          <p className="text-sm text-muted">No access rows for this project.</p>
        ) : (
          <AccessManagementTable
            columnWidths={PROJECT_ACCESS_COLUMN_WIDTHS}
            headers={["User", "Team", "Access Source", "Project Role", "Status", "Actions"]}
          >
            {accessRows.map((row) => (
              <DataTableRow key={row.key}>
                <DataTableCell>
                  <div className="truncate font-medium">{row.userName}</div>
                  {row.userEmail ? (
                    <div className="truncate text-sm text-muted">{row.userEmail}</div>
                  ) : null}
                </DataTableCell>
                <DataTableCell className="whitespace-normal text-sm">{row.teamLabel}</DataTableCell>
                <DataTableCell className="whitespace-normal text-sm">{row.accessSource}</DataTableCell>
                <DataTableCell>{row.projectRole}</DataTableCell>
                <DataTableCell>{row.status}</DataTableCell>
                <DataTableCell>
                  {canManage && row.isMutable ? (
                    <div className="flex flex-nowrap items-center justify-end gap-2">
                      <select
                        aria-label={`Change project role for ${row.userName}`}
                        className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs"
                        value={row.projectRole.toLowerCase()}
                        disabled={busy}
                        onChange={(event) => {
                          const nextRole = event.target.value as CloudProjectRole;
                          void runAction(async () => {
                            await actions!.changeProjectMemberRole!({
                              projectId,
                              userId: row.userId,
                              role: nextRole,
                            });
                          });
                        }}
                      >
                        {PROJECT_ROLES.map((projectRole) => (
                          <option key={projectRole} value={projectRole}>
                            {projectRole.charAt(0).toUpperCase() + projectRole.slice(1)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        className={ACCESS_TABLE_ACTION_BUTTON_CLASS}
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            await actions!.removeProjectMember!({
                              projectId,
                              userId: row.userId,
                            });
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    "—"
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </AccessManagementTable>
        )}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
