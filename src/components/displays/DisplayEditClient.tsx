"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeEditorPanel } from "@/components/developer-tools/CodeEditorPanel";
import { DisplayVersionList } from "@/components/developer-tools/DisplayVersionList";
import { OnlineViewerPanel } from "@/components/displays/OnlineViewerPanel";
import { PublishRevisionDialog } from "@/components/developer-tools/PublishRevisionDialog";
import { PageHeader } from "@/components/portal/PageHeader";
import { Alert } from "@/components/ui/Alert";
import {
  localGetDeveloperDisplay,
  localListDeveloperRevisions,
  localPublishDisplayDraft,
  localValidateDisplayDraft,
} from "@/lib/local/developer-tools-api";
import { localUpdateDisplayDetails } from "@/lib/local/displays-api";
import {
  formatRevisionDownloadTimestamp,
  resolveRevisionVersionNumber,
} from "@/lib/developer-tools/revision-labels";
import { LocalApiError } from "@/lib/local/errors";
import type { ProjectCodeRevision, ValidationResult } from "@/lib/developer-tools/types";

type DisplayEditClientProps = {
  projectSlug: string;
  projectName: string;
  displayId: string;
};

type DisplayLoadState = "loading" | "loaded" | "not-found" | "forbidden" | "error";

type EditorAccessState = "loading" | "editable" | "readonly-built-in";

const MAX_DISPLAY_DESCRIPTION_LENGTH = 500;
const MAX_DISPLAY_NAME_LENGTH = 120;

function sanitizeDownloadFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function resolveLoadState(error: unknown): DisplayLoadState {
  if (error instanceof LocalApiError) {
    if (error.status === 404) return "not-found";
    if (error.status === 403 || error.status === 401) return "forbidden";
  }
  return "error";
}

