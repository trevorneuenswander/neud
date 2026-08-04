"use client";

import { useActionState, useCallback, useEffect, useState, startTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { POLL_PRESETS_MS } from "@/lib/data-engines/constants";
import { updateScraperSettings } from "@/lib/data-engines/actions";
import { initialDataEngineActionState } from "@/lib/data-engines/state";
import { formatPollInterval } from "@/lib/data-engines/format";
import {
  POLL_SLIDER_MAX_INDEX,
  pollIntervalToSliderIndex,
  sliderIndexToPollIntervalMs,
  snapPollIntervalMs,
} from "@/lib/data-engines/poll-interval";
import { localUpdateScraperSettings } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import type { WebpageScraperSettings } from "@/lib/data-engines/types";

type EngineSettingsFormProps = {
  projectSlug: string;
  engineId: string;
  settings: WebpageScraperSettings;
  canConfigure: boolean;
  embedded?: boolean;
  onPollIntervalChange?: (pollIntervalMs: number) => void;
  onSettingsPersisted?: () => void;
};

function formatPresetLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return Number.isInteger(seconds) ? `${seconds}s` : `${seconds}s`;
  }
  return `${ms / 60_000}m`;
}

export function EngineSettingsForm({
  projectSlug,
  engineId,
  settings,
  canConfigure,
  embedded = false,
  onPollIntervalChange,
  onSettingsPersisted,
}: EngineSettingsFormProps) {
  const [activeIntervalMs, setActiveIntervalMs] = useState(settings.poll_interval_ms);
  const [sliderDraftMs, setSliderDraftMs] = useState(settings.poll_interval_ms);
  const [advancedIntervalMs, setAdvancedIntervalMs] = useState(settings.poll_interval_ms);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);
  const [state, formAction] = useActionState(
    updateScraperSettings,
    initialDataEngineActionState,
  );

  useEffect(() => {
    startTransition(() => {
      const syncedMs = snapPollIntervalMs(settings.poll_interval_ms);
      setActiveIntervalMs(syncedMs);
      setSliderDraftMs(syncedMs);
    });
  }, [settings.poll_interval_ms]);

  useEffect(() => {
    if (state.success) {
      startTransition(() => {
        const syncedMs = snapPollIntervalMs(advancedIntervalMs);
        setActiveIntervalMs(syncedMs);
        setSliderDraftMs(syncedMs);
      });
    }
  }, [advancedIntervalMs, state.success]);

  const persistPollInterval = useCallback(
    async (pollIntervalMs: number, previousMs = activeIntervalMs) => {
      const nextMs = snapPollIntervalMs(pollIntervalMs);
      if (nextMs === previousMs) {
        return;
      }

      setPresetError(null);
      setPresetSaving(true);

      try {
        if (shouldUseLocalDataClient()) {
          await localUpdateScraperSettings(engineId, {
            pollIntervalMs: nextMs,
            detailsTtlMs: settings.details_ttl_ms,
            maxDetailChecksPerPoll: settings.max_detail_checks_per_poll,
            headless: settings.headless,
          });
        } else {
          const formData = new FormData();
          formData.set("projectSlug", projectSlug);
          formData.set("engineId", engineId);
          formData.set("pollIntervalMs", String(nextMs));
          formData.set("detailsTtlMs", String(settings.details_ttl_ms));
          formData.set("maxDetailChecks", String(settings.max_detail_checks_per_poll));
          formData.set("headless", settings.headless ? "true" : "false");

          const result = await updateScraperSettings(initialDataEngineActionState, formData);
          if (result.error) {
            throw new Error(result.error);
          }
        }

        setActiveIntervalMs(nextMs);
        setSliderDraftMs(nextMs);
        onSettingsPersisted?.();
      } catch (error) {
        setActiveIntervalMs(previousMs);
        setSliderDraftMs(previousMs);
        onPollIntervalChange?.(previousMs);
        setPresetError(
          error instanceof Error ? error.message : "Unable to update poll interval.",
        );
      } finally {
        setPresetSaving(false);
      }
    },
    [
      activeIntervalMs,
      engineId,
      onPollIntervalChange,
      onSettingsPersisted,
      projectSlug,
      settings,
    ],
  );

  const applyPollInterval = useCallback(
    (nextMs: number) => {
      const snappedMs = snapPollIntervalMs(nextMs);
      if (snappedMs === activeIntervalMs) {
        return;
      }

      const previousMs = activeIntervalMs;
      setSliderDraftMs(snappedMs);
      setActiveIntervalMs(snappedMs);
      onPollIntervalChange?.(snappedMs);
      void persistPollInterval(snappedMs, previousMs);
    },
    [activeIntervalMs, onPollIntervalChange, persistPollInterval],
  );

  const commitSliderInterval = useCallback(() => {
    applyPollInterval(sliderDraftMs);
  }, [applyPollInterval, sliderDraftMs]);

  if (!canConfigure) {
    const readOnly = (
      <>
        <p className="mt-2 text-sm text-muted">
          Polling interval: {formatPollInterval(settings.poll_interval_ms)}
        </p>
      </>
    );
    return embedded ? readOnly : <Card>{readOnly}</Card>;
  }

  const sliderIndex = pollIntervalToSliderIndex(sliderDraftMs);

  const formContent = (
    <>
      {!embedded ? (
        <>
          <h3 className="text-sm font-semibold text-foreground">Poll rate</h3>
          <p className="mt-1 text-sm text-muted">
            The worker waits after each scrape finishes, then sleeps for the remaining interval
            before starting the next cycle. Actual update frequency is scrape duration plus the
            configured delay. Overlapping scrapes are prevented. Changes apply on the next loop
            without restarting the process.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">
          The worker waits after each scrape finishes, then sleeps for the remaining interval
          before starting the next cycle. Actual update frequency is scrape duration plus the
          configured delay.
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Polling Interval
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatPollInterval(activeIntervalMs)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {POLL_PRESETS_MS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={activeIntervalMs === preset ? "primary" : "secondary"}
              disabled={presetSaving}
              onClick={() => applyPollInterval(preset)}
            >
              {formatPresetLabel(preset)}
            </Button>
          ))}
        </div>

        <div>
          <p className="cursor-default text-sm font-medium text-foreground">
            Custom interval: {formatPollInterval(sliderDraftMs)}
          </p>
          <p className="mt-1 cursor-default text-xs text-muted">
            Drag the slider to choose a value between 1 second and 60 minutes. The interval
            applies when you release the slider.
          </p>
          <input
            id="poll-slider"
            type="range"
            min={0}
            max={POLL_SLIDER_MAX_INDEX}
            step={1}
            value={sliderIndex}
            disabled={presetSaving}
            onChange={(event) =>
              setSliderDraftMs(sliderIndexToPollIntervalMs(Number(event.target.value)))
            }
            onPointerUp={commitSliderInterval}
            onKeyUp={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                commitSliderInterval();
              }
            }}
            className="mt-2 w-full cursor-pointer [&::-moz-range-thumb]:cursor-grab [&::-webkit-slider-thumb]:cursor-grab active:[&::-moz-range-thumb]:cursor-grabbing active:[&::-webkit-slider-thumb]:cursor-grabbing"
          />
        </div>

        {presetError ? <Alert variant="error">{presetError}</Alert> : null}

        <DisclosureSection title="Advanced settings" contentClassName="space-y-4">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="projectSlug" value={projectSlug} />
            <input type="hidden" name="engineId" value={engineId} />
            <input type="hidden" name="pollIntervalMs" value={String(advancedIntervalMs)} />

            <FormField
              id="pollIntervalAdvanced"
              name="pollIntervalAdvanced"
              label="Advanced interval (milliseconds)"
              value={String(advancedIntervalMs)}
              onChange={(event) =>
                setAdvancedIntervalMs(Number(event.target.value) || advancedIntervalMs)
              }
            />

            <div>
              <FormField
                id="detailsTtlMs"
                name="detailsTtlMs"
                label="Details cache TTL (ms)"
                defaultValue={String(settings.details_ttl_ms)}
              />
              <p className="mt-1 text-xs text-muted">
                How long per-lot detail pages remain cached before the scraper revisits them.
              </p>
            </div>
            <div>
              <FormField
                id="maxDetailChecks"
                name="maxDetailChecks"
                label="Maximum detail checks per cycle"
                defaultValue={String(settings.max_detail_checks_per_poll)}
              />
              <p className="mt-1 text-xs text-muted">
                Limits how many detail pages are refreshed during one scrape cycle.
              </p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="headless" defaultChecked={settings.headless} />
                Headless browser
              </label>
              <p className="mt-1 text-xs text-muted">
                Runs Puppeteer without a visible browser window. Requires an engine restart to
                apply.
              </p>
            </div>
            <p className="text-xs text-muted">
              Run Once executes a single scrape immediately, then returns to the configured
              desired state. Failed scrapes do not block the next scheduled interval, but they
              are logged and may trigger browser recovery before the next attempt.
            </p>

            {state.error ? <Alert variant="error">{state.error}</Alert> : null}
            {state.success ? <Alert variant="success">{state.success}</Alert> : null}

            <SubmitButton pendingLabel="Saving advanced settings…">
              Save Advanced Settings
            </SubmitButton>
          </form>
        </DisclosureSection>
      </div>
    </>
  );

  return embedded ? formContent : <Card>{formContent}</Card>;
}
