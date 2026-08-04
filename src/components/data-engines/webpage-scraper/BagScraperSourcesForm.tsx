"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { ScraperCredentialsSection } from "@/components/data-engines/webpage-scraper/ScraperCredentialsSection";
import {
  BAG_EXTRACTION_MANIFEST_GROUPS,
  type BagExtractionManifestGroup,
} from "@/lib/data-engines/bag-extraction-manifest";
import type { WebpageScraperSource } from "@/lib/data-engines/types";
import {
  localDeleteBagSource,
  localPatchBagSource,
  localReorderBagSources,
  localResetBagSource,
  localSaveBagSource,
} from "@/lib/local/bag-scraper-api";
import { localClearBagDefaults } from "@/lib/local/displays-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type BagScraperSourcesFormProps = {
  projectSlug: string;
  engineId: string;
  sources: WebpageScraperSource[];
  canConfigure: boolean;
  canControl: boolean;
  bagContamination?: { untouchedKeys: string[] } | null;
};

const SYSTEM_SOURCE_KEYS = new Set([
  "vehicles",
  "login",
  "auction-display",
  "detail-template",
]);

/** System keys shown as URL cards. detail-template stays in SQLite/runtime only. */
const VISIBLE_SYSTEM_SOURCE_KEYS = new Set([
  "vehicles",
  "login",
  "auction-display",
]);

const EXTRACTION_GROUPS_BY_CARD: Record<string, string[]> = {
  vehicles: ["vehicles-listing", "vehicle-detail", "derived-state"],
  login: [],
  "auction-display": ["auction-display"],
};

function isHiddenSystemSource(source: WebpageScraperSource): boolean {
  return source.source_key === "detail-template";
}

function isAdapterConsumed(source: WebpageScraperSource): boolean {
  if (source.config?.adapterConsumed === false) {
    return false;
  }
  return SYSTEM_SOURCE_KEYS.has(source.source_key) || source.config?.isSystemDefault === true;
}

function isRequiredSource(source: WebpageScraperSource): boolean {
  return (
    source.source_key === "vehicles" ||
    source.source_key === "auction-display" ||
    source.source_key === "detail-template" ||
    source.source_key === "login"
  );
}

function sourceDescription(source: WebpageScraperSource): string {
  if (typeof source.config?.description === "string" && source.config.description) {
    return source.config.description;
  }
  if (source.source_type === "detail-template") {
    return "Discovered from links matching /vehicles/{id}/edit";
  }
  if (!isAdapterConsumed(source)) {
    return "Stored custom URL — not yet consumed by adapter.";
  }
  return "Configured and used by adapter.";
}

function extractionGroupsForSource(
  sourceKey: string,
): BagExtractionManifestGroup[] {
  const groupIds = EXTRACTION_GROUPS_BY_CARD[sourceKey];
  if (!groupIds?.length) return [];
  return BAG_EXTRACTION_MANIFEST_GROUPS.filter((group) =>
    groupIds.includes(group.id),
  );
}

