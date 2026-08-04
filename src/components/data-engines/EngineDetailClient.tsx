"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useEngineExecutionLogSession } from "@/lib/data-engines/execution-log-session-client";
import { EngineHealthBadge } from "@/components/data-engines/EngineHealthBadge";
import { EngineStateBadge } from "@/components/data-engines/EngineStateBadge";
import { BroadArrowConfigurationForm } from "@/components/data-engines/webpage-scraper/BroadArrowConfigurationForm";
import { BagExecutionLog } from "@/components/data-engines/webpage-scraper/BagExecutionLog";
import { BagLiveStateJsonPreview } from "@/components/data-engines/webpage-scraper/BagLiveStateJsonPreview";
import { GenericPreview } from "@/components/data-engines/webpage-scraper/GenericPreview";
import { GenericScraperConfig } from "@/components/data-engines/webpage-scraper/GenericScraperConfig";
import { ControlDiagnostics } from "@/components/data-engines/webpage-scraper/ControlDiagnostics";
import { DesktopExecutionPanel } from "@/components/data-engines/webpage-scraper/DesktopEnginePanel";
import { EngineControls } from "@/components/data-engines/webpage-scraper/EngineControls";
import { EngineSettingsForm } from "@/components/data-engines/webpage-scraper/EngineSettingsForm";
import { JsonViewer } from "@/components/data-engines/webpage-scraper/JsonViewer";
import { RuntimeDiagnostics } from "@/components/data-engines/webpage-scraper/RuntimeDiagnostics";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { DataSourceStatusPill } from "@/components/ui/DataSourceStatusPill";
import { PageHeader } from "@/components/portal/PageHeader";
import { pickLegacyPreviewFields } from "@/lib/bag/live-state-preview";
import { calculateEngineHealth } from "@/lib/data-engines/health";
import {
  getBroadArrowConfigurationState,
  getEngineControlState,
  isBroadArrowConfigurationError,
  normalizeActiveCommand,
} from "@/lib/data-engines/control-state";
import { ADAPTER_LABELS } from "@/lib/data-engines/generic-scraper-types";
import { isGenericWebpageSnapshot } from "@/lib/data-engines/generic-scraper-types";
import { formatRelativeTime } from "@/lib/data-engines/format";
import { localGetEngineDetail } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { createClient } from "@/lib/supabase/client";
import type { BagSnapshotData } from "@/lib/data-engines/types";
import type {
  DataEngine,
  DataEngineCommand,
  DataEngineLog,
  DataEngineSnapshot,
  DataEngineStatus,
  WebpageScraperSettings,
  WebpageScraperSource,
} from "@/lib/data-engines/types";

type EngineDetailClientProps = {
  projectSlug: string;
  projectId: string;
  projectType: string;
  engine: DataEngine;
  initialStatus: DataEngineStatus | null;
  initialSettings: WebpageScraperSettings | null;
  initialSources: WebpageScraperSource[];
  initialSnapshot: DataEngineSnapshot | null;
  initialRecentSnapshots?: DataEngineSnapshot[];
  initialLogs: DataEngineLog[];
  initialPendingCommand: DataEngineCommand | null;
  initialLatestCommand: DataEngineCommand | null;
  initialActiveCommandCount: number;
  canControl: boolean;
  canConfigure: boolean;
  accessLevel: "admin" | "manager" | "operator" | "viewer";
  showControlDiagnostics: boolean;
  bagContamination?: { untouchedKeys: string[] } | null;
  adapterContamination?: { adapter: string } | null;
  canRecoverStaleCommand: boolean;
  showPageHeader?: boolean;
  canDeveloperTools?: boolean;
};

function snapshotToBagPreview(snapshot: DataEngineSnapshot | null): BagSnapshotData | null {
  if (!snapshot?.data || typeof snapshot.data !== "object") {
    return null;
  }

  const data = snapshot.data as Record<string, unknown>;
  return pickLegacyPreviewFields({
    prev: (data.prev as BagSnapshotData["prev"]) ?? null,
    current: (data.current as BagSnapshotData["current"]) ?? null,
    next: (data.next as BagSnapshotData["next"]) ?? [],
    lots: (data.lots as BagSnapshotData["lots"]) ?? [],
    lastSold: (data.lastSold as BagSnapshotData["lastSold"]) ?? null,
    auctionDisplay: (data.auctionDisplay as BagSnapshotData["auctionDisplay"]) ?? null,
    updatedAt: (data.updatedAt as string | undefined) ?? snapshot.captured_at,
  });
}

