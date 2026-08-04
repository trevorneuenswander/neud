"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeEditorPanel } from "@/components/developer-tools/CodeEditorPanel";
import { PublishRevisionDialog } from "@/components/developer-tools/PublishRevisionDialog";
import {
  localPublishDisplayDraft,
  localSaveDisplayDraft,
  localValidateDisplayDraft,
} from "@/lib/local/developer-tools-api";
import { buildDisplayPreviewDocument } from "@/lib/developer-tools/display-document";
import type { ValidationResult } from "@/lib/developer-tools/types";

type DisplayCodeEditorProps = {
  projectSlug: string;
  projectId?: string;
  displayId: string;
  displaySlug?: string;
  displayName: string;
  initialTab?: EditorTab;
  initial: {
    html: string;
    css: string;
    javascript: string;
    publishedRevisionId: string | null;
  };
};

type EditorTab = "html" | "css" | "javascript" | "preview";

export function DisplayCodeEditor({
  projectSlug,
  projectId,
  displayId,
  displaySlug,
  displayName,
  initialTab = "html",
  initial,
}: DisplayCodeEditorProps) {
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [html, setHtml] = useState(initial.html);
  const [css, setCss] = useState(initial.css);
  const [javascript, setJavascript] = useState(initial.javascript);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [status, setStatus] = useState("Published");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  const previewDataUrl =
    projectId && displaySlug
      ? `/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(displaySlug)}/data?preview=1`
      : undefined;

  const previewDocument = buildDisplayPreviewDocument({
    html,
    css,
    javascript,
    title: displayName,
    dataUrl: previewDataUrl,
    displayInfo:
      projectId && displaySlug
        ? { projectId, displayId, slug: displaySlug, name: displayName }
        : undefined,
  });

  const saveDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await localSaveDisplayDraft(projectSlug, displayId, {
        baseRevisionId: initial.publishedRevisionId,
        html,
        css,
        javascript,
      });
      setStatus("Draft Saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save draft.");
    } finally {
      setBusy(false);
    }
  }, [css, displayId, html, initial.publishedRevisionId, javascript, projectSlug]);

  const validateDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await localValidateDisplayDraft(projectSlug, displayId, {
        html,
        css,
        javascript,
      });
      setValidation(result.validation);
      setStatus(result.validation.ok ? "Validated" : "Validation Failed");
    } catch (validateError) {
      setError(
        validateError instanceof Error ? validateError.message : "Unable to validate draft.",
      );
    } finally {
      setBusy(false);
    }
  }, [css, displayId, html, javascript, projectSlug]);

  const publishDraft = useCallback(
    async (input: { revisionName: string; changeNote: string }) => {
      setBusy(true);
      setError(null);
      try {
        const validationResult = await localValidateDisplayDraft(projectSlug, displayId, {
          html,
          css,
          javascript,
        });
        if (!validationResult.validation.ok) {
          setValidation(validationResult.validation);
          setStatus("Validation Failed");
          setShowPublishDialog(false);
          return;
        }
        await localPublishDisplayDraft(projectSlug, displayId, {
          html,
          css,
          javascript,
          revisionName: input.revisionName || undefined,
          changeNote: input.changeNote || undefined,
        });
        setStatus("Published");
        setShowPublishDialog(false);
      } catch (publishError) {
        setError(
          publishError instanceof Error ? publishError.message : "Unable to publish display.",
        );
        throw publishError;
      } finally {
        setBusy(false);
      }
    },
    [css, displayId, html, javascript, projectSlug],
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {(["html", "css", "javascript", "preview"] as const).map((entry) => (
            <Button
              key={entry}
              type="button"
              size="sm"
              variant={tab === entry ? "primary" : "secondary"}
              onClick={() => setTab(entry)}
            >
              {entry === "preview" ? "Preview" : entry.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>Status: {status}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
            Save Draft
          </Button>
          <Button type="button" disabled={busy} onClick={() => void validateDraft()}>
            Validate
          </Button>
          <Button type="button" disabled={busy} onClick={() => setShowPublishDialog(true)}>
            Publish
          </Button>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </Card>

      {tab === "preview" ? (
        <iframe
          title={`${displayName} preview`}
          srcDoc={previewDocument}
          className="h-[520px] w-full rounded-md border border-border bg-white"
        />
      ) : tab === "html" ? (
        <CodeEditorPanel value={html} onChange={setHtml} minHeight={520} />
      ) : tab === "css" ? (
        <CodeEditorPanel value={css} onChange={setCss} minHeight={520} />
      ) : (
        <CodeEditorPanel value={javascript} onChange={setJavascript} minHeight={520} />
      )}

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
          title="Publish Display Revision"
          description="Publishing creates an immutable HTML/CSS/JS revision without changing the display URL or slug."
          confirmLabel="Publish"
          onCancel={() => setShowPublishDialog(false)}
          onConfirm={publishDraft}
        />
      ) : null}
    </div>
  );
}
