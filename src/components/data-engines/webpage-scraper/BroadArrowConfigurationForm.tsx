"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ScraperCredentialsSection } from "@/components/data-engines/webpage-scraper/ScraperCredentialsSection";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import type { WebpageScraperSource } from "@/lib/data-engines/types";
import { localPatchBagSource } from "@/lib/local/bag-scraper-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type BroadArrowConfigurationFormProps = {
  engineId: string;
  sources: WebpageScraperSource[];
  canConfigure: boolean;
  canControl: boolean;
};

const CONFIGURED_SOURCE_KEYS = ["login", "vehicles", "auction-display"] as const;

const GROUP_TITLES: Record<(typeof CONFIGURED_SOURCE_KEYS)[number], string> = {
  login: "Login URL",
  vehicles: "Auction Table URL",
  "auction-display": "Auction Display URL",
};

type SourceDraft = {
  id: string;
  sourceKey: string;
  name: string;
  url: string;
  enabled: boolean;
  sourceType: string;
};

function toDraft(source: WebpageScraperSource): SourceDraft {
  return {
    id: source.id,
    sourceKey: source.source_key,
    name: source.name,
    url: source.url,
    enabled: source.enabled,
    sourceType: source.source_type,
  };
}

function UrlInput({
  id,
  name,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      id={id}
      name={name}
      type="text"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
      className="block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function UrlGroupBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-raised/40 p-4">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

export function BroadArrowConfigurationForm({
  engineId,
  sources,
  canConfigure,
  canControl,
}: BroadArrowConfigurationFormProps) {
  const router = useRouter();
  const configuredSources = useMemo(
    () =>
      CONFIGURED_SOURCE_KEYS.map((sourceKey) =>
        sources.find((source) => source.source_key === sourceKey),
      ).filter((source): source is WebpageScraperSource => Boolean(source)),
    [sources],
  );

  const [editedUrls, setEditedUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const drafts = useMemo(
    () =>
      configuredSources.map((source) => {
        const draft = toDraft(source);
        return {
          ...draft,
          url: editedUrls[draft.sourceKey] ?? draft.url,
        };
      }),
    [configuredSources, editedUrls],
  );

  function refresh() {
    router.refresh();
  }

  function updateDraft(sourceKey: string, url: string) {
    setEditedUrls((current) => ({ ...current, [sourceKey]: url }));
  }

  async function handleSave(sourceKey: string) {
    const draft = drafts.find((entry) => entry.sourceKey === sourceKey);
    if (!draft) return;

    setSavingKey(sourceKey);
    setError(null);
    setMessage(null);

    try {
      await localPatchBagSource(engineId, draft.id, {
        name: draft.name,
        url: draft.url,
        enabled: draft.enabled,
        pageType: draft.sourceType,
        sourceKey: draft.sourceKey,
      });
      setMessage(`${GROUP_TITLES[sourceKey as keyof typeof GROUP_TITLES]} saved.`);
      setEditedUrls((current) => {
        const next = { ...current };
        delete next[sourceKey];
        return next;
      });
      refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save configuration.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (!shouldUseLocalDataClient()) {
    return (
      <DisclosureSection title="URL Configuration" contentClassName="min-w-0">
        <Alert>URL configuration is available in the desktop app.</Alert>
      </DisclosureSection>
    );
  }

  const loginDraft = drafts.find((draft) => draft.sourceKey === "login");
  const vehiclesDraft = drafts.find((draft) => draft.sourceKey === "vehicles");
  const auctionDisplayDraft = drafts.find((draft) => draft.sourceKey === "auction-display");

  return (
    <DisclosureSection title="URL Configuration" contentClassName="min-w-0 space-y-4">
      {message ? <Alert>{message}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      {loginDraft ? (
        <UrlGroupBox title={GROUP_TITLES.login}>
          <UrlInput
            id={`broad-arrow-login-${engineId}`}
            name="login"
            label={GROUP_TITLES.login}
            value={loginDraft.url}
            onChange={(event) => updateDraft("login", event.target.value)}
            disabled={!canConfigure || savingKey !== null}
          />
          <ScraperCredentialsSection
            engineId={engineId}
            canControl={canConfigure || canControl}
            active={Boolean(loginDraft.url.trim())}
            inactiveMessage="Configure the Login URL above before saving credentials."
          />
          {canConfigure ? (
            <Button
              type="button"
              size="sm"
              disabled={savingKey !== null}
              onClick={() => void handleSave("login")}
            >
              {savingKey === "login" ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </UrlGroupBox>
      ) : null}

      {vehiclesDraft ? (
        <UrlGroupBox title={GROUP_TITLES.vehicles}>
          <UrlInput
            id={`broad-arrow-vehicles-${engineId}`}
            name="vehicles"
            label={GROUP_TITLES.vehicles}
            value={vehiclesDraft.url}
            onChange={(event) => updateDraft("vehicles", event.target.value)}
            disabled={!canConfigure || savingKey !== null}
          />
          {canConfigure ? (
            <Button
              type="button"
              size="sm"
              disabled={savingKey !== null}
              onClick={() => void handleSave("vehicles")}
            >
              {savingKey === "vehicles" ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </UrlGroupBox>
      ) : null}

      {auctionDisplayDraft ? (
        <UrlGroupBox title={GROUP_TITLES["auction-display"]}>
          <UrlInput
            id={`broad-arrow-auction-display-${engineId}`}
            name="auction-display"
            label={GROUP_TITLES["auction-display"]}
            value={auctionDisplayDraft.url}
            onChange={(event) => updateDraft("auction-display", event.target.value)}
            disabled={!canConfigure || savingKey !== null}
          />
          {canConfigure ? (
            <Button
              type="button"
              size="sm"
              disabled={savingKey !== null}
              onClick={() => void handleSave("auction-display")}
            >
              {savingKey === "auction-display" ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </UrlGroupBox>
      ) : null}
    </DisclosureSection>
  );
}
