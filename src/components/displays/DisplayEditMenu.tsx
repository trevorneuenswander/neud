"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DuplicateDisplayModal } from "@/components/developer-tools/DuplicateDisplayModal";
import { PermanentDeleteDisplayDialog } from "@/components/displays/PermanentDeleteDisplayDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DeveloperToolsDropdown } from "@/components/ui/DeveloperToolsDropdown";
import {
  localArchiveDeveloperDisplay,
  localDuplicateDeveloperDisplay,
} from "@/lib/local/developer-tools-api";
import { localDeleteDisplay } from "@/lib/local/displays-api";
import { isProtectedDisplayKey } from "@/lib/displays/protected-display-keys";
import type { ProjectDisplaySource } from "@/lib/developer-tools/types";

type DuplicateDisplayResult = Awaited<
  ReturnType<typeof localDuplicateDeveloperDisplay>
>["display"];

type DisplayEditMenuProps = {
  projectSlug: string;
  display: Pick<
    ProjectDisplaySource,
    "id" | "name" | "slug" | "displayKey" | "sourceType" | "archived" | "description"
  >;
  onChanged?: () => void;
  onArchived?: (displayId: string) => void;
  onDeleted?: (displayId: string) => void;
  onDuplicated?: (duplicate: DuplicateDisplayResult) => void;
};

export function DisplayEditMenu({
  projectSlug,
  display,
  onChanged,
  onArchived,
  onDeleted,
  onDuplicated,
}: DisplayEditMenuProps) {
  const router = useRouter();
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  async function confirmDuplicate(values: { name: string; description?: string }) {
    setDuplicatePending(true);
    setError(null);
    try {
      const result = await localDuplicateDeveloperDisplay(projectSlug, display.id, values);
      setShowDuplicateDialog(false);
      onDuplicated?.(result.display);
      onChanged?.();
      router.refresh();
    } finally {
      setDuplicatePending(false);
    }
  }

  async function confirmArchive() {
    setArchivePending(true);
    setError(null);
    try {
      await localArchiveDeveloperDisplay(projectSlug, display.id);
      setShowArchiveDialog(false);
      onArchived?.(display.id);
      onChanged?.();
      router.refresh();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Unable to archive display.",
      );
    } finally {
      setArchivePending(false);
    }
  }

  async function confirmDelete() {
    setDeletePending(true);
    setError(null);
    try {
      await localDeleteDisplay(projectSlug, display.id);
      setShowDeleteDialog(false);
      onDeleted?.(display.id);
      onChanged?.();
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete display.",
      );
      throw deleteError;
    } finally {
      setDeletePending(false);
    }
  }

  const menuItems = [
    {
      id: "edit-display",
      label: "Edit Display",
      onSelect: () => {
        router.push(`/projects/${projectSlug}/displays/${display.id}/edit`);
      },
    },
    {
      id: "duplicate",
      label: "Duplicate",
      disabled: duplicatePending,
      onSelect: () => setShowDuplicateDialog(true),
    },
    {
      id: "archive",
      label: "Archive",
      disabled: archivePending || display.archived,
      onSelect: () => setShowArchiveDialog(true),
    },
    {
      id: "delete",
      label: "Delete",
      disabled: deletePending || isProtectedDisplayKey(display.displayKey),
      variant: "destructive" as const,
      separatorBefore: true,
      onSelect: () => setShowDeleteDialog(true),
    },
  ];

  return (
    <>
      <DeveloperToolsDropdown label="Edit" items={menuItems} align="right" />
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {showDuplicateDialog ? (
        <DuplicateDisplayModal
          defaultName={`${display.name} Copy`}
          defaultDescription={display.description ?? ""}
          onCancel={() => setShowDuplicateDialog(false)}
          onConfirm={confirmDuplicate}
        />
      ) : null}
      {showArchiveDialog ? (
        <ConfirmDialog
          title="Archive Display?"
          description={`Archive "${display.name}"? This will disable the display, remove it from the active Displays list, and preserve its HTML version history, Activity history, stable ID, and project relationship.`}
          confirmLabel="Archive"
          onCancel={() => setShowArchiveDialog(false)}
          onConfirm={confirmArchive}
        />
      ) : null}
      {showDeleteDialog ? (
        <PermanentDeleteDisplayDialog
          displayName={display.name}
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
