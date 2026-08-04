"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PublishRevisionDialog } from "@/components/developer-tools/PublishRevisionDialog";
import {
  localRestoreDisplayRevision,
  localRestoreScraperRevision,
} from "@/lib/local/developer-tools-api";

type RestoreRevisionButtonProps = {
  projectSlug: string;
  resourceType: "scraper" | "display";
  resourceId: string;
  revisionId: string;
  revisionDisplayName: string;
  isActive: boolean;
};

export function RestoreRevisionButton({
  projectSlug,
  resourceType,
  resourceId,
  revisionId,
  revisionDisplayName,
  isActive,
}: RestoreRevisionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  if (isActive) {
    return null;
  }

  async function handleRestore(input: { revisionName: string; changeNote: string }) {
    setBusy(true);
    setError(null);
    try {
      if (resourceType === "scraper") {
        await localRestoreScraperRevision(projectSlug, revisionId, {
          revisionName: input.revisionName || `Restore: ${revisionDisplayName}`,
          changeNote: input.changeNote || undefined,
        });
      } else {
        await localRestoreDisplayRevision(projectSlug, resourceId, revisionId, {
          revisionName: input.revisionName || `Restore: ${revisionDisplayName}`,
          changeNote: input.changeNote || undefined,
        });
      }
      setShowDialog(false);
      router.refresh();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error ? restoreError.message : "Unable to restore revision.",
      );
      throw restoreError;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => setShowDialog(true)}
        >
          Restore
        </Button>
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </div>
      {showDialog ? (
        <PublishRevisionDialog
          title="Restore Revision"
          description={
            resourceType === "scraper"
              ? "Restoring creates a new revision, publishes it, and restarts this project's Webpage Scraper."
              : "Restoring creates a new revision and publishes it live without changing the display URL."
          }
          confirmLabel="Restore Revision"
          defaultRevisionName={`Restore: ${revisionDisplayName}`}
          onCancel={() => setShowDialog(false)}
          onConfirm={handleRestore}
        />
      ) : null}
    </>
  );
}
