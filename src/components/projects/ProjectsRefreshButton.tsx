"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { localRefreshProjectDirectory } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type ProjectsRefreshButtonProps = {
  onRefreshed?: () => void;
};

export function ProjectsRefreshButton({ onRefreshed }: ProjectsRefreshButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!shouldUseLocalDataClient()) {
    return null;
  }

  async function handleRefresh() {
    setBusy(true);
    setError(null);
    try {
      await localRefreshProjectDirectory();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("neud:projects-directory-refreshed"));
      }
      onRefreshed?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh projects.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => void handleRefresh()}
      >
        {busy ? "Refreshing…" : "Refresh Projects"}
      </Button>
      {error ? <p className="max-w-xs text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