export function EngineDetailClient({
  projectSlug,
  projectId,
  projectType,
  engine,
  initialStatus,
  initialSettings,
  initialSources,
  initialSnapshot,
  initialLogs,
  initialPendingCommand,
  initialLatestCommand,
  initialActiveCommandCount,
  canControl,
  canConfigure,
  accessLevel,
  showControlDiagnostics,
  canRecoverStaleCommand,
  adapterContamination = null,
  showPageHeader = false,
  canDeveloperTools = false,
}: EngineDetailClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [logs, setLogs] = useState(initialLogs);
  const [scraperSettings, setScraperSettings] = useState(initialSettings);
  const [desiredState, setDesiredState] = useState(engine.desired_state);
  const { logs: sessionExecutionLogs, clearSessionLogs } =
    useEngineExecutionLogSession(engine.id);
  const [realtimeCommand, setRealtimeCommand] = useState<DataEngineCommand | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(true);

  useEffect(() => {
    setScraperSettings(initialSettings);
  }, [initialSettings]);

  const handlePollIntervalChange = useCallback((pollIntervalMs: number) => {
    setScraperSettings((current) =>
      current ? { ...current, poll_interval_ms: pollIntervalMs } : current,
    );
  }, []);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const refreshDetail = useCallback(() => {
    void localGetEngineDetail(engine.id).then((bundle) => {
      setStatus((bundle.status as DataEngineStatus | null | undefined) ?? null);
      setSnapshot(
        (bundle.latestSnapshot as DataEngineSnapshot | null | undefined) ?? null,
      );
      setLogs((bundle.logs as DataEngineLog[] | undefined) ?? []);
      const nextEngine = bundle.engine as DataEngine | undefined;
      if (nextEngine?.desired_state) {
        setDesiredState(nextEngine.desired_state);
      }
    });
  }, [engine.id]);

  const activeCommand =
    normalizeActiveCommand(initialPendingCommand) ??
    normalizeActiveCommand(realtimeCommand);

  const actualState = status?.actual_state ?? "offline";

  useEffect(() => {
    if (shouldUseLocalDataClient()) {
      let cancelled = false;

      const poll = async () => {
        try {
          const bundle = await localGetEngineDetail(engine.id);
          if (cancelled) return;

          setStatus((bundle.status as DataEngineStatus | null | undefined) ?? null);
          setSnapshot(
            (bundle.latestSnapshot as DataEngineSnapshot | null | undefined) ?? null,
          );
          setLogs((bundle.logs as DataEngineLog[] | undefined) ?? []);
          const nextEngine = bundle.engine as DataEngine | undefined;
          if (nextEngine?.desired_state) {
            setDesiredState(nextEngine.desired_state);
          }
          setRealtimeConnected(true);
        } catch {
          if (!cancelled) {
            setRealtimeConnected(false);
          }
        }
      };

      void poll();
      const pollMs =
        actualState === "running" ||
        actualState === "starting" ||
        desiredState === "running"
          ? 1000
          : 2000;
      const interval = window.setInterval(() => {
        void poll();
      }, pollMs);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`engine-${engine.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "data_engine_status",
          filter: `engine_id=eq.${engine.id}`,
        },
        (payload) => {
          setStatus(payload.new as DataEngineStatus);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "data_engine_snapshots",
          filter: `engine_id=eq.${engine.id}`,
        },
        (payload) => {
          const next = payload.new as DataEngineSnapshot;
          setSnapshot(next);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "data_engine_logs",
          filter: `engine_id=eq.${engine.id}`,
        },
        () => {
          refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "data_engine_commands",
          filter: `engine_id=eq.${engine.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as DataEngineCommand;
            setRealtimeCommand((current) =>
              current?.id === deleted.id ? null : current,
            );
          } else {
            setRealtimeCommand(
              normalizeActiveCommand(payload.new as DataEngineCommand),
            );
          }
          refresh();
        },
      )
      .subscribe((subscriptionStatus) => {
        setRealtimeConnected(subscriptionStatus === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [engine.id, desiredState, actualState, refresh]);

  const settings = scraperSettings;
  const latestCommand = initialLatestCommand;
  const activeCommandCount = initialActiveCommandCount;
  const controlState = getEngineControlState({
    canControl,
    actualState,
    desiredState,
    activeCommand,
  });

  const pollIntervalMs = settings?.poll_interval_ms ?? 5000;
  const health = useMemo(
    () =>
      status
        ? calculateEngineHealth(status, desiredState, pollIntervalMs, snapshot)
        : "unknown",
    [status, desiredState, pollIntervalMs, snapshot],
  );

  const adapter =
    typeof engine.config?.adapter === "string" ? engine.config.adapter : null;
  const adapterLabel =
    adapter && adapter in ADAPTER_LABELS
      ? ADAPTER_LABELS[adapter as keyof typeof ADAPTER_LABELS]
      : adapter;
  const isGenericProject = projectType === "webpage-scraper";
  const isBagProject = projectType === "bag-graphics";
  const genericData =
    snapshot?.data && isGenericWebpageSnapshot(snapshot.data) ? snapshot.data : null;
  const bagFallbackPreview = useMemo(
    () => snapshotToBagPreview(snapshot),
    [snapshot],
  );
  const pollJsonWhileActive =
    desiredState === "running" ||
    actualState === "running" ||
    actualState === "starting" ||
    activeCommand?.command === "run_once";

  const executionLogActive =
    desiredState === "running" ||
    actualState === "running" ||
    actualState === "starting" ||
    actualState === "error" ||
    activeCommand?.command === "run_once";

  const broadArrowConfiguration = useMemo(
    () => getBroadArrowConfigurationState(initialSources),
    [initialSources],
  );
  const showBroadArrowConfigWarning = isBagProject && !broadArrowConfiguration.complete;
  const showOperationalError =
    status?.last_error && !isBroadArrowConfigurationError(status.last_error);

  return (
    <div className="space-y-6">
      {isBagProject ? (
        <PageHeader
          title="Webpage Scraper"
          description="The scraper runs locally on this computer. Keep the desktop app open while it is running."
          action={<DataSourceStatusPill pageSource="webpage-scraper" />}
        />
      ) : (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-foreground">Webpage Scraper</h2>
              {adapterLabel ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {adapterLabel}
                </span>
              ) : null}
            </div>
          {showPageHeader ? <p className="text-sm text-muted">{engine.name}</p> : null}
        </div>
      )}

      {isBagProject ? (
        <>
          {showBroadArrowConfigWarning ? (
            <Alert>{broadArrowConfiguration.message}</Alert>
          ) : null}

          <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-2">
            <Card className="flex h-full min-w-0 flex-col overflow-hidden">
              <h3 className="text-sm font-semibold text-foreground">
                Operational Controls
              </h3>
              <div className="mt-4 flex min-w-0 flex-1 flex-col gap-4">
                <EngineControls
                  projectId={projectId}
                  projectSlug={projectSlug}
                  engine={engine}
                  actualState={actualState}
                  desiredState={desiredState}
                  canControl={canControl}
                  activeCommand={activeCommand}
                  canRecoverStaleCommand={canRecoverStaleCommand}
                  status={status}
                  logs={logs}
                  onRefresh={refreshDetail}
                  suppressConfigurationErrors={showBroadArrowConfigWarning}
                  layout="inline-state"
                  showNotificationArea={false}
                  operationalError={
                    showOperationalError ? (status?.last_error ?? null) : null
                  }
                  realtimeDisconnected={!realtimeConnected}
                />

                {settings ? (
                  <EngineSettingsForm
                    projectSlug={projectSlug}
                    engineId={engine.id}
                    settings={settings}
                    canConfigure={canConfigure}
                    embedded
                    onPollIntervalChange={handlePollIntervalChange}
                    onSettingsPersisted={refreshDetail}
                  />
                ) : (
                  <p className="text-sm text-muted">Polling settings are unavailable.</p>
                )}
              </div>
            </Card>

            <Card className="flex h-full min-w-0 flex-col overflow-hidden">
              <h3 className="text-sm font-semibold text-foreground">
                Runtime Diagnostics
              </h3>
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                <RuntimeDiagnostics
                  status={status}
                  logs={logs}
                  pollIntervalMs={pollIntervalMs}
                  actualState={actualState}
                  health={health}
                  embedded
                  engineId={engine.id}
                />
              </div>
            </Card>
          </div>

          <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-2">
            <Card className="flex h-[28rem] min-w-0 flex-col overflow-hidden">
              <BagExecutionLog
                logs={sessionExecutionLogs}
                isActive={executionLogActive}
                onClear={() => void clearSessionLogs()}
                embedded
              />
            </Card>

            <Card className="flex h-[28rem] min-w-0 flex-col overflow-hidden">
              <h3 className="text-sm font-semibold text-foreground">JSON Preview</h3>
              <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <BagLiveStateJsonPreview
                  projectId={projectId}
                  fallbackSnapshot={bagFallbackPreview}
                  pollWhileActive={pollJsonWhileActive}
                  embedded
                  className="h-full"
                />
              </div>
            </Card>
          </div>

          <BroadArrowConfigurationForm
            engineId={engine.id}
            sources={initialSources}
            canConfigure={canConfigure}
            canControl={canControl}
          />

          {canDeveloperTools && shouldUseLocalDataClient() ? (
            <div className="flex justify-end">
              <Button
                href={`/projects/${projectSlug}/data-engines/${engine.id}/developer-tools`}
                size="sm"
                variant="secondary"
              >
                Developer Tools
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <EngineHealthBadge health={health} />
            {status ? <EngineStateBadge state={status.actual_state} /> : null}
            <span className="text-sm text-muted">
              Desired: {engine.desired_state === "running" ? "Running" : "Stopped"}
            </span>
            {status?.last_run_succeeded_at ? (
              <span className="text-sm text-muted">
                Last poll {formatRelativeTime(status.last_run_succeeded_at)}
              </span>
            ) : null}
          </div>
          {!realtimeConnected ? (
            <div className="mt-4">
              <Alert variant="error">
                Live updates disconnected. Use refresh or reload the page.
              </Alert>
            </div>
          ) : null}
          {status?.last_error ? (
            <div className="mt-4">
              <Alert variant="error">{status.last_error}</Alert>
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <EngineControls
              projectId={projectId}
              projectSlug={projectSlug}
              engine={engine}
              actualState={actualState}
              desiredState={engine.desired_state}
              canControl={canControl}
              activeCommand={activeCommand}
              canRecoverStaleCommand={canRecoverStaleCommand}
              status={status}
              logs={logs}
              onRefresh={refreshDetail}
            />

            <DesktopExecutionPanel projectType={projectType} engine={engine} />
            <RuntimeDiagnostics status={status} logs={logs} engineId={engine.id} />
          </div>

          {showControlDiagnostics ? (
            <div className="mt-4">
              <ControlDiagnostics
                accessLevel={accessLevel}
                canControl={canControl}
                desiredState={engine.desired_state}
                actualState={actualState}
                status={status}
                controlState={controlState}
              />
            </div>
          ) : null}
        </Card>

        {settings ? (
          <Card>
            <h3 className="text-sm font-semibold text-foreground">Polling</h3>
            <div className="mt-4">
              <EngineSettingsForm
                projectSlug={projectSlug}
                engineId={engine.id}
                settings={settings}
                canConfigure={canConfigure}
                embedded
                onPollIntervalChange={handlePollIntervalChange}
                onSettingsPersisted={refreshDetail}
              />
            </div>
          </Card>
        ) : (
          <Card>
            <h3 className="text-sm font-semibold text-foreground">Polling</h3>
            <p className="mt-3 text-sm text-muted">Polling settings are unavailable.</p>
          </Card>
        )}
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">JSON Preview</h3>
        {isBagProject ? (
          <BagLiveStateJsonPreview
            projectId={projectId}
            fallbackSnapshot={bagFallbackPreview}
            pollWhileActive={pollJsonWhileActive}
          />
        ) : (
          <JsonViewer snapshot={snapshot} pollIntervalMs={pollIntervalMs} />
        )}
        {genericData ? <GenericPreview data={genericData} /> : null}
      </section>

      {isGenericProject ? (
        <GenericScraperConfig
          projectSlug={projectSlug}
          engine={engine}
          sources={initialSources}
          canConfigure={canConfigure}
          canControl={canControl}
          adapterContamination={adapterContamination}
          layout="columns"
        />
      ) : null}

      {!isBagProject && canDeveloperTools && shouldUseLocalDataClient() ? (
        <div className="flex justify-end">
          <Button
            href={`/projects/${projectSlug}/data-engines/${engine.id}/developer-tools`}
            size="sm"
            variant="secondary"
          >
            Developer Tools
          </Button>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
