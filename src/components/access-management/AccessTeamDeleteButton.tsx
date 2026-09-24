"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  canDeleteTeamInDirectory,
  listTeamMemberUserIds,
} from "../../../shared/access-management/can-delete-team";
import { isProtectedNeudTeamId } from "../../../shared/access-management/is-protected-neud-team";
import type { UserDetailsDirectory } from "../../../shared/access-management/can-view-user-details";
import { localDeletePlatformTeam } from "@/lib/local/access-api";
import { isLocalApiError } from "@/lib/local/errors";
import { ACCESS_TABLE_ACTION_BUTTON_CLASS } from "@/lib/access-management/table-action-buttons";

type AccessTeamDeleteButtonProps = {
  actorUserId: string;
  teamId: string;
  teamName: string;
  directory: UserDetailsDirectory;
  disabled?: boolean;
  onDeleted: () => void | Promise<void>;
};

export function AccessTeamDeleteButton({
  actorUserId,
  teamId,
  teamName,
  directory,
  disabled = false,
  onDeleted,
}: AccessTeamDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberCount = useMemo(
    () => listTeamMemberUserIds(teamId, directory).length,
    [directory, teamId],
  );

  if (
    isProtectedNeudTeamId(teamId, directory) ||
    !canDeleteTeamInDirectory(actorUserId, teamId, directory)
  ) {
    return null;
  }

  async function handleDelete() {
    setError(null);
    try {
      const result = await localDeletePlatformTeam(teamId);
      if (!result.ok) {
        setError("Team deletion failed.");
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
        deleteError instanceof Error ? deleteError.message : "Team deletion failed.",
      );
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="danger"
        className={ACCESS_TABLE_ACTION_BUTTON_CLASS}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      {open ? (
        <ConfirmDialog
          title={`Delete ${teamName}?`}
          description={`This will permanently delete this team and all ${memberCount} user${
            memberCount === 1 ? "" : "s"
          } who belong to it, including their accounts and access.\n\nHistorical activity records will remain.\n\nThis action cannot be undone.`}
          confirmLabel="Delete Team"
          confirmVariant="destructive"
          busyLabel="Deleting…"
          onCancel={() => setOpen(false)}
          onConfirm={handleDelete}
        />
      ) : null}
      {error ? <span className="sr-only">{error}</span> : null}
    </>
  );
}