function NestedExtractions({ sourceKey }: { sourceKey: string }) {
  const groups = extractionGroupsForSource(sourceKey);
  if (groups.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Extractions
      </h5>
      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground">{group.title}</p>
            {group.description ? (
              <p className="mt-0.5 text-xs text-muted">{group.description}</p>
            ) : null}
          </div>
          <ul className="space-y-1.5">
            {group.entries.map((entry) => (
              <li
                key={entry.key}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border/60 bg-surface-raised/30 px-3 py-2"
              >
                <span className="text-sm text-foreground">{entry.label}</span>
                <span className="font-mono text-xs text-muted">
                  {entry.key}
                  <span className="mx-1.5 text-border">·</span>
                  {entry.extractionType}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Reorder only visible cards while keeping hidden system sources (detail-template)
 * in their existing slots in the full order.
 */
function mergeVisibleReorder(
  previous: WebpageScraperSource[],
  nextVisible: WebpageScraperSource[],
): WebpageScraperSource[] {
  const queue = [...nextVisible];
  return previous.map((source) => {
    if (isHiddenSystemSource(source)) {
      return source;
    }
    const next = queue.shift();
    return next ?? source;
  });
}

type SourceEditorProps = {
  source: WebpageScraperSource;
  engineId: string;
  canConfigure: boolean;
  canControl: boolean;
  onChanged: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  isDragOver?: boolean;
};

function SourceEditor({
  source,
  engineId,
  canConfigure,
  canControl,
  onChanged,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver = false,
}: SourceEditorProps) {
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url);
  const [enabled, setEnabled] = useState(source.enabled);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await localPatchBagSource(engineId, source.id, {
        name,
        url,
        enabled,
        pageType: source.source_type,
        sourceKey: source.source_key,
      });
      setMessage("Source saved.");
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save source.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      await localResetBagSource(engineId, source.id);
      setMessage("Source reset to default.");
      onChanged();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset source.");
    }
  }

  async function handleRemove() {
    setShowRemoveDialog(true);
  }

  async function confirmRemove() {
    try {
      await localDeleteBagSource(engineId, source.id);
      onChanged();
      setShowRemoveDialog(false);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove source.");
    }
  }

  const readOnly = !canConfigure;
  const showLoginExtras = source.source_key === "login";

  return (
    <div
      className={isDragOver ? "rounded-lg ring-2 ring-primary/40" : undefined}
      onDragOver={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDragOver?.();
      }}
      onDrop={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDrop?.();
      }}
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {canConfigure ? (
              <button
                type="button"
                className="mt-0.5 cursor-grab rounded border border-border px-2 py-1 text-xs text-muted active:cursor-grabbing"
                draggable={draggable}
                aria-label={`Reorder ${source.name}`}
                title="Drag to reorder"
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" && canMoveUp) {
                    event.preventDefault();
                    onMoveUp?.();
                  }
                  if (event.key === "ArrowDown" && canMoveDown) {
                    event.preventDefault();
                    onMoveDown?.();
                  }
                }}
              >
                ::
              </button>
            ) : null}
            <div className="min-w-0">
              <h4 className="font-medium text-foreground">{source.name}</h4>
              <p className="mt-1 text-xs text-muted">
                {source.source_type} · {source.source_key}
                {isRequiredSource(source) ? " · Required" : " · Optional"}
              </p>
            </div>
          </div>
          <span className="text-xs text-muted">{enabled ? "Enabled" : "Disabled"}</span>
        </div>

        <p className="mt-3 text-xs text-muted">{sourceDescription(source)}</p>

        <div className="mt-4 space-y-3">
          <FormField
            id={`source-name-${source.id}`}
            name="name"
            label="Label"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={readOnly || SYSTEM_SOURCE_KEYS.has(source.source_key)}
          />
          <FormField
            id={`source-url-${source.id}`}
            name="url"
            label="URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={readOnly}
          />
          {readOnly ? null : (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Enabled
            </label>
          )}
        </div>

        {showLoginExtras ? (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <ScraperCredentialsSection
              engineId={engineId}
              canControl={canConfigure || canControl}
              active={enabled && url.trim().length > 0}
              inactiveMessage="Configure the Login URL above, then save BAG credentials here."
            />
          </div>
        ) : null}

        <NestedExtractions sourceKey={source.source_key} />

        {canConfigure ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {canMoveUp ? (
              <Button type="button" size="sm" variant="secondary" onClick={onMoveUp}>
                Move up
              </Button>
            ) : null}
            {canMoveDown ? (
              <Button type="button" size="sm" variant="secondary" onClick={onMoveDown}>
                Move down
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {SYSTEM_SOURCE_KEYS.has(source.source_key) ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => void handleReset()}>
                Reset to default
              </Button>
            ) : null}
            {!isRequiredSource(source) ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => void handleRemove()}>
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}

        {message ? <Alert>{message}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
      </Card>
      {showRemoveDialog ? (
        <ConfirmDialog
          title="Remove Source?"
          description={`Remove source "${source.name}"?`}
          confirmLabel="Remove Source"
          confirmVariant="destructive"
          onCancel={() => setShowRemoveDialog(false)}
          onConfirm={confirmRemove}
        />
      ) : null}
    </div>
  );
}

