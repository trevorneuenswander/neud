"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { DataTableCell, DataTableRow } from "@/components/ui/DataTable";
import { AccessManagementTable } from "@/components/access-management/AccessManagementTable";
import {
  TEAM_COLUMN_WIDTHS,
  TEAM_MEMBER_COLUMN_WIDTHS,
} from "@/lib/access-management/table-layout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccessManagementActions } from "@/lib/access-management/actions";
import type { AccessManagementDirectory, CloudTeamRole } from "@/lib/access-management/types";
import { accessManagementErrorMessage } from "@/lib/access-management/errors";
import { AccessTeamDeleteButton } from "@/components/access-management/AccessTeamDeleteButton";
import { ACCESS_TABLE_ACTION_BUTTON_CLASS } from "@/lib/access-management/table-action-buttons";
import {
  ASSIGNABLE_TEAM_ROLES,
  canManageTeam,
  countTeamProjects,
  isNeudTeam,
  isSoleOwnerProfile,
  resolveAccessCapabilities,
  resolveDisplayTeamRole,
  type AssignableTeamRole,
} from "@/lib/access-management/role-model";

type TeamsPanelProps = {
  directory: AccessManagementDirectory;
  currentUserId?: string | null;
  isOnline?: boolean;
  actions?: Pick<
    AccessManagementActions,
    | "refresh"
    | "createTeam"
    | "updateTeam"
    | "archiveTeam"
    | "addTeamMember"
    | "changeTeamMemberRole"
    | "removeTeamMember"
  >;
};

