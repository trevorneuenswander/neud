"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";
import {
  localDownloadProjectPackage,
  localRemoveProjectPackage,
  localUpdateProjectPackage,
} from "@/lib/local/api";
import type { ProjectListItem, ProjectPackageCardState } from "@/lib/projects/types";

function packageStateLabel(state: ProjectPackageCardState | undefined): string {
  switch (state) {
    case "not_downloaded":
      return "Not Downloaded";
    case "downloaded":
      return "Downloaded";
    case "update_available":
      return "Update Available";
    case "downloading":
      return "Downloading";
    case "updating":
      return "Updating";
    case "error":
      return "Error";
    default:
      return "Downloaded";
  }
}

type ProjectPackageActionsProps = {
  project: ProjectListItem;
  viewerMode?: boolean;
  onChanged?: () => void;
};

export function ProjectPackageActions({
  project,
  onChanged,
}: ProjectPackageActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const state = project.packageState ?? "downloaded";
  const isInstalled =
    state === "downloaded" || state === "update_available" || state === "error";
  const versionLabel =
    project.installedVersion != null
      ? `v${project.installedVersion}`
      : project.availableVersion != null
        ? `v${project.availableVersion}`
        : null;

  const statusText = [
    packageStateLabel(state),
    versionLabel,
    state === "update_available" && project.availableVersion != null
      ? `→ v${project.availableVersion}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .replace(" · → ", " → ");

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      await localDownloadProjectPackage(project.slug);
      onChanged?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate() {
    setBusy(true);
    setError(null);
    try {
      await localUpdateProjectPackage(project.slug);
      onChanged?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUninstall() {
    setBusy(true);
    setError(null);
    try {
      await localRemoveProjectPackage(project.slug);
      setConfirmUninstall(false);
      onChanged?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uninstall failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col items-start gap-2 text-left"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-start gap-2">
        {state === "not_downloaded" || state === "error" ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void handleDownload()}
          >
            {busy ? "Downloading…" : "Download"}
          </Button>
        ) : null}
        {isInstalled ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => setConfirmUninstall(true)}
          >
            Uninstall
          </Button>
        ) : null}
        <span className="text-xs text-muted">{statusText}</span>
        {state === "update_available" ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void handleUpdate()}
          >
            {busy ? "Updating…" : "Update"}
          </Button>
        ) : null}
      </div>
      {error || project.packageLastError ? (
        <p className="max-w-xs text-left text-xs text-destructive">
          {error ?? project.packageLastError}
        </p>
      ) : null}

      {confirmUninstall ? (
        <NeudModal
          title={`Uninstall ${project.name}?`}
          description="This removes the downloaded project package from this computer. Your project access and saved project data will not be deleted."
          onClose={() => {
            if (busy) return;
            setConfirmUninstall(false);
          }}
          footer={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmUninstall(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => void handleUninstall()}
              >
                {busy ? "Uninstalling…" : "Uninstall"}
              </Button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}