export function BagScraperSourcesForm({
  projectSlug,
  engineId,
  sources,
  canConfigure,
  canControl,
  bagContamination = null,
}: BagScraperSourcesFormProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newDescription, setNewDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sortedSources = useMemo(() => {
    const byPosition = [...sources].sort((left, right) => left.position - right.position);
    if (!optimisticIds) return byPosition;

    const byId = new Map(byPosition.map((source) => [source.id, source]));
    const ordered = optimisticIds
      .map((id) => byId.get(id))
      .filter((source): source is WebpageScraperSource => Boolean(source));

    if (ordered.length !== byPosition.length) {
      return byPosition;
    }

    return ordered;
  }, [optimisticIds, sources]);

  const visibleSources = useMemo(
    () =>
      sortedSources.filter((source) => {
        if (isHiddenSystemSource(source)) return false;
        if (SYSTEM_SOURCE_KEYS.has(source.source_key)) {
          return VISIBLE_SYSTEM_SOURCE_KEYS.has(source.source_key);
        }
        return true;
      }),
    [sortedSources],
  );

  function refresh() {
    setOptimisticIds(null);
    router.refresh();
  }

  async function persistOrder(nextOrder: WebpageScraperSource[], previous: WebpageScraperSource[]) {
    setOptimisticIds(nextOrder.map((source) => source.id));
    setError(null);
    try {
      await localReorderBagSources(
        engineId,
        nextOrder.map((source) => source.id),
      );
      refresh();
    } catch (reorderError) {
      setOptimisticIds(previous.map((source) => source.id));
      setError(
        reorderError instanceof Error ? reorderError.message : "Unable to reorder sources.",
      );
    }
  }

  async function handleAddSource() {
    if (!shouldUseLocalDataClient()) {
      setError("BAG scraper configuration is available in the desktop app.");
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await localSaveBagSource(engineId, {
        custom: true,
        name: newName,
        url: newUrl,
        pageType: newType,
        sourceType: newType,
        description: newDescription,
      });
      setShowAddForm(false);
      setNewName("");
      setNewUrl("");
      setNewDescription("");
      setMessage("Custom URL added.");
      refresh();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Unable to add URL.");
    }
  }

  async function handleReorder(sourceId: string, direction: "up" | "down") {
    const ids = visibleSources.map((source) => source.id);
    const index = ids.indexOf(sourceId);
    if (index < 0) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ids.length) return;

    const previous = sortedSources;
    const nextVisible = [...visibleSources];
    [nextVisible[index], nextVisible[targetIndex]] = [
      nextVisible[targetIndex],
      nextVisible[index],
    ];
    const nextOrder = mergeVisibleReorder(previous, nextVisible);
    await persistOrder(nextOrder, previous);
  }

  async function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const previous = sortedSources;
    const fromIndex = visibleSources.findIndex((source) => source.id === draggingId);
    const toIndex = visibleSources.findIndex((source) => source.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const nextVisible = [...visibleSources];
    const [moved] = nextVisible.splice(fromIndex, 1);
    nextVisible.splice(toIndex, 0, moved);
    setDraggingId(null);
    setDragOverId(null);
    await persistOrder(mergeVisibleReorder(previous, nextVisible), previous);
  }

  async function handleClearBagDefaults() {
    if (!shouldUseLocalDataClient()) return;
    try {
      const result = await localClearBagDefaults(engineId);
      setClearMessage(
        result.removed.length > 0
          ? `Removed BAG default sources: ${result.removed.join(", ")}.`
          : "No untouched BAG default sources were found.",
      );
      refresh();
    } catch (clearError) {
      setClearMessage(
        clearError instanceof Error
          ? clearError.message
          : "Unable to clear BAG default sources.",
      );
    }
  }

  if (!shouldUseLocalDataClient()) {
    return (
      <Alert>
        BAG scraper configuration is available in the desktop app.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {bagContamination ? (
        <Alert variant="error">
          <div className="space-y-3">
            <p>
              This project contains untouched BAG default URLs (
              {bagContamination.untouchedKeys.join(", ")}).
            </p>
            {canConfigure ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleClearBagDefaults()}
              >
                Clear untouched BAG defaults
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {clearMessage ? <Alert>{clearMessage}</Alert> : null}
      {message ? <Alert>{message}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      {visibleSources.length === 0 ? (
        <p className="text-sm text-muted">No sources configured yet.</p>
      ) : (
        visibleSources.map((source, index) => (
          <SourceEditor
            key={source.id}
            source={source}
            engineId={engineId}
            canConfigure={canConfigure}
            canControl={canControl}
            onChanged={refresh}
            canMoveUp={canConfigure && index > 0}
            canMoveDown={canConfigure && index < visibleSources.length - 1}
            onMoveUp={() => void handleReorder(source.id, "up")}
            onMoveDown={() => void handleReorder(source.id, "down")}
            draggable={canConfigure}
            onDragStart={() => setDraggingId(source.id)}
            onDragOver={() => setDragOverId(source.id)}
            onDrop={() => void handleDrop(source.id)}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOverId(null);
            }}
            isDragOver={dragOverId === source.id && draggingId !== source.id}
          />
        ))
      )}

      {canConfigure ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowAddForm((value) => !value)}
          >
            {showAddForm ? "Cancel" : "Add URL"}
          </Button>
          {showAddForm ? (
            <Card>
              <div className="space-y-3">
                <FormField
                  id={`new-source-name-${engineId}`}
                  name="newSourceName"
                  label="Label"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <FormField
                  id={`new-source-url-${engineId}`}
                  name="newSourceUrl"
                  label="URL"
                  value={newUrl}
                  onChange={(event) => setNewUrl(event.target.value)}
                />
                <div>
                  <label htmlFor="newSourceType" className="block text-sm font-medium text-foreground">
                    Source type
                  </label>
                  <select
                    id="newSourceType"
                    value={newType}
                    onChange={(event) => setNewType(event.target.value)}
                    className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  >
                    <option value="custom">Custom (stored only)</option>
                    <option value="page">Page</option>
                    <option value="login">Login</option>
                    <option value="display">Auction display</option>
                  </select>
                </div>
                <FormField
                  id={`new-source-description-${engineId}`}
                  name="newSourceDescription"
                  label="Description"
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                />
                <Button type="button" size="sm" onClick={() => void handleAddSource()}>
                  Save custom URL
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      <input type="hidden" name="projectSlug" value={projectSlug} />
    </div>
  );
}
