"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { localDownloadProjectPackage } from "@/lib/local/api";

type ProjectNotInstalledPanelProps = {
  slug: string;
  name?: string | null;
};

export function ProjectNotInstalledPanel({
  slug,
  name,
}: ProjectNotInstalledPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      await localDownloadProjectPackage(slug);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-lg border border-border bg-surface-raised p-8">
      <h1 className="text-xl font-semibold text-foreground">
        {name?.trim() || "Project"} is not downloaded
      </h1>
      <p className="text-sm text-muted">
        This project is available to your account but is not installed on this NEUD
        instance. Download the project package to open it.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void handleDownload()}>
          {busy ? "Downloading…" : "Download Project"}
        </Button>
        <Button href="/projects" variant="secondary">
          Back to Projects
        </Button>
      </div>
      <p className="text-xs text-muted">
        Or open the{" "}
        <Link href="/projects" className="underline hover:text-foreground">
          Projects
        </Link>{" "}
        page to manage downloads.
      </p>
    </div>
  );
}
