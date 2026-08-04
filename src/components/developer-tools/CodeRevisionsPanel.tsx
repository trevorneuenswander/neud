"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RestoreRevisionButton } from "@/components/developer-tools/RestoreRevisionButton";
import {
  localGetScraperSource,
  localListDeveloperRevisions,
} from "@/lib/local/developer-tools-api";
import {
  buildRevisionVersionMap,
  formatRevisionDisplayName,
  formatRevisionShortId,
} from "@/lib/developer-tools/revision-labels";
import type { ProjectCodeRevision } from "@/lib/developer-tools/types";

type CodeRevisionsPanelProps = {
  projectSlug: string;
  resourceType: "scraper" | "display";
  resourceId: string;
  resourceLabel: string;
  selectedRevisionId?: string | null;
  onViewRevision?: (revision: ProjectCodeRevision) => void;
  onRevisionsLoaded?: (revisions: ProjectCodeRevision[]) => void;
  refreshToken?: number;
};

export function CodeRevisionsPanel({
  projectSlug,
  resourceType,
  resourceId,
  resourceLabel,
  selectedRevisionId = null,
  onViewRevision,
  onRevisionsLoaded,
  refreshToken = 0,
}: CodeRevisionsPanelProps) {
  const [revisions, setRevisions] = useState<ProjectCodeRevision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRevisions() {
      setLoading(true);
      setError(null);
      try {
        const result = await localListDeveloperRevisions(projectSlug, {
          resourceType,
          resourceId,
        });
        if (!cancelled) {
          setRevisions(result.revisions);
          onRevisionsLoaded?.(result.revisions);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRevisions([]);
          onRevisionsLoaded?.([]);
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load revisions.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRevisions();
    return () => {
      cancelled = true;
    };
  }, [onRevisionsLoaded, projectSlug, refreshToken, resourceId, resourceType]);

  const revisionVersionMap = useMemo(
    () => buildRevisionVersionMap(revisions),
    [revisions],
  );

  if (loading) {
    return <p className="text-sm text-muted">Loading revision history…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (revisions.length === 0) {
    return (
      <p className="text-sm text-muted">
        No revisions recorded for {resourceLabel} yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {revisions.map((revision) => {
        const versionNumber = revisionVersionMap.get(revision.id) ?? 1;
        const displayName = formatRevisionDisplayName({
          ...revision,
          versionNumber,
        });
        const isSelected = selectedRevisionId === revision.id;
        return (
          <Card key={revision.id} className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-foreground">{displayName}</span>
              <code className="text-xs text-muted">{formatRevisionShortId(revision.id)}</code>
              <span>{revision.validationStatus}</span>
              {revision.isActive ? (
                <span className="text-emerald-400">Active</span>
              ) : null}
              {isSelected && !revision.isActive ? (
                <span className="text-primary">Viewing</span>
              ) : null}
              {onViewRevision ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onViewRevision(revision)}
                >
                  {revision.isActive ? "Edit Current Version" : "View"}
                </Button>
              ) : null}
              <RestoreRevisionButton
                projectSlug={projectSlug}
                resourceType={resourceType}
                resourceId={resourceId}
                revisionId={revision.id}
                revisionDisplayName={displayName}
                isActive={Boolean(revision.isActive)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(revision.id)}
              >
                Copy Revision ID
              </Button>
            </div>
            {revision.changeNote ? (
              <p className="text-muted-foreground">{revision.changeNote}</p>
            ) : revision.message && revision.message !== displayName ? (
              <p className="text-muted-foreground">{revision.message}</p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

type ScraperRevisionsPanelProps = {
  projectSlug: string;
};

export function ScraperRevisionsPanel({ projectSlug }: ScraperRevisionsPanelProps) {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void localGetScraperSource(projectSlug)
      .then(({ scraper }) => {
        if (!cancelled) {
          setProjectId(scraper.projectId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectSlug]);

  if (!projectId) {
    return <p className="text-sm text-muted">Loading scraper revisions…</p>;
  }

  return (
    <CodeRevisionsPanel
      projectSlug={projectSlug}
      resourceType="scraper"
      resourceId={projectId}
      resourceLabel="this scraper"
    />
  );
}
