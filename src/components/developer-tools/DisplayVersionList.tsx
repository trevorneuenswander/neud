"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  localActivateDisplayRevision,
  localDeleteDisplayRevision,
  localListDeveloperRevisions,
  localRenameDisplayRevisionDescription,
} from "@/lib/local/developer-tools-api";
import {
  formatDisplayVersion,
  DISPLAY_VERSION_UNAVAILABLE_LABEL,
} from "@/lib/displays/display-version-format";
import {
  formatRevisionCreatedTimestamp,
  formatRevisionDescription,
  MAX_REVISION_NAME_LENGTH,
  resolveRevisionVersionNumber,
} from "@/lib/developer-tools/revision-labels";
import type { ProjectCodeRevision } from "@/lib/developer-tools/types";

type DisplayVersionListProps = {
  projectSlug: string;
  displayId: string;
  publishedRevisionId: string | null;
  htmlDirty: boolean;
  busy?: boolean;
  refreshToken?: number;
  onRevisionsLoaded?: (revisions: ProjectCodeRevision[]) => void;
  onActivated?: (input: {
    publishedRevisionId: string;
    html: string;
    css: string;
    javascript: string;
  }) => void;
};

type PendingActivation = {
  revision: ProjectCodeRevision;
  versionLabel: string;
  description: string;
};

type PendingDeletion = {
  revision: ProjectCodeRevision;
  versionLabel: string;
  description: string;
};

function resolveVersionDescription(revision: ProjectCodeRevision): string {
  return formatRevisionDescription({
    revisionName: revision.revisionName,
    message: revision.message,
    createdAt: revision.createdAt,
  });
}

