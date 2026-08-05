"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import {
  ENGINE_STATUS_CARD_CLASS,
  ENGINE_STATUS_CARD_ROW_CLASS,
  EngineStatusLabelPill,
} from "@/components/data-engines/webpage-scraper/EngineStatusCard";
import {
  getOperationalStateLabel,
  OPERATIONAL_STATE_STYLES,
} from "@/lib/data-engines/operational-state";
import type { DataEngineCommand } from "@/lib/data-engines/types";

export { getOperationalStateLabel, OPERATIONAL_STATE_STYLES };

type EngineStatePanelProps = {
  actualState: string;
  activeCommand?: DataEngineCommand | null;
  controls?: ReactNode;
  statusDetail?: ReactNode;
  notification?: ReactNode;
  showNotificationArea?: boolean;
};

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
