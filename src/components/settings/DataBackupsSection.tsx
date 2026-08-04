"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SupabaseImportWizard } from "@/components/settings/SupabaseImportWizard";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createLocalBackup } from "@/lib/local/import-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { isDesktopEnvironment } from "@/lib/desktop/client";

export function DataBackupsSection() {
  const router = useRouter();
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
          Manage local project data stored on this computer.
        </p>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Import from Supabase</h3>
            <SupabaseImportWizard
              onComplete={() => {
                router.refresh();
              }}
            />
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">Back Up Projects</h3>
            <p className="text-sm text-muted">
              Create a snapshot of the local SQLite database before making major changes.
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
              {backingUp ? "Creating backup..." : "Back Up Projects"}
            </Button>
            {backupPath ? (
              <Alert variant="success">Backup saved to {backupPath}</Alert>
            ) : null}
            {backupError ? <Alert variant="error">{backupError}</Alert> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