export function DisplayVersionList({
  projectSlug,
  displayId,
  publishedRevisionId,
  htmlDirty,
  busy = false,
  refreshToken = 0,
  onRevisionsLoaded,
  onActivated,
}: DisplayVersionListProps) {
  const [revisions, setRevisions] = useState<ProjectCodeRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [pendingActivation, setPendingActivation] = useState<PendingActivation | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<PendingActivation | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [deletingRevisionId, setDeletingRevisionId] = useState<string | null>(null);
  const [editingRevisionId, setEditingRevisionId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [renamingRevisionId, setRenamingRevisionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRevisions() {
      setLoading(true);
      setError(null);
      try {
        const result = await localListDeveloperRevisions(projectSlug, {
          resourceType: "display",
          resourceId: displayId,
        });
        if (cancelled) return;
        setRevisions(result.revisions);
        onRevisionsLoaded?.(result.revisions);
      } catch (loadError) {
        if (cancelled) return;
        setRevisions([]);
        onRevisionsLoaded?.([]);
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load saved versions.",
        );
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
  }, [displayId, onRevisionsLoaded, projectSlug, refreshToken]);

  const sortedRevisions = useMemo(
    () =>
      [...revisions].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [revisions],
  );

  function beginActivate(revision: ProjectCodeRevision) {
    if (revision.id === publishedRevisionId) {
      return;
    }

    const versionNumber = resolveRevisionVersionNumber(revision);
    const versionLabel = versionNumber
      ? formatDisplayVersion(versionNumber)
      : DISPLAY_VERSION_UNAVAILABLE_LABEL;
    const description = resolveVersionDescription(revision);
    const pending = { revision, versionLabel, description };

    if (htmlDirty) {
      setPendingDiscard(pending);
      return;
    }

    setPendingActivation(pending);
  }

  async function confirmActivation(pending: PendingActivation) {
    setActivating(true);
    setActionError(null);
    try {
      const result = await localActivateDisplayRevision(
        projectSlug,
        displayId,
        pending.revision.id,
      );
      setPendingActivation(null);
      setPendingDiscard(null);
      const nextRevisions = await localListDeveloperRevisions(projectSlug, {
        resourceType: "display",
        resourceId: displayId,
      });
      setRevisions(nextRevisions.revisions);
      onRevisionsLoaded?.(nextRevisions.revisions);
      onActivated?.({
        publishedRevisionId: result.display.publishedRevisionId,
        html: result.display.html,
        css: result.display.css,
        javascript: result.display.javascript,
      });
    } catch (activateError) {
      setActionError(
        activateError instanceof Error
          ? activateError.message
          : "Unable to activate this version.",
      );
    } finally {
      setActivating(false);
    }
  }

  async function confirmDeletion(pending: PendingDeletion) {
    setDeletingRevisionId(pending.revision.id);
    setActionError(null);
    try {
      await localDeleteDisplayRevision(projectSlug, displayId, pending.revision.id);
      setPendingDeletion(null);
      if (pendingActivation?.revision.id === pending.revision.id) {
        setPendingActivation(null);
      }
      if (pendingDiscard?.revision.id === pending.revision.id) {
        setPendingDiscard(null);
      }
      const nextRevisions = await localListDeveloperRevisions(projectSlug, {
        resourceType: "display",
        resourceId: displayId,
      });
      setRevisions(nextRevisions.revisions);
      onRevisionsLoaded?.(nextRevisions.revisions);
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete this version.",
      );
    } finally {
      setDeletingRevisionId(null);
    }
  }

  function beginDelete(revision: ProjectCodeRevision) {
    const versionNumber = resolveRevisionVersionNumber(revision);
    const versionLabel = versionNumber
      ? formatDisplayVersion(versionNumber)
      : DISPLAY_VERSION_UNAVAILABLE_LABEL;
    setPendingDeletion({
      revision,
      versionLabel,
      description: resolveVersionDescription(revision),
    });
    setActionError(null);
  }

  function beginRename(revision: ProjectCodeRevision) {
    setEditingRevisionId(revision.id);
    setEditingValue(resolveVersionDescription(revision));
    setActionError(null);
  }

  function cancelRename() {
    setEditingRevisionId(null);
    setEditingValue("");
  }

  async function saveRename(revisionId: string) {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setActionError("Version description cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_REVISION_NAME_LENGTH) {
      setActionError(
        `Version description must be ${MAX_REVISION_NAME_LENGTH} characters or fewer.`,
      );
      return;
    }

    setRenamingRevisionId(revisionId);
    setActionError(null);
    try {
      await localRenameDisplayRevisionDescription(
        projectSlug,
        displayId,
        revisionId,
        trimmed,
      );
      const nextRevisions = await localListDeveloperRevisions(projectSlug, {
        resourceType: "display",
        resourceId: displayId,
      });
      setRevisions(nextRevisions.revisions);
      onRevisionsLoaded?.(nextRevisions.revisions);
      cancelRename();
    } catch (renameError) {
      setActionError(
        renameError instanceof Error ? renameError.message : "Unable to rename version.",
      );
    } finally {
      setRenamingRevisionId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading saved versions…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (sortedRevisions.length === 0) {
    return <p className="text-sm text-muted">No saved versions yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {sortedRevisions.map((revision) => {
          const versionNumber = resolveRevisionVersionNumber(revision);
          const versionLabel = versionNumber
            ? formatDisplayVersion(versionNumber)
            : DISPLAY_VERSION_UNAVAILABLE_LABEL;
          const description = resolveVersionDescription(revision);
          const isActive = revision.id === publishedRevisionId;
          const isEditing = editingRevisionId === revision.id;
          const authorLabel = revision.createdByName?.trim() || null;
          const canDelete = !isActive && sortedRevisions.length > 1;
          const deleteDisabledReason = isActive
            ? "The active version cannot be deleted."
            : sortedRevisions.length <= 1
              ? "At least one version must remain."
              : null;

          return (
            <li
              key={revision.id}
              className={`rounded-md border px-3 py-3 ${
                isActive ? "border-primary bg-primary/5" : "border-border bg-surface/40"
              }`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name={`display-version-${displayId}`}
                    className="mt-1"
                    checked={isActive}
                    disabled={busy || activating || isEditing}
                    onChange={() => beginActivate(revision)}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-medium text-foreground">
                      {versionLabel}
                      {isActive ? (
                        <span className="ml-2 text-xs font-normal text-emerald-400">
                          Active
                        </span>
                      ) : null}
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingValue}
                        maxLength={MAX_REVISION_NAME_LENGTH}
                        disabled={renamingRevisionId === revision.id}
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                        onChange={(event) => setEditingValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveRename(revision.id);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="block text-sm text-muted">{description}</span>
                    )}
                    <span className="block text-xs text-muted">
                      Created {formatRevisionCreatedTimestamp(revision.createdAt)}
                      {authorLabel ? ` · ${authorLabel}` : ""}
                    </span>
                  </span>
                </label>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={renamingRevisionId === revision.id}
                      onClick={cancelRename}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={renamingRevisionId === revision.id}
                      onClick={() => void saveRename(revision.id)}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || activating}
                      aria-label={`Edit description for ${versionLabel}`}
                      onClick={() => beginRename(revision)}
                    >
                      Edit
                    </Button>
                    {canDelete ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy || activating || deletingRevisionId === revision.id}
                        aria-label={`Delete ${versionLabel}`}
                        onClick={() => beginDelete(revision)}
                      >
                        Delete Version
                      </Button>
                    ) : deleteDisabledReason ? (
                      <span className="text-xs text-muted">{deleteDisabledReason}</span>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {actionError ? <p className="text-sm text-red-400">{actionError}</p> : null}

      {pendingDiscard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-foreground">Unsaved HTML changes</h3>
            <p className="mt-2 text-sm text-muted">
              You have unsaved HTML changes. Changing the active version will discard these
              changes.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingDiscard(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setPendingActivation(pendingDiscard);
                  setPendingDiscard(null);
                }}
              >
                Discard Changes and Continue
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingActivation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-foreground">
              Make {pendingActivation.versionLabel} active?
            </h3>
            <p className="mt-2 text-sm text-muted">{pendingActivation.description}</p>
            <p className="mt-2 text-sm text-muted">
              This will update all previews, fullscreen views, and Local URLs using this
              display.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={activating}
                onClick={() => setPendingActivation(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={activating}
                onClick={() => void confirmActivation(pendingActivation)}
              >
                {activating ? "Activating…" : "Make Active"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeletion ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-foreground">
              Delete {pendingDeletion.versionLabel}?
            </h3>
            <p className="mt-2 text-sm text-muted">{pendingDeletion.description}</p>
            <p className="mt-2 text-sm text-muted">
              Created {formatRevisionCreatedTimestamp(pendingDeletion.revision.createdAt)}
            </p>
            <p className="mt-2 text-sm text-red-400">
              This action cannot be undone. Only this version will be deleted.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={deletingRevisionId === pendingDeletion.revision.id}
                onClick={() => setPendingDeletion(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingRevisionId === pendingDeletion.revision.id}
                onClick={() => void confirmDeletion(pendingDeletion)}
              >
                {deletingRevisionId === pendingDeletion.revision.id
                  ? "Deleting…"
                  : "Delete Version"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
