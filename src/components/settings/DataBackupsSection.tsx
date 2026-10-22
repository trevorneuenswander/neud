"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createLocalBackup } from "@/lib/local/import-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { isDesktopEnvironment } from "@/lib/desktop/client";

export function DataBackupsSection() {
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const desktopLocalMode =
    isDesktopEnvironment() && shouldUseLocalDataClient();

  if (!desktopLocalMode) {
    return null;
  }

  async function handleBackup() {
    setBackingUp(true);
    setBackupError(null);
    setBackupPath(null);

    try {
      const result = await createLocalBackup();
      setBackupPath(result.backupPath);
    } catch (error) {
      setBackupError(
        error instanceof Error ? error.message : "Unable to create a local backup.",
      );
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-foreground">Data &amp; Backups</h2>
        <p className="mt-2 text-sm text-muted">
          Manage and back up data stored locally on this computer.
        </p>

        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Back Up Local Data</h3>
          <p className="text-sm text-muted">
            Create a snapshot of NEUD&apos;s local database before making major changes.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={backingUp}
            onClick={() => {
              void handleBackup();
            }}
          >
            {backingUp ? "Creating backup..." : "Back Up Local Data"}
          </Button>
          {backupPath ? (
            <Alert variant="success">Backup saved to {backupPath}</Alert>
          ) : null}
          {backupError ? <Alert variant="error">{backupError}</Alert> : null}
        </div>
      </Card>
    </div>
  );
}
