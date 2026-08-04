"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DuplicateDisplayModal } from "@/components/developer-tools/DuplicateDisplayModal";
import {
  buildProjectDisplayOutputPath,
  buildProjectDisplayPreviewPath,
  localArchiveDeveloperDisplay,
  localDeleteDeveloperDisplay,
  localDuplicateDeveloperDisplay,
  localSetDeveloperDisplayEnabled,
} from "@/lib/local/developer-tools-api";

type DisplayDeveloperActionsProps = {
  projectSlug: string;
  projectId: string;
  display: {
    id: string;
    name: string;
    slug: string;
    enabled: boolean;
    archived: boolean;
    sourceType: "built-in" | "project-html";
  };
};

export function DisplayDeveloperActions({
  projectSlug,
  projectId,
  display,
}: DisplayDeveloperActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(display.enabled);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const outputPath = buildProjectDisplayOutputPath(projectId, display.slug);
  const previewPath = buildProjectDisplayPreviewPath(projectId, display.slug);

  async function handleDuplicate() {
    setShowDuplicateDialog(true);
  }

  async function confirmDuplicate(values: { name: string; description?: string }) {
    setBusy(true);
    setError(null);
    try {
      const result = await localDuplicateDeveloperDisplay(projectSlug, display.id, values);
      setShowDuplicateDialog(false);
      router.push(
        `/projects/${projectSlug}/developer-tools/displays/${result.display.id}`,
      );
    } catch (duplicateError) {
      throw duplicateError;
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEnabled() {
    setBusy(true);
    setError(null);
    try {
      const result = await localSetDeveloperDisplayEnabled(
        projectSlug,
        display.id,
        !enabled,
      );
      setEnabled(result.display.enabled);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Unable to update display.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setShowArchiveDialog(true);
  }

  async function confirmArchive() {
    setBusy(true);
    setError(null);
    try {
      await localArchiveDeveloperDisplay(projectSlug, display.id);
      setShowArchiveDialog(false);
      router.refresh();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Unable to archive display.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setShowDeleteDialog(true);
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await localDeleteDeveloperDisplay(projectSlug, display.id);
      setShowDeleteDialog(false);
      router.push(`/projects/${projectSlug}/developer-tools/displays`);
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete display.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyUrl() {
    try {
      const url =
        typeof window !== "undefined"
          ? buildProjectDisplayOutputPath(projectId, display.slug, {
              origin: window.location.origin,
            })
          : outputPath;
      await navigator.clipboard.writeText(url);
    } catch {
      setError("Unable to copy display URL.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={handleCopyUrl}>
        Copy Local URL
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy || !enabled}
        onClick={() =>
          window.open(
            typeof window !== "undefined"
              ? buildProjectDisplayPreviewPath(projectId, display.slug, {
                  origin: window.location.origin,
                })
              : previewPath,
            "_blank",
            "noopener,noreferrer",
          )
        }
      >
        View Fullscreen
      </Button>
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleDuplicate()}>
        Duplicate
      </Button>
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleToggleEnabled()}>
        {enabled ? "Disable" : "Enable"}
      </Button>
      {!display.archived ? (
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleArchive()}>
          Archive
        </Button>
      ) : null}
      {display.sourceType === "project-html" ? (
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleDelete()}>
          Delete
        </Button>
      ) : null}
      {error ? <p className="w-full text-sm text-red-400">{error}</p> : null}
      {showDuplicateDialog ? (
        <DuplicateDisplayModal
          defaultName={`${display.name} Copy`}
          onCancel={() => setShowDuplicateDialog(false)}
          onConfirm={confirmDuplicate}
        />
      ) : null}
      {showArchiveDialog ? (
        <ConfirmDialog
          title="Archive Display?"
          description={`Archive "${display.name}"? It will stop serving viewer routes.`}
          confirmLabel="Archive Display"
          onCancel={() => setShowArchiveDialog(false)}
          onConfirm={confirmArchive}
        />
      ) : null}
      {showDeleteDialog ? (
        <ConfirmDialog
          title="Delete Display?"
          description={`Permanently delete "${display.name}"? This cannot be undone. Source revisions may remain on disk.`}
          confirmLabel="Delete Display"
          confirmVariant="destructive"
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
