"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/portal/PageHeader";
import { ScraperCodeEditor } from "@/components/developer-tools/ScraperCodeEditor";
import { ScraperRevisionsPanel } from "@/components/developer-tools/CodeRevisionsPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { localGetScraperSource } from "@/lib/local/developer-tools-api";
import {
  localGetScraperDeveloperContext,
  type ScraperDeveloperContext,
  type ScraperRuntimeSourceFile,
} from "@/lib/local/developer-tools-api";
import type { ProjectScraperSource } from "@/lib/developer-tools/types";
import { formatRevisionShortId } from "@/lib/developer-tools/revision-labels";

type ScraperDeveloperDetailsClientProps = {
  projectSlug: string;
  projectName: string;
  engineId: string;
  engineName: string;
  engineStatusLabel: string;
};

type SourceView = "published" | "draft" | "runtime";

function MetadataField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const displayValue = value.trim() ? value : "—";
  const canCopy = value.trim().length > 0;

  async function handleCopy() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        <code className="break-all text-xs text-foreground">{displayValue}</code>
        {canCopy ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => void handleCopy()}>
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </dd>
    </div>
  );
}

function RuntimeFileTree({
  title,
  files,
  selectedPath,
  onSelect,
}: {
  title: string;
  files: ScraperRuntimeSourceFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="space-y-1 text-sm">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              className={`w-full rounded px-2 py-1 text-left ${
                selectedPath === file.path
                  ? "bg-primary/15 text-foreground"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
              onClick={() => onSelect(file.path)}
            >
              <span>{file.path}</span>
              {file.isRunning ? (
                <span className="ml-2 text-xs text-emerald-400">running</span>
              ) : null}
              {!file.editable ? (
                <span className="ml-2 text-xs text-muted">view-only</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScraperDeveloperDetailsClient({
  projectSlug,
  projectName,
  engineId,
  engineName,
  engineStatusLabel,
}: ScraperDeveloperDetailsClientProps) {
  const [scraper, setScraper] = useState<ProjectScraperSource | null>(null);
  const [context, setContext] = useState<ScraperDeveloperContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceView, setSourceView] = useState<SourceView>("runtime");
  const [selectedRuntimeFile, setSelectedRuntimeFile] = useState<string | null>(null);

  const operationalHref = `/projects/${projectSlug}/data-engines/${engineId}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourceResult, contextResult] = await Promise.all([
        localGetScraperSource(projectSlug),
        localGetScraperDeveloperContext(projectSlug, engineId),
      ]);
      setScraper(sourceResult.scraper);
      setContext(contextResult.context);
      const firstFile =
        contextResult.context.trustedRuntimeFiles.find((file) => file.isRunning)?.path ??
        contextResult.context.projectSourceFiles[0]?.path ??
        contextResult.context.trustedRuntimeFiles[0]?.path ??
        null;
      setSelectedRuntimeFile(firstFile);
    } catch (loadError) {
      setScraper(null);
      setContext(null);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load scraper source.",
      );
    } finally {
      setLoading(false);
    }
  }, [engineId, projectSlug]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const allRuntimeFiles = useMemo(
    () => [
      ...(context?.projectSourceFiles ?? []),
      ...(context?.trustedRuntimeFiles ?? []),
    ],
    [context],
  );

  const selectedRuntimeSource = useMemo(() => {
    if (!selectedRuntimeFile) return "";
    return allRuntimeFiles.find((file) => file.path === selectedRuntimeFile)?.source ?? "";
  }, [allRuntimeFiles, selectedRuntimeFile]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button href={operationalHref} size="sm" variant="secondary">
          Back to Webpage Scraper
        </Button>
        <PageHeader
          title="Developer Tools"
          description={`Webpage Scraper · ${projectName}`}
        />
        <p className="text-sm text-muted">
          {engineName} · {engineStatusLabel}
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Runtime Metadata</h3>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <MetadataField label="Project ID" value={context?.projectId ?? ""} />
          <MetadataField label="Engine ID" value={context?.engineId ?? engineId} />
          <MetadataField label="Worker ID" value={context?.workerId ?? ""} />
          <MetadataField label="Adapter" value={context?.adapter ?? ""} />
          <MetadataField
            label="Active Revision"
            value={
              context?.publishedRevisionId
                ? formatRevisionShortId(context.publishedRevisionId)
                : ""
            }
          />
          <MetadataField
            label="Draft Revision"
            value={
              context?.draftRevisionId
                ? formatRevisionShortId(context.draftRevisionId)
                : ""
            }
          />
          <MetadataField label="Latest Snapshot ID" value={context?.latestSnapshotId ?? ""} />
        </dl>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={sourceView === "runtime" ? "primary" : "secondary"}
            onClick={() => setSourceView("runtime")}
          >
            Effective Runtime Source
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sourceView === "published" ? "primary" : "secondary"}
            onClick={() => setSourceView("published")}
          >
            Published / Running Source
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sourceView === "draft" ? "primary" : "secondary"}
            onClick={() => setSourceView("draft")}
          >
            Draft Source
          </Button>
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {loading ? <p className="text-sm text-muted">Loading scraper source…</p> : null}

        {sourceView === "published" && scraper ? (
          <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-background p-4 text-xs text-foreground">
            {scraper.publishedSource}
          </pre>
        ) : null}

        {sourceView === "draft" && scraper ? (
          <ScraperCodeEditor
            projectSlug={projectSlug}
            initialScraper={scraper}
            onPublished={() => void loadAll()}
          />
        ) : null}

        {sourceView === "runtime" && context ? (
          <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="space-y-4 rounded-md border border-border bg-surface-raised p-3">
              <RuntimeFileTree
                title="Project Scraper Source"
                files={context.projectSourceFiles}
                selectedPath={selectedRuntimeFile}
                onSelect={setSelectedRuntimeFile}
              />
              <RuntimeFileTree
                title="Trusted NEUD Runtime"
                files={context.trustedRuntimeFiles}
                selectedPath={selectedRuntimeFile}
                onSelect={setSelectedRuntimeFile}
              />
            </div>
            <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-background p-4 text-xs text-foreground">
              {selectedRuntimeSource || "No runtime source available."}
            </pre>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Code Revisions</h3>
        <p className="text-sm text-muted">
          Restoring a revision creates a new revision, validates the source, publishes it,
          and restarts this project&apos;s scraper. If startup fails, NEUD rolls back to the
          prior published revision automatically.
        </p>
        <ScraperRevisionsPanel projectSlug={projectSlug} />
      </Card>
    </div>
  );
}
