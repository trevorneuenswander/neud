"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeEditorPanel } from "@/components/developer-tools/CodeEditorPanel";
import { PublishRevisionDialog } from "@/components/developer-tools/PublishRevisionDialog";
import {
  localPublishScraperDraft,
  localSaveScraperDraft,
  localValidateScraperDraft,
} from "@/lib/local/developer-tools-api";
import { formatRevisionShortId } from "@/lib/developer-tools/revision-labels";
import type { ProjectScraperSource, ValidationResult } from "@/lib/developer-tools/types";

type ScraperCodeEditorProps = {
  projectSlug: string;
  initialScraper: ProjectScraperSource;
  onPublished?: () => void;
};

export function ScraperCodeEditor({
  projectSlug,
  initialScraper,
  onPublished,
}: ScraperCodeEditorProps) {
  const [source, setSource] = useState(initialScraper.draftSource);
  const [baseRevisionId, setBaseRevisionId] = useState(
    initialScraper.draftRevisionId ?? initialScraper.publishedRevisionId,
  );
  const [draftSavedAt, setDraftSavedAt] = useState(initialScraper.draftSavedAt);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [status, setStatus] = useState<string>(
    initialScraper.isDirty ? "Unsaved Changes" : "Published",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  const isDirty = useMemo(
    () => source !== initialScraper.publishedSource,
    [initialScraper.publishedSource, source],
  );

  const saveDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await localSaveScraperDraft(projectSlug, {
        baseRevisionId,
        source,
      });
      setDraftSavedAt(result.scraper.draftSavedAt);
      setStatus("Draft Saved");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save draft.",
      );
    } finally {
      setBusy(false);
    }
  }, [baseRevisionId, projectSlug, source]);

  const validateDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await localValidateScraperDraft(projectSlug, source);
      setValidation(result.validation);
      setStatus(result.validation.ok ? "Validated" : "Validation Failed");
    } catch (validateError) {
      setError(
        validateError instanceof Error
          ? validateError.message
          : "Unable to validate draft.",
      );
    } finally {
      setBusy(false);
    }
  }, [projectSlug, source]);

  const publishDraft = useCallback(
    async (input: { revisionName: string; changeNote: string }) => {
      setBusy(true);
      setError(null);
      try {
        const validationResult = await localValidateScraperDraft(projectSlug, source);
        if (!validationResult.validation.ok) {
          setValidation(validationResult.validation);
          setStatus("Validation Failed");
          setShowPublishDialog(false);
          return;
        }
        const result = await localPublishScraperDraft(projectSlug, {
          source,
          revisionName: input.revisionName || undefined,
          changeNote: input.changeNote || undefined,
        });
        setBaseRevisionId(result.publishedRevisionId);
        setStatus("Published");
        setValidation(validationResult.validation);
        setShowPublishDialog(false);
        onPublished?.();
      } catch (publishError) {
        setStatus("Restart Failed");
        setError(
          publishError instanceof Error
            ? publishError.message
            : "Unable to publish scraper code.",
        );
        throw publishError;
      } finally {
        setBusy(false);
      }
    },
    [onPublished, projectSlug, source],
  );

  const revertDraft = useCallback(() => {
    setSource(initialScraper.publishedSource);
    setStatus("Published");
    setValidation(null);
  }, [initialScraper.publishedSource]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Status: {status}</span>
          {isDirty ? <span>Unsaved Changes</span> : null}
          {draftSavedAt ? (
            <span>Draft saved {new Date(draftSavedAt).toLocaleString()}</span>
          ) : null}
          {initialScraper.publishedRevisionId ? (
            <span>
              Active revision {formatRevisionShortId(initialScraper.publishedRevisionId)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
            Save Draft
          </Button>
          <Button type="button" disabled={busy} onClick={() => void validateDraft()}>
            Validate
          </Button>
          <Button type="button" disabled={busy} onClick={() => setShowPublishDialog(true)}>
            Publish and Restart
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={revertDraft}>
            Revert
          </Button>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </Card>

      <CodeEditorPanel value={source} onChange={setSource} minHeight={520} />

      {validation ? (
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Validation Output</h3>
          {validation.issues.length === 0 ? (
            <p className="text-sm text-emerald-400">No issues found.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {validation.issues.map((issue, index) => (
                <li
                  key={`${issue.message}-${index}`}
                  className={issue.severity === "error" ? "text-red-400" : "text-amber-300"}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {showPublishDialog ? (
        <PublishRevisionDialog
          title="Publish Scraper Revision"
          description="Publishing validates the draft, creates an immutable revision, and restarts this project's Webpage Scraper."
          confirmLabel="Publish and Restart"
          onCancel={() => setShowPublishDialog(false)}
          onConfirm={publishDraft}
        />
      ) : null}
    </div>
  );
}
