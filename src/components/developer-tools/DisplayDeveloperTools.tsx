"use client";

import { useCallback, useState } from "react";
import { DisplayCodeEditor } from "@/components/developer-tools/DisplayCodeEditor";
import { CodeRevisionsPanel } from "@/components/developer-tools/CodeRevisionsPanel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DuplicateDisplayModal } from "@/components/developer-tools/DuplicateDisplayModal";
import { DeveloperToolsDropdown } from "@/components/ui/DeveloperToolsDropdown";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import {
  localArchiveDeveloperDisplay,
  localDuplicateDeveloperDisplay,
  localGetDeveloperDisplay,
} from "@/lib/local/developer-tools-api";
import type { ProjectDisplaySource } from "@/lib/developer-tools/types";

type DisplayDeveloperToolsProps = {
  projectSlug: string;
  display: Pick<
    ProjectDisplaySource,
    "id" | "name" | "slug" | "sourceType" | "archived"
  >;
  onChanged?: () => void;
};

type PanelView = "editor" | "revisions" | null;

export function DisplayDeveloperTools({
  projectSlug,
  display,
  onChanged,
}: DisplayDeveloperToolsProps) {
  const [panel, setPanel] = useState<PanelView>(null);
  const [editorTab, setEditorTab] = useState<"html" | "css" | "javascript" | "preview">(
    "html",
  );
  const [source, setSource] = useState<{
    html: string;
    css: string;
    javascript: string;
    publishedRevisionId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const isBuiltIn = display.sourceType === "built-in";

  const loadSource = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await localGetDeveloperDisplay(projectSlug, display.id);
      setSource({
        html: result.display.html,
        css: result.display.css,
        javascript: result.display.javascript,
        publishedRevisionId: result.display.publishedRevisionId,
      });
    } catch (loadError) {
      setSource(null);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load display source.",
      );
    } finally {
      setLoading(false);
    }
  }, [display.id, projectSlug]);

  async function openEditor(tab: typeof editorTab) {
    setEditorTab(tab);
    setPanel("editor");
    setSource(null);
    await loadSource();
  }

  async function handleDuplicateAsEditable() {
    setShowDuplicateDialog(true);
  }

  async function confirmDuplicate(values: { name: string; description?: string }) {
    setBusy(true);
    setError(null);
    try {
      await localDuplicateDeveloperDisplay(projectSlug, display.id, values);
      setShowDuplicateDialog(false);
      onChanged?.();
    } catch (duplicateError) {
      throw duplicateError;
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setShowArchiveDialog(true);
  }

  async function confirmArchive() {
    setBusy(true);
    setError(null);
    try {
      await localArchiveDeveloperDisplay(projectSlug, display.id);
      setShowArchiveDialog(false);
      onChanged?.();
      setPanel(null);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Unable to archive display.",
      );
    } finally {
      setBusy(false);
    }
  }

  const panelTitle =
    panel === "editor"
      ? `Edit ${display.name}`
      : panel === "revisions"
        ? `${display.name} Revisions`
        : "";

  const menuItems = [
    {
      id: "edit-css",
      label: "Edit CSS",
      disabled: isBuiltIn,
      onSelect: () => void openEditor("css"),
    },
    {
      id: "edit-javascript",
      label: "Edit JavaScript",
      disabled: isBuiltIn,
      onSelect: () => void openEditor("javascript"),
    },
    {
      id: "preview",
      label: "Preview Draft",
      disabled: isBuiltIn,
      onSelect: () => void openEditor("preview"),
    },
    {
      id: "revisions",
      label: "Code Revisions",
      onSelect: () => setPanel("revisions"),
    },
    {
      id: "duplicate",
      label: "Duplicate Display",
      disabled: busy,
      onSelect: () => void handleDuplicateAsEditable(),
    },
    {
      id: "archive",
      label: "Archive Display",
      disabled: busy || display.archived || isBuiltIn,
      onSelect: () => void handleArchive(),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isBuiltIn ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void handleDuplicateAsEditable()}
          >
            Duplicate as Editable Display
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void openEditor("html")}
          >
            Edit HTML
          </Button>
        )}
        <DeveloperToolsDropdown items={menuItems} align="right" />
      </div>

      {error && panel === null ? <p className="text-xs text-red-400">{error}</p> : null}

      <SlideOverPanel
        title={panelTitle}
        subtitle={`${display.name} · ${display.id}`}
        open={panel !== null}
        onClose={() => setPanel(null)}
      >
        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
        {panel === "editor" && loading ? (
          <p className="text-sm text-muted">Loading display source…</p>
        ) : null}
        {panel === "editor" && !loading && source ? (
          <DisplayCodeEditor
            projectSlug={projectSlug}
            displayId={display.id}
            displayName={display.name}
            initialTab={editorTab}
            initial={source}
          />
        ) : null}
        {panel === "editor" && !loading && !source && !error ? (
          <p className="text-sm text-muted">Display source is unavailable.</p>
        ) : null}
        {panel === "revisions" ? (
          <CodeRevisionsPanel
            projectSlug={projectSlug}
            resourceType="display"
            resourceId={display.id}
            resourceLabel={display.name}
          />
        ) : null}
      </SlideOverPanel>
      {showDuplicateDialog ? (
        <DuplicateDisplayModal
          defaultName={`${display.name} Copy`}
          onCancel={() => setShowDuplicateDialog(false)}
          onConfirm={confirmDuplicate}
        />
      ) : null}
      {showArchiveDialog ? (
        <ConfirmDialog
          title="Archive Display?"
          description={`Archive "${display.name}"? It will stop serving viewer routes.`}
          confirmLabel="Archive Display"
          onCancel={() => setShowArchiveDialog(false)}
          onConfirm={confirmArchive}
        />
      ) : null}
    </>
  );
}
