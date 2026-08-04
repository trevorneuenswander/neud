"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { ScraperCredentialsSection } from "@/components/data-engines/webpage-scraper/ScraperCredentialsSection";
import type {
  GenericExtractionField,
  GenericExtractionType,
  GenericLoginConfig,
} from "@/lib/data-engines/generic-scraper-types";
import type { DataEngine, WebpageScraperSource } from "@/lib/data-engines/types";
import {
  localConvertGenericAdapter,
  localSaveGenericScraperConfig,
} from "@/lib/local/generic-scraper-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

const EXTRACTION_OPTIONS: { value: GenericExtractionType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "html", label: "HTML" },
  { value: "attribute", label: "Attribute" },
];

type GenericScraperConfigProps = {
  projectSlug: string;
  engine: DataEngine;
  sources: WebpageScraperSource[];
  canConfigure: boolean;
  canControl: boolean;
  adapterContamination?: { adapter: string } | null;
  layout?: "columns" | "stack";
};

function emptyField(): GenericExtractionField {
  return {
    key: "",
    label: "",
    selector: "",
    extraction: "text",
  };
}

function readLoginConfig(engine: DataEngine): GenericLoginConfig {
  const login = engine.config?.login;
  if (!login || typeof login !== "object" || Array.isArray(login)) {
    return {
      usernameSelector: "",
      passwordSelector: "",
      submitSelector: "",
      successSelector: "",
      successUrlContains: "",
    };
  }

  const raw = login as GenericLoginConfig;
  return {
    usernameSelector: raw.usernameSelector ?? "",
    passwordSelector: raw.passwordSelector ?? "",
    submitSelector: raw.submitSelector ?? "",
    successSelector: raw.successSelector ?? "",
    successUrlContains: raw.successUrlContains ?? "",
  };
}

function readFields(engine: DataEngine): GenericExtractionField[] {
  const fields = engine.config?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    return [emptyField()];
  }
  return fields as GenericExtractionField[];
}

