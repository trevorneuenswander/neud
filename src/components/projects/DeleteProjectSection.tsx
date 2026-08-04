"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { localDeleteProject } from "@/lib/local/bag-scraper-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type DeleteProjectSectionProps = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  layout?: "default" | "danger-zone";
  onDeleted?: () => void;
  onCancel?: () => void;
};

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 00-.584.786 18.23 18.23 0 002.663.761c.976.186 1.966.284 2.96.284.993 0 1.983-.098 2.96-.284A18.365 18.365 0 0015.75 5.25a.75.75 0 00-.584-.786 41.145 41.145 0 00-2.365-.298V3.75A2.75 2.75 0 0011.25 1h-2.5zM4.5 4.653v.043a.75.75 0 00.583.786l.018.004a17.902 17.902 0 002.663.761 17.902 17.902 0 002.663-.761l.018-.004a.75.75 0 00.583-.786V4.653a44.646 44.646 0 00-3-.298V3.75a1.25 1.25 0 011.25-1.25h2.5A1.25 1.25 0 0112.25 3.75v.605a44.646 44.646 0 00-3 .298zM6.173 8.378a.75.75 0 011.03-.853l.447.224a8.45 8.45 0 004.7 0l.447-.224a.75.75 0 011.03.853l-.447.224a9.95 9.95 0 01-5.106 0l-.447-.224zM6.25 11.25a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function DeleteProjectSection({
  projectId,
  projectName,
  projectSlug,
  layout = "default",
  onDeleted,
  onCancel,
}: DeleteProjectSectionProps) {
  const router = useRouter();
  const [confirmationName, setConfirmationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const canDelete = confirmationName.trim() === projectName.trim();
  const isDangerZone = layout === "danger-zone";

  async function handleDelete() {
    if (!canDelete) return;
    setShowConfirmDialog(true);
  }

  async function confirmDelete() {
    if (!canDelete) return;

    if (!shouldUseLocalDataClient()) {
      setError("Project deletion is available in the desktop app.");
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const result = await localDeleteProject(projectId, confirmationName.trim());
      if (!result.ok) {
        setError(result.message ?? "Unable to delete project.");
        return;
      }

      router.push("/projects");
      router.refresh();
      onDeleted?.();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete project.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const content = (
    <>
      {!isDangerZone ? (
        <h3 className="text-sm font-semibold text-foreground">Delete project</h3>
      ) : (
        <h3 className="text-sm font-semibold text-danger">Delete Project</h3>
      )}
      <p className={`mt-2 text-sm ${isDangerZone ? "text-muted" : "text-muted"}`}>
        {isDangerZone
          ? "Permanently remove this project and all local runtime data."
          : `Delete "${projectName}"? This permanently removes the local project, its scraper configuration, displays, snapshots, live state, manual history, and local logs.`}
      </p>
      <div className="mt-4 space-y-3">
        <FormField
          id={`delete-project-${projectId}`}
          name="confirmationName"
          label="Type the project name to confirm"
          value={confirmationName}
          onChange={(event) => setConfirmationName(event.target.value)}
          placeholder={projectName}
          required={false}
        />
        <div className="flex flex-wrap gap-2">
          {onCancel ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            variant="danger"
            disabled={!canDelete || deleting}
            className="inline-flex items-center gap-2"
            onClick={() => void handleDelete()}
          >
            <TrashIcon />
            {deleting ? "Deleting…" : "Delete Project"}
          </Button>
        </div>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <input type="hidden" name="projectSlug" value={projectSlug} />
      {showConfirmDialog ? (
        <ConfirmDialog
          title="Delete Project?"
          description={`Delete "${projectName}" permanently? This cannot be undone.`}
          confirmLabel="Delete Project"
          confirmVariant="destructive"
          busyLabel="Deleting…"
          onCancel={() => setShowConfirmDialog(false)}
          onConfirm={async () => {
            setShowConfirmDialog(false);
            await confirmDelete();
          }}
        />
      ) : null}
    </>
  );

  if (isDangerZone) {
    return content;
  }

  return <Card>{content}</Card>;
}