export function DisplayEditClient({
  projectSlug,
  projectName,
  displayId,
}: DisplayEditClientProps) {
  const router = useRouter();
  const displaysHref = `/projects/${projectSlug}/displays`;
  const [loadState, setLoadState] = useState<DisplayLoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayDescription, setDisplayDescription] = useState("");
  const [savedDisplayDescription, setSavedDisplayDescription] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [savedBaselineHtml, setSavedBaselineHtml] = useState("");
  const [draftCss, setDraftCss] = useState("");
  const [draftJavascript, setDraftJavascript] = useState("");
  const [savedBaselineCss, setSavedBaselineCss] = useState("");
  const [savedBaselineJavascript, setSavedBaselineJavascript] = useState("");
  const [displaySlug, setDisplaySlug] = useState("");
  const [publishedRevisionId, setPublishedRevisionId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"built-in" | "project-html">("project-html");
  const [editorAccess, setEditorAccess] = useState<EditorAccessState>("loading");
  const [revisions, setRevisions] = useState<ProjectCodeRevision[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [metadataStatus, setMetadataStatus] = useState<string | null>(null);
  const [revisionRefreshToken, setRevisionRefreshToken] = useState(0);

  const applyActiveWorkingCopy = useCallback(
    (
      html: string,
      css: string,
      javascript: string,
      nextSourceType: "built-in" | "project-html",
    ) => {
      setDraftHtml(html);
      setSavedBaselineHtml(html);
      setDraftCss(css);
      setDraftJavascript(javascript);
      setSavedBaselineCss(css);
      setSavedBaselineJavascript(javascript);
      setEditorAccess(nextSourceType === "built-in" ? "readonly-built-in" : "editable");
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDisplay() {
      setLoadState("loading");
      setEditorAccess("loading");
      setError(null);
      try {
        const [displayResult, nextRevisions] = await Promise.all([
          localGetDeveloperDisplay(projectSlug, displayId),
          localListDeveloperRevisions(projectSlug, {
            resourceType: "display",
            resourceId: displayId,
          }),
        ]);
        if (cancelled) return;

        const display = displayResult.display;
        setSavedDisplayName(display.name);
        setDisplayName(display.name);
        setDisplayDescription(display.description ?? "");
        setSavedDisplayDescription(display.description ?? "");
        setDisplaySlug(display.slug);
        setPublishedRevisionId(display.publishedRevisionId);
        setSourceType(display.sourceType);
        setRevisions(nextRevisions.revisions);
        applyActiveWorkingCopy(
          display.html,
          display.css,
          display.javascript,
          display.sourceType,
        );
        setLoadState("loaded");
      } catch (loadError) {
        if (cancelled) return;
        setLoadState(resolveLoadState(loadError));
        setEditorAccess("readonly-built-in");
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load display.",
        );
      }
    }

    void loadDisplay();
    return () => {
      cancelled = true;
    };
  }, [applyActiveWorkingCopy, displayId, projectSlug]);

  const activeRevision = useMemo(
    () => revisions.find((revision) => revision.id === publishedRevisionId) ?? null,
    [publishedRevisionId, revisions],
  );

  const htmlChanged = draftHtml !== savedBaselineHtml;
  const metadataDirty =
    displayName.trim() !== savedDisplayName.trim() ||
    displayDescription.trim() !== savedDisplayDescription.trim();
  const isEditable = editorAccess === "editable";
  const nameEmpty = displayName.trim().length === 0;
  const nameTooLong = displayName.trim().length > MAX_DISPLAY_NAME_LENGTH;
  const descriptionTooLong = displayDescription.trim().length > MAX_DISPLAY_DESCRIPTION_LENGTH;

  useEffect(() => {
    if (!metadataDirty && !htmlChanged) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [htmlChanged, metadataDirty]);

  async function saveDisplayMetadata() {
    const trimmedName = displayName.trim();
    const trimmedDescription = displayDescription.trim();
    if (!trimmedName) {
      setMetadataStatus("Display name is required.");
      return;
    }
    if (trimmedName.length > MAX_DISPLAY_NAME_LENGTH) {
      setMetadataStatus(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (trimmedDescription.length > MAX_DISPLAY_DESCRIPTION_LENGTH) {
      setMetadataStatus(
        `Display description must be ${MAX_DISPLAY_DESCRIPTION_LENGTH} characters or fewer.`,
      );
      return;
    }

    setBusy(true);
    setMetadataStatus(null);
    setError(null);
    try {
      const result = await localUpdateDisplayDetails(projectSlug, displayId, {
        name: trimmedName,
        description: trimmedDescription,
      });
      setDisplayName(result.display.name);
      setSavedDisplayName(result.display.name);
      setDisplayDescription(result.display.description ?? "");
      setSavedDisplayDescription(result.display.description ?? "");
      setMetadataStatus("Display details saved.");
      router.refresh();
    } catch (saveError) {
      setMetadataStatus(
        saveError instanceof Error ? saveError.message : "Unable to save display details.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveAsNewVersion(input: { revisionName: string; changeNote: string }) {
    const trimmedDescription = input.revisionName.trim();
    if (!trimmedDescription) {
      setError("Version description is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const validationResult = await localValidateDisplayDraft(projectSlug, displayId, {
        html: draftHtml,
        css: draftCss,
        javascript: draftJavascript,
      });
      setValidation(validationResult.validation);
      if (!validationResult.validation.ok) {
        setShowPublishDialog(false);
        return;
      }

      const result = await localPublishDisplayDraft(projectSlug, displayId, {
        html: draftHtml,
        css: draftCss,
        javascript: draftJavascript,
        revisionName: trimmedDescription,
        changeNote: input.changeNote || undefined,
      });
      setPublishedRevisionId(result.display.publishedRevisionId);
      setSavedBaselineHtml(draftHtml);
      setSavedBaselineCss(draftCss);
      setSavedBaselineJavascript(draftJavascript);
      setShowPublishDialog(false);
      const nextRevisions = await localListDeveloperRevisions(projectSlug, {
        resourceType: "display",
        resourceId: displayId,
      });
      setRevisions(nextRevisions.revisions);
      setRevisionRefreshToken((current) => current + 1);
      router.refresh();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Unable to save new version.",
      );
      throw publishError;
    } finally {
      setBusy(false);
    }
  }

  function handleVersionActivated(input: {
    publishedRevisionId: string;
    html: string;
    css: string;
    javascript: string;
  }) {
    setPublishedRevisionId(input.publishedRevisionId);
    applyActiveWorkingCopy(input.html, input.css, input.javascript, sourceType);
    setRevisionRefreshToken((current) => current + 1);
    router.refresh();
  }

  function downloadHtml() {
    const versionNumber = activeRevision
      ? resolveRevisionVersionNumber(activeRevision)
      : null;
    const timestampSuffix = activeRevision
      ? formatRevisionDownloadTimestamp(activeRevision.createdAt)
      : "active";
    const versionSuffix = versionNumber ? `v${versionNumber}` : "draft";
    const filename = `${sanitizeDownloadFilename(savedDisplayName || "display")}-${versionSuffix}-${timestampSuffix}.html`;
    const blob = new Blob([draftHtml], { type: "text/html;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={savedDisplayName || "Edit Display"}
        description={projectName}
        action={
          <Button href={displaysHref} size="sm" variant="secondary">
            Back to Displays
          </Button>
        }
      />

      {loadState === "loading" ? (
        <p className="text-sm text-muted">Loading display…</p>
      ) : null}
      {loadState === "not-found" ? (
        <Alert variant="error">Display not found.</Alert>
      ) : null}
      {loadState === "forbidden" ? (
        <Alert variant="error">You do not have permission to edit this display.</Alert>
      ) : null}
      {loadState === "error" && error ? <Alert variant="error">{error}</Alert> : null}

      {loadState === "loaded" ? (
        <>
          <Card className="space-y-4 p-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Display Name</span>
              <input
                type="text"
                value={displayName}
                disabled={busy}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Description</span>
              <textarea
                value={displayDescription}
                disabled={busy}
                rows={3}
                className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onChange={(event) => setDisplayDescription(event.target.value)}
              />
              <span className="text-xs text-muted">
                {displayDescription.trim().length}/{MAX_DISPLAY_DESCRIPTION_LENGTH}
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || !metadataDirty || nameEmpty || nameTooLong || descriptionTooLong}
                onClick={() => void saveDisplayMetadata()}
              >
                Save Details
              </Button>
              {metadataStatus ? <span className="text-sm text-muted">{metadataStatus}</span> : null}
              {metadataDirty ? (
                <span className="text-sm text-amber-300">Unsaved display details</span>
              ) : null}
            </div>
          </Card>

          <OnlineViewerPanel
            projectSlug={projectSlug}
            displayId={displayId}
            displaySlug={displaySlug || displayId}
            canManage
          />

          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Raw HTML</h3>
              <Button type="button" size="sm" variant="secondary" onClick={downloadHtml}>
                Download HTML
              </Button>
            </div>
            {editorAccess === "readonly-built-in" ? (
              <p className="text-sm text-muted">
                Built-in displays are read-only here. Use Duplicate from the Displays page to
                create an editable copy.
              </p>
            ) : null}
            <CodeEditorPanel
              value={draftHtml}
              onChange={(nextValue) => {
                if (isEditable) {
                  setDraftHtml(nextValue);
                }
              }}
              minHeight={520}
              readOnly={!isEditable}
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!htmlChanged ? (
                <span className="flex items-center text-sm text-muted">
                  No HTML changes to save.
                </span>
              ) : isEditable ? (
                <span className="flex items-center text-sm text-amber-300">
                  Unsaved HTML changes
                </span>
              ) : null}
              <Button
                type="button"
                disabled={busy || !isEditable || !htmlChanged}
                onClick={() => setShowPublishDialog(true)}
              >
                Save as New Version
              </Button>
            </div>
            {validation ? (
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold text-foreground">Validation Output</h4>
                {validation.issues.length === 0 ? (
                  <p className="text-emerald-400">No issues found.</p>
                ) : (
                  <ul className="space-y-1">
                    {validation.issues.map((issue, index) => (
                      <li
                        key={`${issue.message}-${index}`}
                        className={
                          issue.severity === "error" ? "text-red-400" : "text-amber-300"
                        }
                      >
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Saved Versions</h3>
            <DisplayVersionList
              projectSlug={projectSlug}
              displayId={displayId}
              publishedRevisionId={publishedRevisionId}
              htmlDirty={htmlChanged}
              busy={busy}
              refreshToken={revisionRefreshToken}
              onRevisionsLoaded={setRevisions}
              onActivated={handleVersionActivated}
            />
          </Card>
        </>
      ) : null}

      {showPublishDialog ? (
        <PublishRevisionDialog
          title="Save New Display Version"
          description="Creates a new immutable version and makes it the active version for this display."
          confirmLabel="Save New Version"
          requireRevisionName
          revisionNameLabel="Description"
          hideChangeNote
          onCancel={() => setShowPublishDialog(false)}
          onConfirm={saveAsNewVersion}
        />
      ) : null}
    </div>
  );
}
