"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import {
  executeSupabaseImport,
  previewSupabaseImport,
  type ImportPreviewProject,
  type ImportPreviewResponse,
  type ImportExecuteResponse,
  type ImportProjectAction,
} from "@/lib/local/import-api";

type WizardStep = "intro" | "preview" | "confirm" | "results";

type SupabaseImportWizardProps = {
  onComplete?: () => void;
};

const ACTION_LABELS: Record<ImportProjectAction, string> = {
  create: "Import",
  skip: "Skip",
  copy: "Import as Copy",
};

export function SupabaseImportWizard({ onComplete }: SupabaseImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("intro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [selections, setSelections] = useState<
    Record<string, ImportProjectAction>
  >({});
  const [result, setResult] = useState<ImportExecuteResponse | null>(null);

  const selectedProjects = useMemo(() => {
    if (!preview) return [];

    return preview.projects.map((project) => ({
      ...project,
      action: selections[project.sourceProjectId] ?? project.recommendedAction,
    }));
  }, [preview, selections]);

  const confirmationCounts = useMemo(() => {
    const counts = {
      import: 0,
      copy: 0,
      skip: 0,
      engines: 0,
      scraperSources: 0,
      snapshots: 0,
    };

    for (const project of selectedProjects) {
      if (project.action === "create") {
        counts.import += 1;
        counts.engines += project.engineCount;
        counts.scraperSources += project.scraperSourceCount;
        counts.snapshots += project.snapshotCount;
      } else if (project.action === "copy") {
        counts.copy += 1;
        counts.engines += project.engineCount;
        counts.scraperSources += project.scraperSourceCount;
        counts.snapshots += project.snapshotCount;
      } else {
        counts.skip += 1;
      }
    }

    return counts;
  }, [selectedProjects]);

  async function handleScan() {
    setLoading(true);
    setError(null);

    try {
      const nextPreview = await previewSupabaseImport();
      setPreview(nextPreview);
      setSelections(
        Object.fromEntries(
          nextPreview.projects.map((project) => [
            project.sourceProjectId,
            project.recommendedAction,
          ]),
        ),
      );
      setStep("preview");
    } catch (scanError) {
      setError(formatScanError(scanError));
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) return;

    setLoading(true);
    setError(null);

    try {
      const response = await executeSupabaseImport(
        selectedProjects.map((project) => ({
          sourceProjectId: project.sourceProjectId,
          action: project.action,
        })),
      );
      setResult(response);
      setStep("results");
      if (response.ok) {
        onComplete?.();
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import cloud projects.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (step === "intro") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Import cloud projects to this computer
        </p>
        <p className="text-sm text-muted">
          This copies your existing NEUD projects from Supabase
          into the local desktop database.
        </p>
        <p className="text-sm text-muted">
          Your cloud data will not be deleted or modified.
        </p>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={() => {
            void handleScan();
          }}
        >
          {loading ? "Scanning..." : "Scan Cloud Projects"}
        </Button>
      </div>
    );
  }

  if (step === "preview" && preview) {
    return (
      <div className="space-y-4">
        {preview.validation.errors.length > 0 ? (
          <Alert variant="error">
            {preview.validation.errors[0]?.message ??
              "Cloud data could not be imported."}
          </Alert>
        ) : null}

        {preview.validation.warnings.map((warning) => (
          <Alert key={`${warning.path}-${warning.message}`} variant="info">
            {warning.message}
          </Alert>
        ))}

        {preview.totals.projects === 0 ? (
          <Alert variant="info">No cloud projects were found for your account.</Alert>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>Project</DataTableHeaderCell>
              <DataTableHeaderCell>Engines</DataTableHeaderCell>
              <DataTableHeaderCell>Data Sources</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Action</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {preview.projects.map((project) => (
                <PreviewProjectRow
                  key={project.sourceProjectId}
                  project={project}
                  value={
                    selections[project.sourceProjectId] ?? project.recommendedAction
                  }
                  onChange={(action) => {
                    setSelections((current) => ({
                      ...current,
                      [project.sourceProjectId]: action,
                    }));
                  }}
                />
              ))}
            </DataTableBody>
          </DataTable>
        )}

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setStep("intro")}>
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!preview.validation.valid || preview.totals.projects === 0}
            onClick={() => setStep("confirm")}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  if (step === "confirm" && preview) {
    return (
      <div className="space-y-4">
        <div className="space-y-2 text-sm text-muted">
          <p>{confirmationCounts.import} project(s) to import</p>
          <p>{confirmationCounts.copy} project(s) to copy</p>
          <p>{confirmationCounts.skip} project(s) to skip</p>
          <p>{confirmationCounts.engines} engine(s)</p>
          <p>{confirmationCounts.scraperSources} data source(s)</p>
          <p>{confirmationCounts.snapshots} snapshot(s)</p>
        </div>
        <Alert variant="info">
          A local database backup will be created. Cloud data will remain unchanged.
          Existing local projects will not be overwritten.
        </Alert>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setStep("preview")}>
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || confirmationCounts.import + confirmationCounts.copy === 0}
            onClick={() => {
              void handleImport();
            }}
          >
            {loading ? "Importing..." : "Import Projects"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "results" && result) {
    return (
      <div className="space-y-4">
        {result.ok ? (
          <Alert variant="success">Import completed successfully.</Alert>
        ) : (
          <Alert variant="error">
            {result.errors[0]?.message ?? "Import failed and was rolled back."}
          </Alert>
        )}

        <div className="space-y-2 text-sm text-muted">
          <p>{result.importedProjects} project(s) imported</p>
          <p>{result.copiedProjects} project(s) copied</p>
          <p>{result.skippedProjects} project(s) skipped</p>
          <p>{result.importedEngines} engine(s) imported</p>
          <p>{result.importedScraperSources} data source(s) imported</p>
          <p>{result.importedSnapshots} snapshot(s) imported</p>
          {result.backupPath ? <p>Backup: {result.backupPath}</p> : null}
        </div>

        {result.warnings.map((warning) => (
          <Alert key={`${warning.path}-${warning.message}`} variant="info">
            {warning.message}
          </Alert>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setStep("intro")}>
            Import More
          </Button>
          <Button type="button" size="sm" href="/projects">
            View Projects
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

function PreviewProjectRow({
  project,
  value,
  onChange,
}: {
  project: ImportPreviewProject;
  value: ImportProjectAction;
  onChange: (action: ImportProjectAction) => void;
}) {
  return (
    <DataTableRow>
      <DataTableCell>
        <div className="font-medium text-foreground">{project.name}</div>
        <div className="text-xs text-muted">{project.slug}</div>
        {project.messages.map((message) => (
          <div key={message} className="mt-1 text-xs text-muted">
            {message}
          </div>
        ))}
      </DataTableCell>
      <DataTableCell>{project.engineCount}</DataTableCell>
      <DataTableCell>{project.scraperSourceCount}</DataTableCell>
      <DataTableCell>{formatStatus(project.status)}</DataTableCell>
      <DataTableCell>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
          value={value}
          onChange={(event) => {
            onChange(event.target.value as ImportProjectAction);
          }}
          disabled={project.allowedActions.length <= 1}
        >
          {project.allowedActions.map((action) => (
            <option key={action} value={action}>
              {ACTION_LABELS[action]}
            </option>
          ))}
        </select>
      </DataTableCell>
    </DataTableRow>
  );
}

function formatStatus(status: string): string {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatScanError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to scan cloud projects.";
  }

  const message = error.message.toLowerCase();
  if (message.includes("sign in")) {
    return "Sign in to your account before scanning cloud projects.";
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "Unable to reach Supabase. Check your internet connection and try again.";
  }

  return error.message;
}
