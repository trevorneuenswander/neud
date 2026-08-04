"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  formatBagDiagnosticTime,
  isBagDiagnosticLog,
} from "@/lib/data-engines/bag-diagnostic-log";
import type { DataEngineLog } from "@/lib/data-engines/types";

type BagExecutionLogProps = {
  logs: DataEngineLog[];
  isActive: boolean;
  onClear: () => void;
  embedded?: boolean;
};

function formatDiagnosticEntry(log: DataEngineLog): string {
  return log.message;
}

export function BagExecutionLog({
  logs,
  isActive,
  onClear,
  embedded = false,
}: BagExecutionLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const diagnosticLogs = useMemo(() => logs, [logs]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const element = containerRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [diagnosticLogs, scrollToBottom]);

  const handleClear = useCallback(() => {
    onClear();
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    });
  }, [onClear]);

  const header = (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">Execution log</h3>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">{isActive ? "Live" : "Idle"}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={diagnosticLogs.length === 0}
          onClick={handleClear}
        >
          Clear
        </Button>
      </div>
    </div>
  );

  const logBody = (
    <div
      ref={containerRef}
      className={`min-h-0 overflow-y-auto rounded-md border border-border bg-surface px-3 py-3 font-mono text-xs leading-6 ${
        embedded ? "flex-1" : "max-h-96"
      }`}
    >
      {diagnosticLogs.length === 0 ? (
        <p className="text-muted">
          {isActive
            ? "Waiting for scraper diagnostics…"
            : "Start the engine or run once to view execution diagnostics."}
        </p>
      ) : (
        <ul className="space-y-3">
          {diagnosticLogs.map((log) => (
            <li
              key={`${log.id}-${log.created_at}`}
              className={
                log.level === "error" || log.metadata?.failed === true
                  ? "text-danger whitespace-pre-wrap"
                  : "text-foreground whitespace-pre-wrap"
              }
            >
              <span className="text-muted">{formatBagDiagnosticTime(log.created_at)}</span>{" "}
              {formatDiagnosticEntry(log)}
              {isBagDiagnosticLog(log) &&
              Array.isArray(log.metadata?.legacyComparisonWarnings) &&
              log.metadata.legacyComparisonWarnings.length > 0 ? (
                <div className="mt-1 text-warning">
                  Legacy comparison:{" "}
                  {(log.metadata.legacyComparisonWarnings as string[]).join(" ")}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        <div className="mt-4 flex min-h-0 flex-1 flex-col">{logBody}</div>
      </div>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col">
      {header}
      <div className="mt-4 min-h-0">{logBody}</div>
    </Card>
  );
}