export function GenericScraperConfig({
  projectSlug,
  engine,
  sources,
  canConfigure,
  canControl,
  adapterContamination = null,
  layout = "stack",
}: GenericScraperConfigProps) {
  const router = useRouter();
  const pageSource = sources.find((source) => source.source_key === "page");
  const loginSource = sources.find((source) => source.source_key === "login");

  const [pageUrl, setPageUrl] = useState(pageSource?.url ?? "");
  const [loginUrl, setLoginUrl] = useState(loginSource?.url ?? "");
  const [login, setLogin] = useState<GenericLoginConfig>(() => readLoginConfig(engine));
  const [fields, setFields] = useState<GenericExtractionField[]>(() =>
    readFields(engine),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showConvertWithBagUrlsDialog, setShowConvertWithBagUrlsDialog] = useState(false);

  const showLoginConfig = loginUrl.trim().length > 0;

  function updateField(index: number, patch: Partial<GenericExtractionField>) {
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    );
  }

  function addField() {
    setFields((current) => [...current, emptyField()]);
  }

  function removeField(index: number) {
    setFields((current) =>
      current.length <= 1 ? [emptyField()] : current.filter((_, i) => i !== index),
    );
  }

  async function handleSave() {
    if (!shouldUseLocalDataClient()) {
      setError("Generic scraper configuration is available in the desktop app.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await localSaveGenericScraperConfig(engine.id, {
        pageUrl,
        loginUrl: loginUrl.trim() ? loginUrl : undefined,
        login: showLoginConfig ? login : undefined,
        fields: fields.filter((field) => field.key.trim() || field.selector.trim()),
      });
      setMessage("Generic scraper configuration saved.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save generic scraper configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert(removeUntouchedBagUrls: boolean) {
    if (!shouldUseLocalDataClient()) return;

    setConverting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await localConvertGenericAdapter(engine.id, {
        removeUntouchedBagUrls,
      });
      setMessage(
        result.removedBagSources.length > 0
          ? `Converted to Generic Webpage Scraper. Removed BAG sources: ${result.removedBagSources.join(", ")}.`
          : "Converted to Generic Webpage Scraper.",
      );
      router.refresh();
    } catch (convertError) {
      setError(
        convertError instanceof Error
          ? convertError.message
          : "Unable to convert adapter.",
      );
    } finally {
      setConverting(false);
    }
  }

  const urlsSection = (
    <Card>
      <div className="space-y-4">
        <FormField
          id={`page-url-${engine.id}`}
          name="pageUrl"
          label="Page URL"
          value={pageUrl}
          onChange={(event) => setPageUrl(event.target.value)}
          placeholder="https://example.com/page"
          disabled={!canConfigure}
          required={false}
        />
        <p className="text-xs text-muted">Required before Start or Run Once.</p>
        <FormField
          id={`login-url-${engine.id}`}
          name="loginUrl"
          label="Login URL (optional)"
          value={loginUrl}
          onChange={(event) => setLoginUrl(event.target.value)}
          placeholder="https://example.com/login"
          disabled={!canConfigure}
          required={false}
        />
        <ScraperCredentialsSection
          engineId={engine.id}
          canControl={canControl}
          active={showLoginConfig}
        />
        {showLoginConfig ? (
          <div className="grid gap-4 sm:grid-cols-2 border-t border-border pt-4">
            <FormField
              id={`username-selector-${engine.id}`}
              name="usernameSelector"
              label="Username field selector"
              value={login.usernameSelector}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  usernameSelector: event.target.value,
                }))
              }
              placeholder="#username"
              disabled={!canConfigure}
              required={false}
            />
            <FormField
              id={`password-selector-${engine.id}`}
              name="passwordSelector"
              label="Password field selector"
              value={login.passwordSelector}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  passwordSelector: event.target.value,
                }))
              }
              placeholder="#password"
              disabled={!canConfigure}
              required={false}
            />
            <FormField
              id={`submit-selector-${engine.id}`}
              name="submitSelector"
              label="Submit button selector"
              value={login.submitSelector}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  submitSelector: event.target.value,
                }))
              }
              placeholder="button[type=submit]"
              disabled={!canConfigure}
              required={false}
            />
            <FormField
              id={`success-selector-${engine.id}`}
              name="successSelector"
              label="Successful login selector (optional)"
              value={login.successSelector ?? ""}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  successSelector: event.target.value,
                }))
              }
              placeholder=".dashboard"
              disabled={!canConfigure}
              required={false}
            />
            <FormField
              id={`success-url-${engine.id}`}
              name="successUrlContains"
              label="Successful login URL contains (optional)"
              value={login.successUrlContains ?? ""}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  successUrlContains: event.target.value,
                }))
              }
              placeholder="/dashboard"
              disabled={!canConfigure}
              required={false}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );

  const extractionsSection = (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            Example: Field <strong>Current Price</strong>, selector{" "}
            <code className="text-xs">.current-price</code>, extract Text.
          </p>
        </div>
        {canConfigure ? (
          <Button type="button" size="sm" variant="secondary" onClick={addField}>
            Add field
          </Button>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {fields.map((field, index) => (
          <div
            key={`field-${index}`}
            className="rounded-md border border-border p-4 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id={`field-key-${engine.id}-${index}`}
                name={`fieldKey-${index}`}
                label="Key"
                value={field.key}
                onChange={(event) => updateField(index, { key: event.target.value })}
                placeholder="headline"
                disabled={!canConfigure}
                required={false}
              />
              <FormField
                id={`field-label-${engine.id}-${index}`}
                name={`fieldLabel-${index}`}
                label="Label"
                value={field.label}
                onChange={(event) => updateField(index, { label: event.target.value })}
                placeholder="Headline"
                disabled={!canConfigure}
                required={false}
              />
            </div>
            <FormField
              id={`field-selector-${engine.id}-${index}`}
              name={`fieldSelector-${index}`}
              label="CSS selector"
              value={field.selector}
              onChange={(event) => updateField(index, { selector: event.target.value })}
              placeholder="h1"
              disabled={!canConfigure}
              required={false}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`field-extraction-${engine.id}-${index}`}
                  className="block text-sm font-medium text-foreground"
                >
                  Extraction type
                </label>
                <select
                  id={`field-extraction-${engine.id}-${index}`}
                  value={field.extraction}
                  onChange={(event) =>
                    updateField(index, {
                      extraction: event.target.value as GenericExtractionType,
                    })
                  }
                  disabled={!canConfigure}
                  className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                >
                  {EXTRACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {field.extraction === "attribute" ? (
                <FormField
                  id={`field-attribute-${engine.id}-${index}`}
                  name={`fieldAttribute-${index}`}
                  label="Attribute name"
                  value={field.attribute ?? ""}
                  onChange={(event) =>
                    updateField(index, { attribute: event.target.value })
                  }
                  placeholder="src"
                  disabled={!canConfigure}
                  required={false}
                />
              ) : null}
            </div>
            {canConfigure ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => removeField(index)}
              >
                Remove field
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {adapterContamination ? (
        <Alert variant="error">
          <div className="space-y-3">
            <p>
              This generic Webpage Scraper is configured with the BAG Auction adapter.
            </p>
            {canConfigure ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={converting}
                  onClick={() => void handleConvert(false)}
                >
                  Convert to Generic Webpage Scraper
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={converting}
                  onClick={() => setShowConvertWithBagUrlsDialog(true)}
                >
                  Convert and remove untouched BAG URLs
                </Button>
              </div>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {layout === "columns" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">URLs to Scrape</h3>
            {urlsSection}
          </div>
          <div className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Extractions</h3>
            {extractionsSection}
          </div>
        </div>
      ) : (
        <>
          {urlsSection}
          {extractionsSection}
        </>
      )}

      {canConfigure ? (
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
      ) : null}

      {message ? <Alert>{message}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {showConvertWithBagUrlsDialog ? (
        <ConfirmDialog
          title="Convert Scraper?"
          description="Also remove untouched BAG default source URLs if present?"
          confirmLabel="Convert and Remove URLs"
          confirmVariant="destructive"
          onCancel={() => setShowConvertWithBagUrlsDialog(false)}
          onConfirm={async () => {
            setShowConvertWithBagUrlsDialog(false);
            await handleConvert(true);
          }}
        />
      ) : null}
      <input type="hidden" name="projectSlug" value={projectSlug} />
    </div>
  );
}
