"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DuplicateDisplayModal } from "@/components/developer-tools/DuplicateDisplayModal";
import { DisplayEditClient } from "@/components/displays/DisplayEditClient";
import { PermanentDeleteDisplayDialog } from "@/components/displays/PermanentDeleteDisplayDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DeveloperToolsDropdown } from "@/components/ui/DeveloperToolsDropdown";
import { NeudModal } from "@/components/ui/NeudModal";
import { getDesktopAPI } from "@/lib/desktop/client";
import {
  localArchiveDeveloperDisplay,
  localDuplicateDeveloperDisplay,
} from "@/lib/local/developer-tools-api";
import { localDeleteDisplay } from "@/lib/local/displays-api";
import { isProtectedDisplayKey } from "@/lib/displays/protected-display-keys";
import type { ProjectDisplaySource } from "@/lib/developer-tools/types";
import { confirmAndStopOutputsForDisplay } from "@/lib/output/confirm-output-interruption";
import { OutputInterruptionCanceledError } from "@/lib/output/output-interruption-guard";

type DuplicateDisplayResult = Awaited<
  ReturnType<typeof localDuplicateDeveloperDisplay>
>["display"];

type DisplayEditMenuProps = {
  projectSlug: string;
  projectId?: string;
  projectName?: string;
  display: Pick<
    ProjectDisplaySource,
    "id" | "name" | "slug" | "displayKey" | "sourceType" | "archived" | "description"
  > & {
    supportsGraphicEditor?: boolean;
    settings?: Record<string, unknown> | null;
  };
  onChanged?: () => void;
  onArchived?: (displayId: string) => void;
  onDeleted?: (displayId: string) => void;
  onDuplicated?: (duplicate: DuplicateDisplayResult) => void;
};

function isEditorCompatibleDisplay(
  display: DisplayEditMenuProps["display"],
): boolean {
  if (display.supportsGraphicEditor === true) return true;
  const settings = display.settings && typeof display.settings === "object" ? display.settings : {};
  const version = settings.editorSchemaVersion;
  const graphicType = settings.graphicType;
  if (
    (version === 1 || version === 2) &&
    graphicType === "schedule-ticker-editable"
  ) {
    return true;
  }
  return (
    display.slug === "schedule-ticker-editable" ||
    display.displayKey === "schedule-ticker-editable"
  );
}

export function DisplayEditMenu({
  projectSlug,
  projectId,
  projectName,
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const isVideoDisplay = display.sourceType === "project-video";
  const editorCapable = !isVideoDisplay && isEditorCompatibleDisplay(display);

  function openDisplaySettings() {
    // Pass 14: modal over main window (same pattern as Manage Team / Edit Output).
    // Do not open a standalone Electron BrowserWindow.
    // Video settings omit HTML editing inside DisplayEditClient.
    setShowSettingsModal(true);
  }

  function openGraphicEditor() {
    if (!editorCapable) return;
    const desktop = getDesktopAPI();
    const resolvedProjectId = projectId || "";
    if (desktop?.editor?.open && resolvedProjectId) {
      void desktop.editor.open({
        projectId: resolvedProjectId,
        displayId: display.id,
        projectSlug,
        title: display.name || "Graphic Editor",
      });
      return;
    }
    const params = new URLSearchParams({
      projectId: resolvedProjectId,
      displayId: display.id,
      projectSlug,
    });
    window.open(`/editor/graphic?${params.toString()}`, "_blank");
  }

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

  async function guardDisplayOutputInterruption(): Promise<boolean> {
    try {
      return await confirmAndStopOutputsForDisplay({
        displayId: display.id,
        projectSlug,
        projectId,
      });
    } catch (error) {
      if (error instanceof OutputInterruptionCanceledError) {
        return false;
      }
      throw error;
    }
  }

  async function confirmArchive() {
    setArchivePending(true);
    setError(null);
    try {
      const allowed = await guardDisplayOutputInterruption();
      if (!allowed) {
        setShowArchiveDialog(false);
        return;
      }
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
      const allowed = await guardDisplayOutputInterruption();
      if (!allowed) {
        setShowDeleteDialog(false);
        return;
      }
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
    ...(isVideoDisplay
      ? []
      : [
          {
            id: "graphic-editor",
            label: "Graphic Editor",
            disabled: !editorCapable,
            title: editorCapable
              ? undefined
              : "Graphic Editor is not available for this display yet.",
            onSelect: () => openGraphicEditor(),
          },
        ]),
    {
      id: "duplicate",
      label: "Duplicate",
      disabled: duplicatePending || isVideoDisplay,
      title: isVideoDisplay
        ? "Duplicate is not available for ProRes video displays yet."
        : undefined,
      onSelect: () => setShowDuplicateDialog(true),
    },
    {
      id: "archive",
      label: "Archive",
      disabled: archivePending || display.archived,
      onSelect: () => setShowArchiveDialog(true),
    },
    {
      id: "settings",
      label: "Settings",
      onSelect: () => openDisplaySettings(),
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
      {showSettingsModal ? (
        <NeudModal
          title={`${display.name || "Display"} — Display Settings`}
          size="xl"
          onClose={() => setShowSettingsModal(false)}
        >
          <DisplayEditClient
            projectSlug={projectSlug}
            projectName={projectName || projectSlug}
            displayId={display.id}
            variant="modal"
          />
        </NeudModal>
      ) : null}
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
