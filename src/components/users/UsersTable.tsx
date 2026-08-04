"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatPlatformRole } from "@/lib/portal/navigation";
import {
  canAssignRole,
  canDeleteUser,
  canEditUser,
} from "@/lib/auth/platform-permissions";
import {
  deletePlatformUser,
  updatePlatformUserRole,
} from "@/lib/users/actions";
import type { PlatformUserListItem } from "@/lib/users/types";
import {
  ADMIN_ASSIGNABLE_ROLES,
  initialUserActionState,
  OWNER_ASSIGNABLE_ROLES,
} from "@/lib/users/types";
import type { ApplicationRole } from "@/lib/auth/application-roles";

type UsersTableProps = {
  users: PlatformUserListItem[];
  actor: { id: string; role: ApplicationRole };
  activeOwnerCount: number;
};

function RoleSelect({
  user,
  actor,
}: {
  user: PlatformUserListItem;
  actor: { id: string; role: ApplicationRole };
}) {
  const assignableRoles =
    actor.role === "owner" ? OWNER_ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES;
  const [state, formAction] = useActionState(
    updatePlatformUserRole,
    initialUserActionState,
  );

  const canChangeRole = assignableRoles.some((role) =>
    canAssignRole(actor, user, role),
  );

  if (!canChangeRole) {
    return <span>{formatPlatformRole(user.role)}</span>;
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={user.id} />
      <select
        name="role"
        defaultValue={user.role}
        className="block w-full rounded-md border border-border bg-surface-raised px-2 py-1 text-sm"
      >
        {assignableRoles.map((role) => (
          <option
            key={role}
            value={role}
            disabled={!canAssignRole(actor, user, role)}
          >
            {formatPlatformRole(role)}
          </option>
        ))}
      </select>
      <RoleSaveButton />
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </form>
  );
}

function RoleSaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : "Save role"}
    </Button>
  );
}

function DeleteUserButton({
  user,
  actor,
  activeOwnerCount,
}: {
  user: PlatformUserListItem;
  actor: { id: string; role: ApplicationRole };
  activeOwnerCount: number;
}) {
  const [state, formAction] = useActionState(
    deletePlatformUser,
    initialUserActionState,
  );

  if (!canDeleteUser(actor, user, { activeOwnerCount })) {
    return null;
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={user.id} />
      <DeleteButton />
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="danger" disabled={pending}>
      {pending ? "Deleting…" : "Delete user"}
    </Button>
  );
}

function formatAccountStatus(status: PlatformUserListItem["accountStatus"]) {
  switch (status) {
    case "active":
      return "Active";
    case "invited":
      return "Invited";
    case "deactivated":
      return "Deactivated";
    default:
      return status;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function UsersTable({ users, actor, activeOwnerCount }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted">
        No users found.
      </p>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <DataTableHeaderCell>Name</DataTableHeaderCell>
        <DataTableHeaderCell>Email</DataTableHeaderCell>
        <DataTableHeaderCell>Role</DataTableHeaderCell>
        <DataTableHeaderCell>Status</DataTableHeaderCell>
        <DataTableHeaderCell>Projects</DataTableHeaderCell>
        <DataTableHeaderCell>Created</DataTableHeaderCell>
        <DataTableHeaderCell>Last login</DataTableHeaderCell>
        <DataTableHeaderCell>Actions</DataTableHeaderCell>
      </DataTableHead>
      <DataTableBody>
        {users.map((user) => (
          <DataTableRow key={user.id}>
            <DataTableCell>{user.fullName ?? "Unnamed user"}</DataTableCell>
            <DataTableCell className="break-all text-muted">{user.email}</DataTableCell>
            <DataTableCell>
              <RoleSelect user={user} actor={actor} />
            </DataTableCell>
            <DataTableCell>
              <StatusBadge status={formatAccountStatus(user.accountStatus)} />
            </DataTableCell>
            <DataTableCell className="text-muted">
              {user.projectAssignments.length > 0 ? (
                <ul className="space-y-1">
                  {user.projectAssignments.map((assignment) => (
                    <li key={assignment.projectId}>
                      {assignment.projectName} ({assignment.accessLevel})
                    </li>
                  ))}
                </ul>
              ) : (
                "None"
              )}
            </DataTableCell>
            <DataTableCell className="text-muted">
              {formatDate(user.createdAt)}
            </DataTableCell>
            <DataTableCell className="text-muted">
              {formatDate(user.lastSignInAt)}
            </DataTableCell>
            <DataTableCell>
              {canEditUser(actor, user) || canDeleteUser(actor, user, { activeOwnerCount }) ? (
                <DeleteUserButton
                  user={user}
                  actor={actor}
                  activeOwnerCount={activeOwnerCount}
                />
              ) : (
                <span className="text-muted">—</span>
              )}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
