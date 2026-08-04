"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import {
  ENGINE_STATUS_CARD_CLASS,
  ENGINE_STATUS_CARD_ROW_CLASS,
  EngineStatusLabelPill,
} from "@/components/data-engines/webpage-scraper/EngineStatusCard";
import type { EngineActualState } from "@/lib/data-engines/constants";
import { formatActualState } from "@/lib/data-engines/format";
import type { DataEngineCommand } from "@/lib/data-engines/types";

type EngineStatePanelProps = {
  actualState: EngineActualState | string;
  activeCommand?: DataEngineCommand | null;
  controls?: ReactNode;
  statusDetail?: ReactNode;
  notification?: ReactNode;
  showNotificationArea?: boolean;
};

export const OPERATIONAL_STATE_STYLES: Record<string, string> = {
  Running: "border-success/30 bg-success/10 text-success",
  Starting: "border-success/30 bg-success/10 text-success",
  "Running Once": "border-success/30 bg-success/10 text-success",
  Restarting: "border-warning/30 bg-warning/10 text-warning",
  Stopping: "border-warning/30 bg-warning/10 text-warning",
  Stopped: "border-border bg-surface-raised text-muted",
  Offline: "border-border bg-surface-raised text-muted",
  Error: "border-danger/30 bg-danger/10 text-danger",
};

export function getOperationalStateLabel(
  actualState: string,
  activeCommand?: DataEngineCommand | null,
): string {
  if (
    activeCommand?.command === "run_once" &&
    actualState !== "stopped" &&
    actualState !== "offline"
  ) {
    return "Running Once";
  }

  if (
    activeCommand?.command === "restart" &&
    (actualState === "starting" || actualState === "stopping")
  ) {
    return "Restarting";
  }

  if (actualState === "offline") {
    return "Stopped";
  }

  return formatActualState(actualState as EngineActualState);
}

export function EngineStatePanel({
  actualState,
  activeCommand = null,
  controls,
  statusDetail,
  notification,
  showNotificationArea = true,
}: EngineStatePanelProps) {
  const displayState = getOperationalStateLabel(actualState, activeCommand);
  const stateStyle =
    OPERATIONAL_STATE_STYLES[displayState] ?? "border-border bg-surface-raised text-muted";

  return (
    <div className={ENGINE_STATUS_CARD_CLASS}>
      <div className={ENGINE_STATUS_CARD_ROW_CLASS}>
        <div className="min-w-0 flex-1 space-y-3">
          <EngineStatusLabelPill label="Engine State" pillClassName={stateStyle}>
            {displayState}
          </EngineStatusLabelPill>
          {statusDetail ? <div className="space-y-1">{statusDetail}</div> : null}
        </div>
        {controls ? (
          <div className="flex min-w-0 flex-wrap justify-start gap-2 sm:justify-end">
            {controls}
          </div>
        ) : null}
      </div>

      {showNotificationArea ? (
        <div
          className="mt-4 h-32 min-h-32 min-w-0 overflow-x-hidden overflow-y-hidden rounded-md border border-border/60 bg-surface/60 p-2"
          aria-live="polite"
        >
          {notification ? (
            <div className="min-w-0 space-y-2 break-words">{notification}</div>
          ) : (
            <p className="text-xs text-muted">No status messages.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function EngineStateNotification({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0 break-words" title={title}>
      {children}
    </div>
  );
}

export function EngineStateInlineAlert({
  variant,
  children,
}: {
  variant?: "error" | "success";
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 [&_.rounded-lg]:rounded-md [&_.rounded-lg]:px-3 [&_.rounded-lg]:py-2 [&_.text-sm]:text-xs">
      <Alert variant={variant}>{children}</Alert>
    </div>
  );
}
