"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { canDeleteUserInDirectory } from "../../../shared/access-management/can-delete-user";
import type { UserDetailsDirectory } from "../../../shared/access-management/can-view-user-details";
import { localDeletePlatformUser } from "@/lib/local/access-api";
import { isLocalApiError } from "@/lib/local/errors";

type AccessUserDeleteButtonProps = {
  actorUserId: string;
  targetUserId: string;
  targetFullName: string;
  directory: UserDetailsDirectory;
  disabled?: boolean;
  onDeleted: () => void | Promise<void>;
};

function mapDirectory(directory: {
  users: Array<{ id: string; email: string; platformRole?: string; fullName?: string }>;
  teams: Array<{ id: string; name: string; slug: string }>;
  teamMemberships: Array<{ teamId: string; userId: string; role: string }>;
  projectMembers?: Array<{ projectId: string; userId: string; role: string }>;
  projectTeams?: Array<{ projectId: string; teamId: string }>;
}): UserDetailsDirectory {
  return {
    users: directory.users.map((user) => ({
      id: user.id,
      email: user.email,
      platformRole: user.platformRole,
      fullName: user.fullName,
    })),
    teams: directory.teams,
    teamMemberships: directory.teamMemberships,
    projectMembers: directory.projectMembers ?? [],
    projectTeams: directory.projectTeams ?? [],
  };
}

export function AccessUserDeleteButton({
  actorUserId,
  targetUserId,
  targetFullName,
  directory,
  disabled = false,
  onDeleted,
}: AccessUserDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = canDeleteUserInDirectory(
    actorUserId,
    targetUserId,
    mapDirectory(directory),
  );

  if (!canDelete) {
    return <span className="text-sm text-muted">—</span>;
  }

  async function handleDelete() {
    setError(null);
    try {
      const result = await localDeletePlatformUser(targetUserId);
      if (!result.ok) {
        setError("User deletion failed.");
        return;
      }
      setOpen(false);
      await onDeleted();
    } catch (deleteError) {
      if (isLocalApiError(deleteError)) {
        setError(deleteError.message);
        return;
      }
      setError(
        deleteError instanceof Error ? deleteError.message : "User deletion failed.",
      );
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="danger"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      {open ? (
        <ConfirmDialog
          title={`Delete ${targetFullName}?`}
          description={
            "This will permanently remove this user's account and access.\nTheir historical activity records will remain.\n\nThis action cannot be undone."
          }
          confirmLabel="Delete User"
          confirmVariant="destructive"
          busyLabel="Deleting…"
          onCancel={() => setOpen(false)}
          onConfirm={handleDelete}
        />
      ) : null}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </>
  );
}
