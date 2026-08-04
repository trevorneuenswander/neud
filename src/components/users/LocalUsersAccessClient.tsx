"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { PageSection } from "@/components/portal/PageSection";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import type { AccessDirectory, AccessDirectoryTeam } from "@/lib/local/access-api";
import {
  localCreateTeam,
  localGetAccessDirectory,
  localGetViewableUserIds,
  localInviteAccessUser,
  localSetAccessUserActive,
  localSetProjectTeams,
  localUpdateTeam,
} from "@/lib/local/access-api";
import { localGetAuthStatus, localSyncUserDirectory } from "@/lib/local/auth-api";
import type { DesktopAuthStatusResponse } from "@/lib/auth/desktop-auth-status";
import { getUserDetailsHref } from "@/lib/routes/activity-navigation";
import type { TeamRole } from "@/lib/access/types";

type TabId = "teams" | "users" | "projects" | "invitations";

function roleBadge(role: string) {
  return <StatusBadge status={role} />;
}

function activeBadge(isActive: boolean) {
  return <StatusBadge status={isActive ? "approved" : "rejected"} />;
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
      >
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted">{description}</p>
        {error ? (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (confirmError) {
                setError(
                  confirmError instanceof Error
                    ? confirmError.message
                    : "Unable to complete this action.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onClear,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="max-w-md">
      <FormField
        id={id}
        name={id}
        label={label}
        placeholder={placeholder}
        required={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="mt-2 text-sm text-muted hover:text-foreground"
          onClick={onClear}
        >
          Clear search
        </button>
      ) : null}
    </div>
  );
}

export function LocalUsersAccessClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [directory, setDirectory] = useState<AccessDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("teams");
  const [teamSearch, setTeamSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("operator");
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [confirmTeam, setConfirmTeam] = useState<AccessDirectoryTeam | null>(null);
  const [editTeam, setEditTeam] = useState<AccessDirectoryTeam | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDescription, setEditTeamDescription] = useState("");
  const [pendingProjectTeams, setPendingProjectTeams] = useState<{
    projectId: string;
    projectName: string;
    teamIds: string[];
    removedTeamId: string;
    removedTeamName: string;
  } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewableUserIds, setViewableUserIds] = useState<Set<string>>(new Set());
  const [authStatus, setAuthStatus] = useState<DesktopAuthStatusResponse | null>(null);
  const [refreshingUsers, setRefreshingUsers] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam === "teams" ||
      tabParam === "users" ||
      tabParam === "projects" ||
      tabParam === "invitations"
    ) {
      setTab(tabParam);
    }
    const query = searchParams.get("q") ?? "";
    if (tabParam === "users") {
      setUserSearch(query);
    } else {
      setTeamSearch(query);
    }
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    const query = tab === "users" ? userSearch.trim() : teamSearch.trim();
    if (query) {
      params.set("q", query);
    }
    router.replace(`/users?${params.toString()}`, { scroll: false });
  }, [router, tab, teamSearch, userSearch]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payload, viewable, status] = await Promise.all([
        localGetAccessDirectory(),
        localGetViewableUserIds(),
        localGetAuthStatus(),
      ]);
      setDirectory(payload);
      setViewableUserIds(new Set(viewable.userIds));
      setAuthStatus(status);
      if (!inviteTeamId && payload.teams[0]) {
        setInviteTeamId(payload.teams[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load Users.",
      );
    } finally {
      setLoading(false);
    }
  }, [inviteTeamId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleRefreshUsers() {
    setRefreshingUsers(true);
    setError(null);
    try {
      await localSyncUserDirectory();
      await reload();
      setSuccess("User directory refreshed.");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the user directory.",
      );
    } finally {
      setRefreshingUsers(false);
    }
  }

  const isOfflineAuthenticated = authStatus?.auth.mode === "offline";
  const onlineActionsDisabled = authStatus?.connectionStatus !== "connected";
  const isOwner = directory?.context.isPlatformOwner ?? false;
  const adminTeamId = useMemo(() => {
    if (isOwner) {
      return inviteTeamId;
    }
    return directory?.context.teamMemberships.find((entry) => entry.role === "admin")?.teamId ?? "";
  }, [directory, inviteTeamId, isOwner]);

  const teamProjects = useMemo(() => {
    const teamId = inviteTeamId || adminTeamId;
    return (directory?.projects ?? []).filter((project) => project.teamIds.includes(teamId));
  }, [adminTeamId, directory?.projects, inviteTeamId]);

  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (!directory) {
      return [];
    }
    if (!query) {
      return directory.teams;
    }
    return directory.teams.filter(
      (team) =>
        team.name.toLowerCase().includes(query) ||
        (team.description?.toLowerCase().includes(query) ?? false),
    );
  }, [directory, teamSearch]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!directory) {
      return [];
    }
    if (!query) {
      return directory.users;
    }
    return directory.users.filter((user) => {
      const teamNames = user.teamMemberships.map((membership) => {
        const team = directory.teams.find((entry) => entry.id === membership.teamId);
        return team?.name ?? "";
      });
      return (
        user.fullName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.teamMemberships.some((membership) => membership.role.toLowerCase().includes(query)) ||
        teamNames.some((name) => name.toLowerCase().includes(query)) ||
        (user.assignedProjectNames ?? []).some((name) => name.toLowerCase().includes(query))
      );
    });
  }, [directory, userSearch]);

  const assignableRoles: TeamRole[] = isOwner
    ? ["admin", "operator", "viewer"]
    : ["operator", "viewer"];

  async function handleCreateTeam() {
    await localCreateTeam({
      name: teamName,
      description: teamDescription || null,
    });
    setTeamName("");
    setTeamDescription("");
    setSuccess("Team created.");
    await reload();
  }

  async function handleInviteUser() {
    await localInviteAccessUser({
      email: inviteEmail,
      fullName: inviteFullName,
      teamId: inviteTeamId || adminTeamId,
      role: inviteRole,
      projectIds: inviteRole === "admin" ? [] : inviteProjectIds,
    });
    setInviteEmail("");
    setInviteFullName("");
    setInviteProjectIds([]);
    setSuccess("Invitation sent.");
    await reload();
  }

  async function handleSaveProjectTeams(projectId: string, teamIds: string[]) {
    await localSetProjectTeams({ projectId, teamIds });
    setSuccess("Project team assignments updated.");
    await reload();
  }

  async function handleProjectTeamToggle(
    project: AccessDirectory["projects"][number],
    teamId: string,
    checked: boolean,
  ) {
    const currentTeamIds = project.teamIds;
    const nextTeamIds = checked
      ? [...new Set([...currentTeamIds, teamId])]
      : currentTeamIds.filter((entry) => entry !== teamId);

    if (!checked) {
      const team = directory?.teams.find((entry) => entry.id === teamId);
      const hasAssignments = project.operators.length > 0 || project.viewers.length > 0;
      if (hasAssignments) {
        setPendingProjectTeams({
          projectId: project.id,
          projectName: project.name,
          teamIds: nextTeamIds,
          removedTeamId: teamId,
          removedTeamName: team?.name ?? "team",
        });
        return;
      }
    }

    await handleSaveProjectTeams(project.id, nextTeamIds);
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading Users…</p>;
  }

  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (!directory) {
    return (
      <EmptyState
        title="Users unavailable"
        description="Unable to load the access directory."
      />
    );
  }

  const tabs: Array<{ id: TabId; label: string; hidden?: boolean }> = [
    { id: "teams", label: "Teams", hidden: !isOwner },
    { id: "users", label: "Users" },
    { id: "projects", label: "Project Access" },
    { id: "invitations", label: "Invitations" },
  ];

  const activeTeams = directory.teams.filter((team) => team.isActive);
  const inactiveTeams = directory.teams.filter((team) => !team.isActive);

  return (
    <div className="space-y-6">
      {!isOwner && directory.teams[0] ? (
        <Alert variant="info">Team: {directory.teams[0].name}</Alert>
      ) : null}
      {success ? (
        <Alert variant="success">{success}</Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs
          .filter((entry) => !entry.hidden)
          .map((entry) => (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant={tab === entry.id ? "primary" : "secondary"}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
      </div>

      {tab === "teams" && isOwner ? (
        <div className="space-y-6">
          <PageSection title="Add team">
            <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
              <FormField
                id="team-name"
                name="teamName"
                label="Team name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
              />
              <FormField
                id="team-description"
                name="teamDescription"
                label="Description"
                value={teamDescription}
                onChange={(event) => setTeamDescription(event.target.value)}
                required={false}
              />
              <div className="md:col-span-2">
                <Button type="button" onClick={() => void handleCreateTeam()}>
                  Add Team
                </Button>
              </div>
            </div>
          </PageSection>

          <PageSection title="Teams">
            <SearchField
              id="team-search"
              label="Search teams"
              placeholder="Search teams…"
              value={teamSearch}
              onChange={setTeamSearch}
              onClear={() => setTeamSearch("")}
            />
            {filteredTeams.length > 0 ? (
              <>
                <p className="mt-3 text-sm text-muted">
                  {filteredTeams.length} team{filteredTeams.length === 1 ? "" : "s"}
                </p>
                <DataTable>
                  <DataTableHead>
                    <DataTableHeaderCell>Team</DataTableHeaderCell>
                    <DataTableHeaderCell>Status</DataTableHeaderCell>
                    <DataTableHeaderCell>Users</DataTableHeaderCell>
                    <DataTableHeaderCell>Admins</DataTableHeaderCell>
                    <DataTableHeaderCell>Projects</DataTableHeaderCell>
                    <DataTableHeaderCell>Actions</DataTableHeaderCell>
                  </DataTableHead>
                  <DataTableBody>
                    {filteredTeams.map((team) => (
                      <DataTableRow key={team.id}>
                        <DataTableCell>
                          <div>
                            <p className="font-medium text-foreground">{team.name}</p>
                            {team.description ? (
                              <p className="text-sm text-muted">{team.description}</p>
                            ) : null}
                          </div>
                        </DataTableCell>
                        <DataTableCell>{activeBadge(team.isActive)}</DataTableCell>
                        <DataTableCell>{team.userCount}</DataTableCell>
                        <DataTableCell>{team.adminCount}</DataTableCell>
                        <DataTableCell>{team.projectCount}</DataTableCell>
                        <DataTableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditTeam(team);
                                setEditTeamName(team.name);
                                setEditTeamDescription(team.description ?? "");
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setConfirmTeam(team)}
                            >
                              {team.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              </>
            ) : directory.teams.length > 0 ? (
              <EmptyState
                title="No teams match your search."
                description="Try a different team name or description."
              />
            ) : (
              <EmptyState
                title="No teams have been created."
                description="Create a team to organize users and projects."
              />
            )}
          </PageSection>
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="space-y-6">
          <PageSection title="Add user">
            <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
              <FormField
                id="invite-full-name"
                name="inviteFullName"
                label="Full name"
                value={inviteFullName}
                onChange={(event) => setInviteFullName(event.target.value)}
              />
              <FormField
                id="invite-email"
                name="inviteEmail"
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              {isOwner ? (
                <label className="block text-sm">
                  <span className="font-medium text-foreground">Team</span>
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                    value={inviteTeamId}
                    onChange={(event) => setInviteTeamId(event.target.value)}
                  >
                    {directory.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="font-medium text-foreground">Role</span>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              {inviteRole !== "admin" ? (
                <div className="md:col-span-2">
                  <span className="block text-sm font-medium text-foreground">
                    Assigned projects
                  </span>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {teamProjects.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={inviteProjectIds.includes(project.id)}
                          onChange={(event) => {
                            setInviteProjectIds((current) =>
                              event.target.checked
                                ? [...current, project.id]
                                : current.filter((id) => id !== project.id),
                            );
                          }}
                        />
                        {project.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="md:col-span-2">
                <Button
                  type="button"
                  onClick={() => void handleInviteUser()}
                  disabled={onlineActionsDisabled}
                >
                  Invite User
                </Button>
              </div>
            </div>
          </PageSection>

          <PageSection title="Users">
            {isOfflineAuthenticated ? (
              <Alert variant="info">
                Showing cached user data from the last successful sync
                {authStatus?.userDirectorySync.lastSuccessfulSyncAt
                  ? ` (${new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(
                      Date.parse(authStatus.userDirectorySync.lastSuccessfulSyncAt),
                    )})`
                  : ""}
                . Online-only account actions are disabled while offline.
              </Alert>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SearchField
                id="user-search"
                label="Search users"
                placeholder="Search users…"
                value={userSearch}
                onChange={setUserSearch}
                onClear={() => setUserSearch("")}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={refreshingUsers}
                onClick={() => void handleRefreshUsers()}
              >
                {refreshingUsers ? "Refreshing…" : "Refresh Users"}
              </Button>
            </div>
            {filteredUsers.length > 0 ? (
              <>
                <p className="mt-3 text-sm text-muted">
                  {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
                </p>
                <DataTable>
                  <DataTableHead>
                    <DataTableHeaderCell>User</DataTableHeaderCell>
                    <DataTableHeaderCell>Roles</DataTableHeaderCell>
                    <DataTableHeaderCell>Projects</DataTableHeaderCell>
                    <DataTableHeaderCell>Status</DataTableHeaderCell>
                    <DataTableHeaderCell>Actions</DataTableHeaderCell>
                  </DataTableHead>
                  <DataTableBody>
                    {filteredUsers.map((user) => (
                      <DataTableRow key={user.id}>
                        <DataTableCell>
                          <div>
                            {viewableUserIds.has(user.id) ? (
                              <Link
                                href={getUserDetailsHref(user.id)}
                                className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`View ${user.fullName} user details`}
                              >
                                {user.fullName}
                              </Link>
                            ) : (
                              <p className="font-medium text-foreground">{user.fullName}</p>
                            )}
                            <p className="text-sm text-muted">{user.email}</p>
                          </div>
                        </DataTableCell>
                        <DataTableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.platformRole === "owner" ? (
                              <span key="owner">{roleBadge("owner")}</span>
                            ) : null}
                            {user.teamMemberships.map((membership) => {
                              const team = directory.teams.find(
                                (entry) => entry.id === membership.teamId,
                              );
                              const label =
                                membership.role === "admin" && team
                                  ? `Admin — ${team.name}`
                                  : membership.role;
                              return (
                                <span key={membership.id}>
                                  <StatusBadge status={membership.role} label={label} />
                                </span>
                              );
                            })}
                          </div>
                        </DataTableCell>
                        <DataTableCell>{user.projectAssignmentCount}</DataTableCell>
                        <DataTableCell>{activeBadge(user.isActive)}</DataTableCell>
                        <DataTableCell>
                          {user.platformRole === "owner" ? (
                            <span className="text-sm text-muted">Owner</span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                void localSetAccessUserActive(user.id, !user.isActive).then(reload)
                              }
                            >
                              {user.isActive ? "Deactivate" : "Reactivate"}
                            </Button>
                          )}
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              </>
            ) : directory.users.length > 0 ? (
              <EmptyState
                title="No users match your search."
                description="Try a different name, email, team, or role."
              />
            ) : (
              <EmptyState
                title="No users match the current filters."
                description="Invite a user to get started."
              />
            )}
          </PageSection>
        </div>
      ) : null}

      {tab === "projects" ? (
        <PageSection title="Project Access">
          {directory.projects.length > 0 ? (
            <DataTable>
              <DataTableHead>
                <DataTableHeaderCell>Project</DataTableHeaderCell>
                <DataTableHeaderCell>Assigned Teams</DataTableHeaderCell>
                <DataTableHeaderCell>Operators</DataTableHeaderCell>
                <DataTableHeaderCell>Viewers</DataTableHeaderCell>
              </DataTableHead>
              <DataTableBody>
                {directory.projects.map((project) => (
                  <DataTableRow key={project.id}>
                    <DataTableCell>{project.name}</DataTableCell>
                    <DataTableCell>
                      {isOwner ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">
                            Assigned Teams
                          </p>
                          <div className="grid gap-1">
                            {activeTeams.map((team) => (
                              <label key={team.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={project.teamIds.includes(team.id)}
                                  onChange={(event) =>
                                    void handleProjectTeamToggle(
                                      project,
                                      team.id,
                                      event.target.checked,
                                    )
                                  }
                                />
                                {team.name}
                              </label>
                            ))}
                            {inactiveTeams.length > 0 ? (
                              <div className="mt-2 border-t border-border pt-2">
                                {inactiveTeams.map((team) => (
                                  <label
                                    key={team.id}
                                    className="flex items-center gap-2 text-sm text-muted"
                                  >
                                    <input type="checkbox" disabled checked={false} />
                                    {team.name} (inactive)
                                  </label>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {project.teams.length > 0 ? (
                            project.teams.map((team) => (
                              <span
                                key={team.id}
                                className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-muted"
                              >
                                {team.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-muted">Unassigned</span>
                          )}
                        </div>
                      )}
                    </DataTableCell>
                    <DataTableCell>{project.operators.length}</DataTableCell>
                    <DataTableCell>{project.viewers.length}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : (
            <EmptyState
              title="No projects assigned."
              description="Assign projects to teams to manage access."
            />
          )}
        </PageSection>
      ) : null}

      {tab === "invitations" ? (
        <PageSection title="Invitations">
          {directory.invitations.length > 0 ? (
            <DataTable>
              <DataTableHead>
                <DataTableHeaderCell>Name</DataTableHeaderCell>
                <DataTableHeaderCell>Email</DataTableHeaderCell>
                <DataTableHeaderCell>Role</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
              </DataTableHead>
              <DataTableBody>
                {directory.invitations.map((invitation) => (
                  <DataTableRow key={invitation.id}>
                    <DataTableCell>{invitation.fullName}</DataTableCell>
                    <DataTableCell>{invitation.email}</DataTableCell>
                    <DataTableCell>{roleBadge(invitation.teamRole)}</DataTableCell>
                    <DataTableCell>{roleBadge("pending")}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : (
            <EmptyState
              title="No pending invitations."
              description="Invited users appear here until they accept."
            />
          )}
        </PageSection>
      ) : null}

      {editTeam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground">Edit team</h3>
            <div className="mt-4 grid gap-4">
              <FormField
                id="edit-team-name"
                name="editTeamName"
                label="Team name"
                value={editTeamName}
                onChange={(event) => setEditTeamName(event.target.value)}
              />
              <FormField
                id="edit-team-description"
                name="editTeamDescription"
                label="Description"
                value={editTeamDescription}
                onChange={(event) => setEditTeamDescription(event.target.value)}
                required={false}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditTeam(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  await localUpdateTeam(editTeam.id, {
                    name: editTeamName,
                    description: editTeamDescription || null,
                  });
                  setEditTeam(null);
                  setSuccess("Team updated.");
                  await reload();
                }}
              >
                Save Team
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmTeam ? (
        <ConfirmDialog
          title={confirmTeam.isActive ? "Deactivate team?" : "Reactivate team?"}
          description={
            confirmTeam.isActive
              ? `Deactivating ${confirmTeam.name} will suspend access for its Admins, Operators, and Viewers. Projects and memberships remain stored and can be restored later.`
              : `Reactivating ${confirmTeam.name} will restore team access according to existing memberships.`
          }
          confirmLabel={confirmTeam.isActive ? "Deactivate Team" : "Reactivate Team"}
          onCancel={() => setConfirmTeam(null)}
          onConfirm={async () => {
            await localUpdateTeam(confirmTeam.id, { isActive: !confirmTeam.isActive });
            setConfirmTeam(null);
            setSuccess(`Team ${confirmTeam.isActive ? "deactivated" : "reactivated"}.`);
            await reload();
          }}
        />
      ) : null}

      {pendingProjectTeams ? (
        <ConfirmDialog
          title="Remove team from project?"
          description={`Removing ${pendingProjectTeams.removedTeamName} from ${pendingProjectTeams.projectName} will remove Operator and Viewer assignments scoped to that team.`}
          confirmLabel="Remove Team"
          onCancel={() => setPendingProjectTeams(null)}
          onConfirm={async () => {
            await handleSaveProjectTeams(
              pendingProjectTeams.projectId,
              pendingProjectTeams.teamIds,
            );
            setPendingProjectTeams(null);
          }}
        />
      ) : null}
    </div>
  );
}
