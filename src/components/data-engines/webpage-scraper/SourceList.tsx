"use client";

import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS } from "@/lib/data-engines/constants";
import {
  removeScraperSource,
  saveScraperSource,
  toggleScraperSource,
} from "@/lib/data-engines/actions";
import { initialDataEngineActionState } from "@/lib/data-engines/state";
import type { WebpageScraperSource } from "@/lib/data-engines/types";
import { localClearBagDefaults } from "@/lib/local/displays-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type SourceListProps = {
  projectSlug: string;
  engineId: string;
  sources: WebpageScraperSource[];
  canConfigure: boolean;
  bagContamination?: { untouchedKeys: string[] } | null;
};

function sourceFieldLabel(source: WebpageScraperSource): string {
  if (source.source_type === "login") return "Login URL";
  if (source.source_type === "display") return "Display page URL";
  if (source.source_type === "detail") return "Detail page URL";
  if (source.source_type === "detail-template") return "Detail URL strategy";
  if (source.source_type === "custom") return "Custom URL";
  return "Page URL";
}

function sourceHelperText(source: WebpageScraperSource): string | null {
  if (source.source_type === "login") {
    return "Optional page used to authenticate before scraping the main page.";
  }
  return null;
}

function SourceCard({
  projectSlug,
  engineId,
  source,
  canConfigure,
}: {
  projectSlug: string;
  engineId: string;
  source: WebpageScraperSource;
  canConfigure: boolean;
}) {
  const [removeState, removeAction] = useActionState(
    removeScraperSource,
    initialDataEngineActionState,
  );
  const [toggleState, toggleAction] = useActionState(
    toggleScraperSource,
    initialDataEngineActionState,
  );
  const removeFormRef = useRef<HTMLFormElement>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  async function copyUrl() {
    await navigator.clipboard.writeText(source.url);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium text-foreground">{source.name}</h4>
          <p className="mt-1 text-xs text-muted">
            {SOURCE_TYPE_LABELS[source.source_type]} · {source.source_key}
          </p>
        </div>
        <span className="text-xs text-muted">
          {source.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium text-muted">{sourceFieldLabel(source)}</p>
        {sourceHelperText(source) ? (
          <p className="mt-1 text-xs text-muted">{sourceHelperText(source)}</p>
        ) : null}
        <p className="mt-2 break-all text-sm text-foreground">{source.url || "—"}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={copyUrl}>
          Copy URL
        </Button>
        {canConfigure ? (
          <>
            <form action={toggleAction}>
              <input type="hidden" name="projectSlug" value={projectSlug} />
              <input type="hidden" name="engineId" value={engineId} />
              <input type="hidden" name="sourceId" value={source.id} />
              <input
                type="hidden"
                name="enabled"
                value={source.enabled ? "false" : "true"}
              />
              <Button type="submit" size="sm" variant="secondary">
                {source.enabled ? "Disable" : "Enable"}
              </Button>
            </form>
            <form ref={removeFormRef} action={removeAction}>
              <input type="hidden" name="projectSlug" value={projectSlug} />
              <input type="hidden" name="engineId" value={engineId} />
              <input type="hidden" name="sourceId" value={source.id} />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowRemoveDialog(true)}
              >
                Remove
              </Button>
            </form>
          </>
        ) : null}
      </div>
      {removeState.error ? <Alert variant="error">{removeState.error}</Alert> : null}
      {toggleState.error ? <Alert variant="error">{toggleState.error}</Alert> : null}
      {showRemoveDialog ? (
        <ConfirmDialog
          title="Remove Source?"
          description={`Remove source "${source.name}"?`}
          confirmLabel="Remove Source"
          confirmVariant="destructive"
          onCancel={() => setShowRemoveDialog(false)}
          onConfirm={() => {
            setShowRemoveDialog(false);
            removeFormRef.current?.requestSubmit();
          }}
        />
      ) : null}
    </Card>
  );
}

export function SourceList({
  projectSlug,
  engineId,
  sources,
  canConfigure,
  bagContamination,
}: SourceListProps) {
  const [showForm, setShowForm] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [saveState, saveAction] = useActionState(
    saveScraperSource,
    initialDataEngineActionState,
  );

  async function handleClearBagDefaults() {
    if (!shouldUseLocalDataClient()) return;
    try {
      const result = await localClearBagDefaults(engineId);
      setClearMessage(
        result.removed.length > 0
          ? `Removed BAG default sources: ${result.removed.join(", ")}.`
          : "No untouched BAG default sources were found.",
      );
    } catch (error) {
      setClearMessage(
        error instanceof Error ? error.message : "Unable to clear BAG default sources.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Scraper pages</h3>
          <p className="mt-1 text-sm text-muted">
            Configure page URLs here. Username and password are stored separately in the
            desktop credential manager.
          </p>
        </div>
        {canConfigure ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Cancel" : "Add source"}
          </Button>
        ) : null}
      </div>

      {bagContamination ? (
        <Alert variant="error">
          <div className="space-y-3">
            <p>
              This generic scraper project contains untouched BAG default URLs (
              {bagContamination.untouchedKeys.join(", ")}). They were likely added before
              project-type gating was enforced.
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

      {showForm && canConfigure ? (
        <Card>
          <form action={saveAction} className="space-y-4">
            <input type="hidden" name="projectSlug" value={projectSlug} />
            <input type="hidden" name="engineId" value={engineId} />
            <FormField id="name" name="name" label="Name" placeholder="Main listing page" />
            <FormField id="sourceKey" name="sourceKey" label="Source key" placeholder="main-page" />
            <FormField id="url" name="url" label="Page URL" placeholder="https://example.com/page" />
            <div>
              <label htmlFor="sourceType" className="block text-sm font-medium text-foreground">
                Source type
              </label>
              <p className="mt-1 text-xs text-muted">
                Use Login for an optional authentication page. Credentials are not stored in
                URLs.
              </p>
              <select
                id="sourceType"
                name="sourceType"
                defaultValue="page"
                className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
              >
                {SOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SOURCE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            {saveState.error ? <Alert variant="error">{saveState.error}</Alert> : null}
            <SubmitButton pendingLabel="Saving source…">Save source</SubmitButton>
          </form>
        </Card>
      ) : null}

      {sources.length === 0 ? (
        <p className="text-sm text-muted">No sources configured yet.</p>
      ) : (
        sources.map((source) => (
          <SourceCard
            key={source.id}
            projectSlug={projectSlug}
            engineId={engineId}
            source={source}
            canConfigure={canConfigure}
          />
        ))
      )}
    </div>
  );
}
