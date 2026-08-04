"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { DataTableCell, DataTableRow } from "@/components/ui/DataTable";
import { AccessManagementTable } from "@/components/access-management/AccessManagementTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccessManagementActions } from "@/lib/access-management/actions";
import type { AccessManagementDirectory, CloudTeamRole } from "@/lib/access-management/types";
import { accessManagementErrorMessage } from "@/lib/access-management/errors";
import { INVITATION_COLUMN_WIDTHS } from "@/lib/access-management/table-layout";
import {
  ASSIGNABLE_TEAM_ROLES,
  isNeudTeam,
  type AssignableTeamRole,
} from "@/lib/access-management/role-model";

type InvitationStatusFilter =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "all";

type InvitationsPanelProps = {
  directory: AccessManagementDirectory;
  canInvite: boolean;
  isOnline?: boolean;
  actions?: Pick<
    AccessManagementActions,
    "createInvitation" | "resendInvitation" | "revokeInvitation"
  >;
};

const STATUS_FILTERS: Array<{ id: InvitationStatusFilter; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Revoked" },
  { id: "all", label: "All" },
];

export function InvitationsPanel({
  directory,
  canInvite,
  isOnline = true,
  actions,
}: InvitationsPanelProps) {
  const { invitations, teams } = directory;
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState<AssignableTeamRole>("member");
  const [showNeudAdminWarning, setShowNeudAdminWarning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvitationStatusFilter>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const invitingNeudAdmin =
    selectedTeam && isNeudTeam(selectedTeam) && teamRole === "admin";

  const filteredInvitations = useMemo(() => {
    if (statusFilter === "all") {
      return invitations;
    }
    return invitations.filter((invitation) => invitation.status === statusFilter);
  }, [invitations, statusFilter]);

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

  async function submitInvitation() {
    if (!actions?.createInvitation || !teamId) {
      setError("Select a team before sending an invitation.");
      return;
    }
    if (invitingNeudAdmin && !showNeudAdminWarning) {
      setShowNeudAdminWarning(true);
      return;
    }
    await runAction(async () => {
      await actions.createInvitation!({
        email: email.trim(),
        teamId,
        teamRole: teamRole as CloudTeamRole,
      });
      setEmail("");
      setShowNeudAdminWarning(false);
    });
  }

  return (
    <div className="space-y-6">
      {canInvite && isOnline && actions?.createInvitation ? (
        <form
          className="grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitInvitation();
          }}
        >
          <FormField
            id="invite-email"
            name="invite-email"
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div>
            <label htmlFor="invite-team" className="block text-sm font-medium text-foreground">
              Team
            </label>
            <select
              id="invite-team"
              name="invite-team"
              className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                setShowNeudAdminWarning(false);
              }}
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
          <div>
            <label htmlFor="invite-team-role" className="block text-sm font-medium text-foreground">
              Team role
            </label>
            <select
              id="invite-team-role"
              name="invite-team-role"
              className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
              value={teamRole}
              onChange={(event) => {
                setTeamRole(event.target.value as AssignableTeamRole);
                setShowNeudAdminWarning(false);
              }}
              required
            >
              {ASSIGNABLE_TEAM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role === "admin" ? "Admin" : "Member"}
                </option>
              ))}
            </select>
          </div>
          {invitingNeudAdmin ? (
            <div className="md:col-span-3 rounded-md border border-border bg-surface-raised p-3 text-sm text-muted">
              NEUD Admins can manage all teams, projects, users, and invitations.
              {showNeudAdminWarning ? (
                <p className="mt-2 text-foreground">
                  Confirm sending this invitation with site-wide administrative access.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="md:col-span-3">
            <Button type="submit" disabled={busy || !email.trim() || !teamId}>
              {showNeudAdminWarning && invitingNeudAdmin
                ? "Confirm invitation"
                : "Send invitation"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.id}
            type="button"
            variant={statusFilter === filter.id ? "primary" : "secondary"}
            onClick={() => setStatusFilter(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {filteredInvitations.length === 0 ? (
        <EmptyState
          title="No invitations"
          description={
            statusFilter === "pending"
              ? "Pending invitations appear here when someone has been invited but not yet accepted."
              : "No invitations match the selected status filter."
          }
        />
      ) : (
        <AccessManagementTable
          columnWidths={INVITATION_COLUMN_WIDTHS}
          headers={["Email", "Status", "Team Role", "Expires", "Actions"]}
        >
          {filteredInvitations.map((invitation) => {
            const team = teams.find((entry) => entry.id === invitation.teamId);
            const roleLabel = invitation.teamRole
              ? invitation.teamRole === "admin"
                ? "Admin"
                : invitation.teamRole === "member"
                  ? "Member"
                  : invitation.teamRole
              : "—";

            return (
              <DataTableRow key={invitation.id}>
                <DataTableCell className="truncate">
                  {invitation.email}
                  {team ? (
                    <div className="text-sm text-muted">{team.name}</div>
                  ) : null}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={invitation.status} />
                </DataTableCell>
                <DataTableCell>{roleLabel}</DataTableCell>
                <DataTableCell>{new Date(invitation.expiresAt).toLocaleString()}</DataTableCell>
                <DataTableCell>
                  {canInvite && isOnline && invitation.status === "pending" && actions ? (
                    <div className="flex flex-wrap gap-2">
                      {actions.resendInvitation ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void runAction(async () => {
                              await actions.resendInvitation!(invitation.id);
                            })
                          }
                        >
                          Resend
                        </Button>
                      ) : null}
                      {actions.revokeInvitation ? (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy}
                          onClick={() =>
                            void runAction(async () => {
                              await actions.revokeInvitation!(invitation.id);
                            })
                          }
                        >
                          Revoke
                        </Button>
                      ) : null}
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

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
