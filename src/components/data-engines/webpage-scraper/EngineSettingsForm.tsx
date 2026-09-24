"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { updateScraperSettings } from "@/lib/data-engines/actions";
import { initialDataEngineActionState } from "@/lib/data-engines/state";
import { formatPollInterval } from "@/lib/data-engines/format";
import { snapPollIntervalMs } from "@/lib/data-engines/poll-interval";
import type { WebpageScraperSettings } from "@/lib/data-engines/types";

type EngineSettingsFormProps = {
  projectSlug: string;
  projectId: string;
  engineId: string;
  settings: WebpageScraperSettings;
  canConfigure: boolean;
  embedded?: boolean;
};

export function EngineSettingsForm({
  projectSlug,
  engineId,
  settings,
  canConfigure,
  embedded = false,
}: EngineSettingsFormProps) {
  const [advancedIntervalMs, setAdvancedIntervalMs] = useState(settings.poll_interval_ms);
  const [state, formAction] = useActionState(
    updateScraperSettings,
    initialDataEngineActionState,
  );

  useEffect(() => {
    startTransition(() => {
      setAdvancedIntervalMs(snapPollIntervalMs(settings.poll_interval_ms));
    });
  }, [settings.poll_interval_ms]);

  if (!canConfigure) {
    const readOnly = (
      <p className="text-sm text-muted">
        Interval: {formatPollInterval(settings.poll_interval_ms)}
      </p>
    );
    return embedded ? readOnly : <Card>{readOnly}</Card>;
  }

  const formContent = (
    <DisclosureSection title="Advanced Settings" contentClassName="space-y-4" defaultOpen={false}>
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
            Runs Puppeteer without a visible browser window. Requires an engine restart to apply.
          </p>
        </div>

        {state.error ? <Alert variant="error">{state.error}</Alert> : null}
        {state.success ? <Alert variant="success">{state.success}</Alert> : null}

        <SubmitButton pendingLabel="Saving advanced settings…">
          Save Advanced Settings
        </SubmitButton>
      </form>
    </DisclosureSection>
  );

  return embedded ? formContent : <Card>{formContent}</Card>;
}
