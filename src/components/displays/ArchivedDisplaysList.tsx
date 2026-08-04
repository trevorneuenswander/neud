"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PermanentDeleteDisplayDialog } from "@/components/displays/PermanentDeleteDisplayDialog";
import {
  localUnarchiveDisplay,
  type ArchivedDisplaySummary,
} from "@/lib/local/displays-api";
import { localDeleteDisplay } from "@/lib/local/displays-api";
import { formatDisplayRefreshRateLabel } from "@/lib/displays/refresh-rate";
import { formatDisplaySizeLabel } from "@/lib/displays/display-size";

type ArchivedDisplaysListProps = {
  projectSlug: string;
  initialArchived: ArchivedDisplaySummary[];
};

function formatArchivedTimestamp(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ArchivedDisplaysList({
  projectSlug,
  initialArchived,
}: ArchivedDisplaysListProps) {
  const router = useRouter();
  const [archived, setArchived] = useState(initialArchived);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisplay, setConfirmDisplay] = useState<ArchivedDisplaySummary | null>(null);
  const [deleteDisplayTarget, setDeleteDisplayTarget] = useState<ArchivedDisplaySummary | null>(
    null,
  );

  useEffect(() => {
    setArchived(initialArchived);
  }, [initialArchived]);

  async function handleUnarchive(display: ArchivedDisplaySummary) {
    setBusyId(display.id);
    setError(null);
    try {
      await localUnarchiveDisplay(projectSlug, display.id);
      setArchived((current) => current.filter((entry) => entry.id !== display.id));
      setConfirmDisplay(null);
      router.refresh();
    } catch (unarchiveError) {
      setError(
        unarchiveError instanceof Error
          ? unarchiveError.message
          : "Unable to unarchive display.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(display: ArchivedDisplaySummary) {
    setBusyId(display.id);
    setError(null);
    try {
      await localDeleteDisplay(projectSlug, display.id);
      setArchived((current) => current.filter((entry) => entry.id !== display.id));
      setDeleteDisplayTarget(null);
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete display.",
      );
      throw deleteError;
    } finally {
      setBusyId(null);
    }
  }

  if (archived.length === 0) {
    return <p className="text-sm text-muted">No archived displays.</p>;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {archived.map((display) => (
        <Card key={display.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground">{display.name}</h4>
              {display.description ? (
                <p className="mt-1 text-xs text-muted">{display.description}</p>
              ) : null}
              <dl className="mt-2 space-y-1 text-xs text-muted">
                <div>
                  <dt className="inline">Archived: </dt>
                  <dd className="inline">{formatArchivedTimestamp(display.archivedAt)}</dd>
                </div>
                {display.archivedByUserId ? (
                  <div>
                    <dt className="inline">Archived by: </dt>
                    <dd className="inline">{display.archivedByUserId}</dd>
                  </div>
                ) : null}
                {display.activeVersionNumber ? (
                  <div>
                    <dt className="inline">HTML version: </dt>
                    <dd className="inline">v{display.activeVersionNumber}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="inline">Refresh rate: </dt>
                  <dd className="inline">
                    {formatDisplayRefreshRateLabel(display.refreshRateMs)}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Display size: </dt>
                  <dd className="inline">
                    {formatDisplaySizeLabel(display.displayWidth, display.displayHeight)}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyId === display.id}
                onClick={() => setConfirmDisplay(display)}
              >
                Unarchive
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busyId === display.id}
                onClick={() => setDeleteDisplayTarget(display)}
              >
                Delete
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {confirmDisplay ? (
        <ConfirmDialog
          title={`Unarchive "${confirmDisplay.name}"?`}
          description="It will return to the active Displays list in a Disabled state."
          confirmLabel="Unarchive"
          onCancel={() => setConfirmDisplay(null)}
          onConfirm={() => void handleUnarchive(confirmDisplay)}
        />
      ) : null}

      {deleteDisplayTarget ? (
        <PermanentDeleteDisplayDialog
          displayName={deleteDisplayTarget.name}
          archived
          onCancel={() => setDeleteDisplayTarget(null)}
          onConfirm={() => handleDelete(deleteDisplayTarget)}
        />
      ) : null}
    </div>
  );
}