export function TeamsPanel({
  directory,
  currentUserId = null,
  isOnline = true,
  actions,
}: TeamsPanelProps) {
  const { teams, teamMemberships, users } = directory;
  const capabilities = useMemo(
    () => resolveAccessCapabilities(directory, currentUserId),
    [directory, currentUserId],
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<AssignableTeamRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createNameRef = useRef<HTMLInputElement>(null);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const canManageSelectedTeam =
    selectedTeam && canManageTeam(capabilities, selectedTeam.id) && Boolean(actions);

  useEffect(() => {
    if (showCreateForm) {
      createNameRef.current?.focus();
    }
  }, [showCreateForm]);

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

  function toggleExpanded(teamId: string) {
    setExpandedTeamId((previous) => (previous === teamId ? null : teamId));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!actions?.createTeam || !capabilities.hasSiteWideAccess || !isOnline || busy) {
      return;
    }
    await runAction(async () => {
      await actions.createTeam({ name: name.trim() });
      setName("");
      setShowCreateForm(false);
    });
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!actions?.updateTeam || !selectedTeamId || !canManageSelectedTeam || !isOnline) {
      return;
    }
    await runAction(async () => {
      await actions.updateTeam({
        teamId: selectedTeamId,
        name: editName.trim() || undefined,
      });
    });
  }

  function renderMemberActions(
    teamId: string,
    member: (typeof teamMemberships)[number],
  ) {
    const user = users.find((entry) => entry.id === member.userId);
    const isOwnerRow = user ? isSoleOwnerProfile(user) && isNeudTeam(
      teams.find((team) => team.id === teamId) ?? { name: "", slug: "" },
    ) : false;
    const canManageMembers = canManageTeam(capabilities, teamId) && Boolean(actions) && isOnline;

    if (isOwnerRow || !canManageMembers) {
      return "—";
    }

    return (
      <div className="flex flex-wrap gap-2">
        {actions?.changeTeamMemberRole ? (
          <select
            aria-label={`Change role for ${member.userName || member.userEmail}`}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-sm"
            value={member.role === "admin" ? "admin" : "member"}
            disabled={busy}
            onChange={(event) => {
              const role = event.target.value as AssignableTeamRole;
              void runAction(async () => {
                await actions.changeTeamMemberRole!({
                  teamId,
                  userId: member.userId,
                  role: role as CloudTeamRole,
                });
              });
            }}
          >
            {ASSIGNABLE_TEAM_ROLES.map((role) => (
              <option key={role} value={role}>
                {role === "admin" ? "Admin" : "Member"}
              </option>
            ))}
          </select>
        ) : null}
        {actions?.removeTeamMember ? (
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await actions.removeTeamMember!({
                  teamId,
                  userId: member.userId,
                });
              })
            }
          >
            Remove
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {capabilities.hasSiteWideAccess && actions?.createTeam && isOnline ? (
        <div className="space-y-4">
          {!showCreateForm ? (
            <Button type="button" onClick={() => setShowCreateForm(true)}>
              Create Team
            </Button>
          ) : (
            <form
              className="space-y-4 rounded-lg border border-border p-4"
              onSubmit={handleCreate}
            >
              <FormField
                id="team-name"
                name="team-name"
                label="Team Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                inputRef={createNameRef}
                required
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create Team"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setShowCreateForm(false);
                    setName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {teams.length === 0 ? (
        <EmptyState title="No teams yet" description="Create a team to organize users and projects." />
      ) : (
        <AccessManagementTable
          columnWidths={TEAM_COLUMN_WIDTHS}
          headers={["Name", "Members", "Projects", "Status", "Actions"]}
        >
          {teams.map((team) => {
            const projectCount = countTeamProjects(team.id, directory);
            const canManageThisTeam =
              canManageTeam(capabilities, team.id) && Boolean(actions) && isOnline;

            return (
              <DataTableRow key={team.id}>
                <DataTableCell>
                  <div className="font-medium text-foreground">{team.name}</div>
                  {isNeudTeam(team) ? (
                    <p className="mt-1 text-xs text-muted">
                      NEUD Admins can manage all teams and projects.
                    </p>
                  ) : null}
                </DataTableCell>
                <DataTableCell className="tabular-nums">{team.memberCount}</DataTableCell>
                <DataTableCell className="tabular-nums">{projectCount}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={team.isActive ? "approved" : "rejected"} />
                </DataTableCell>
                <DataTableCell>
                  <div className="flex flex-nowrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className={ACCESS_TABLE_ACTION_BUTTON_CLASS}
                      disabled={busy}
                      onClick={() => toggleExpanded(team.id)}
                    >
                      {expandedTeamId === team.id ? "Hide members" : "Show members"}
                    </Button>
                    {canManageThisTeam ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className={ACCESS_TABLE_ACTION_BUTTON_CLASS}
                        disabled={busy}
                        onClick={() => {
                          setSelectedTeamId(team.id);
                          setEditName(team.name);
                        }}
                      >
                        Manage
                      </Button>
                    ) : null}
                    {currentUserId && actions?.refresh ? (
                      <AccessTeamDeleteButton
                        actorUserId={currentUserId}
                        teamId={team.id}
                        teamName={team.name}
                        directory={{
                          users: users.map((user) => ({
                            id: user.id,
                            email: user.email,
                            platformRole: user.platformRole,
                            fullName: user.fullName,
                          })),
                          teams: teams.map((entry) => ({
                            id: entry.id,
                            name: entry.name,
                            slug: entry.slug,
                          })),
                          teamMemberships: teamMemberships.map((entry) => ({
                            teamId: entry.teamId,
                            userId: entry.userId,
                            role: entry.role,
                          })),
                          projectMembers: directory.projectMembers,
                          projectTeams: directory.projectTeams,
                        }}
                        disabled={!isOnline || busy}
                        onDeleted={async () => {
                          await actions.refresh!();
                        }}
                      />
                    ) : null}
                  </div>
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </AccessManagementTable>
      )}

      {expandedTeamId ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {teams.find((team) => team.id === expandedTeamId)?.name ?? "Team"} members
          </h3>
          <AccessManagementTable
            columnWidths={TEAM_MEMBER_COLUMN_WIDTHS}
            headers={["Member", "Email", "Role", "Status", "Actions"]}
          >
            {teamMemberships
              .filter((member) => member.teamId === expandedTeamId)
              .map((member) => {
                const team = teams.find((entry) => entry.id === expandedTeamId);
                const user = users.find((entry) => entry.id === member.userId);
                const displayRole = team
                  ? resolveDisplayTeamRole(member.userId, team.id, directory)
                  : "Member";
                const isOwnerRow =
                  user && team && isSoleOwnerProfile(user) && isNeudTeam(team);

                return (
                  <DataTableRow key={`${member.teamId}:${member.userId}`}>
                    <DataTableCell>{member.userName || "—"}</DataTableCell>
                    <DataTableCell className="truncate">{member.userEmail || "—"}</DataTableCell>
                    <DataTableCell>
                      {isOwnerRow ? (
                        <div className="space-y-1">
                          <StatusBadge status="approved" label="Owner" />
                          <p className="text-xs text-muted">Sole NEUD owner</p>
                        </div>
                      ) : (
                        displayRole
                      )}
                    </DataTableCell>
                    <DataTableCell>{user?.accountStatus ?? "active"}</DataTableCell>
                    <DataTableCell>
                      {team ? renderMemberActions(team.id, member) : "—"}
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
          </AccessManagementTable>
        </div>
      ) : null}

      {selectedTeam && canManageSelectedTeam ? (
        <div className="space-y-6 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Manage {selectedTeam.name}</h3>

          {actions?.updateTeam ? (
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpdate}>
              <FormField
                id="edit-team-name"
                name="edit-team-name"
                label="Team Name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
              <div className="flex flex-wrap items-end gap-2 md:col-span-2">
                <Button type="submit" disabled={busy}>
                  Save changes
                </Button>
                {!isNeudTeam(selectedTeam) ? (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void runAction(async () => {
                        if (
                          !window.confirm(
                            `Archive team "${selectedTeam.name}"? This disables the team but keeps history.`,
                          )
                        ) {
                          return;
                        }
                        await actions.archiveTeam!(selectedTeam.id);
                        setSelectedTeamId(null);
                      })
                    }
                  >
                    Archive team
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setSelectedTeamId(null)}
                >
                  Close
                </Button>
              </div>
            </form>
          ) : null}

          {actions?.addTeamMember ? (
            <form
              className="grid gap-4 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction(async () => {
                  await actions.addTeamMember!({
                    teamId: selectedTeam.id,
                    userId: memberUserId,
                    role: memberRole,
                  });
                  setMemberUserId("");
                });
              }}
            >
              <div>
                <label htmlFor="member-user" className="block text-sm font-medium text-foreground">
                  User
                </label>
                <select
                  id="member-user"
                  name="member-user"
                  className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  value={memberUserId}
                  onChange={(event) => setMemberUserId(event.target.value)}
                  required
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName || user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="member-role" className="block text-sm font-medium text-foreground">
                  Team role
                </label>
                <select
                  id="member-role"
                  name="member-role"
                  className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value as AssignableTeamRole)}
                  required
                >
                  {ASSIGNABLE_TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role === "admin" ? "Admin" : "Member"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={busy || !memberUserId}>
                  Add member
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
