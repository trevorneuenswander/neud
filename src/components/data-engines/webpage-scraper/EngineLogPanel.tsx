"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { DataEngineLog } from "@/lib/data-engines/types";
import type { LogLevel } from "@/lib/data-engines/constants";

type EngineLogPanelProps = {
  logs: DataEngineLog[];
  onRefresh?: () => void;
};

const levelStyles: Record<LogLevel, string> = {
  info: "text-foreground",
  warning: "text-warning",
  error: "text-danger",
};

export function EngineLogPanel({ logs, onRefresh }: EngineLogPanelProps) {
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const filtered =
    filter === "all" ? logs : logs.filter((log) => log.level === filter);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Operational log</h3>
        <div className="flex flex-wrap gap-2">
          {(["all", "info", "warning", "error"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "primary" : "secondary"}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value}
            </Button>
          ))}
          {onRefresh ? (
            <Button type="button" size="sm" variant="secondary" onClick={onRefresh}>
              Refresh
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 max-h-80 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted">No log entries yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((log) => (
              <li key={log.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  <span className={`text-xs uppercase ${levelStyles[log.level]}`}>
                    {log.level}
                  </span>
                  <span className="text-xs text-muted">{log.event_type}</span>
                </div>
                <p className={`mt-1 ${levelStyles[log.level]}`}>{log.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
