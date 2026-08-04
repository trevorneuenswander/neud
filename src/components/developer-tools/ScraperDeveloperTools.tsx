"use client";

import { useCallback, useState } from "react";
import { ScraperCodeEditor } from "@/components/developer-tools/ScraperCodeEditor";
import { ScraperRevisionsPanel } from "@/components/developer-tools/CodeRevisionsPanel";
import { DeveloperToolsDropdown } from "@/components/ui/DeveloperToolsDropdown";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { localGetScraperSource } from "@/lib/local/developer-tools-api";
import type { ProjectScraperSource } from "@/lib/developer-tools/types";

type ScraperDeveloperToolsProps = {
  projectSlug: string;
};

type PanelView = "editor" | "revisions" | "restore" | null;

export function ScraperDeveloperTools({ projectSlug }: ScraperDeveloperToolsProps) {
  const [panel, setPanel] = useState<PanelView>(null);
  const [scraper, setScraper] = useState<ProjectScraperSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadScraper = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await localGetScraperSource(projectSlug);
      setScraper(result.scraper);
    } catch (loadError) {
      setScraper(null);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load scraper source.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  async function openPanel(view: PanelView) {
    setPanel(view);
    if (view === "editor") {
      await loadScraper();
    }
  }

  const panelTitle =
    panel === "editor"
      ? "View / Edit Scraper Code"
      : panel === "revisions"
        ? "Code Revisions"
        : panel === "restore"
          ? "Restore Published Version"
          : "";

  return (
    <>
      <DeveloperToolsDropdown
        items={[
          {
            id: "view-edit",
            label: "View / Edit Scraper Code",
            onSelect: () => void openPanel("editor"),
          },
          {
            id: "revisions",
            label: "Code Revisions",
            onSelect: () => setPanel("revisions"),
          },
          {
            id: "restore",
            label: "Restore Published Version",
            onSelect: () => setPanel("restore"),
          },
        ]}
      />

      <SlideOverPanel
        title={panelTitle}
        subtitle="Webpage Scraper developer tools"
        open={panel !== null}
        onClose={() => setPanel(null)}
      >
        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
        {panel === "editor" && scraper ? (
          <ScraperCodeEditor projectSlug={projectSlug} initialScraper={scraper} />
        ) : null}
        {panel === "revisions" ? (
          <ScraperRevisionsPanel projectSlug={projectSlug} />
        ) : null}
        {panel === "restore" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Select a prior revision below, review it, then restore. Restoring creates a
              new revision, validates the source, publishes it, and restarts this
              project&apos;s scraper.
            </p>
            <ScraperRevisionsPanel projectSlug={projectSlug} />
          </div>
        ) : null}
        {panel === "editor" && loading ? (
          <p className="text-sm text-muted">Loading scraper source…</p>
        ) : null}
      </SlideOverPanel>
    </>
  );
}
