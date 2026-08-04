"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { isSnapshotStale } from "@/lib/data-engines/health";
import { formatRelativeTime } from "@/lib/data-engines/format";
import type { DataEngineSnapshot } from "@/lib/data-engines/types";

type JsonViewerProps = {
  snapshot: DataEngineSnapshot | null;
  pollIntervalMs: number;
};

type JsonTab = "formatted" | "raw" | "structure";

function buildStructure(value: unknown, depth = 0): string[] {
  if (depth > 4) return ["  ".repeat(depth) + "…"];
  if (value === null) return ["  ".repeat(depth) + "null"];
  if (Array.isArray(value)) {
    return [
      "  ".repeat(depth) + `[array: ${value.length}]`,
      ...value.slice(0, 5).flatMap((item, index) => [
        "  ".repeat(depth + 1) + `[${index}]`,
        ...buildStructure(item, depth + 2),
      ]),
      ...(value.length > 5 ? ["  ".repeat(depth + 1) + `… ${value.length - 5} more`] : []),
    ];
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
      "  ".repeat(depth) + key,
      ...buildStructure(item, depth + 1),
    ]);
  }
  return ["  ".repeat(depth) + String(value)];
}

export function JsonViewer({ snapshot, pollIntervalMs }: JsonViewerProps) {
  const [tab, setTab] = useState<JsonTab>("formatted");

  const formatted = useMemo(
    () => (snapshot ? JSON.stringify(snapshot.data, null, 2) : ""),
    [snapshot],
  );
  const raw = useMemo(
    () => (snapshot ? JSON.stringify(snapshot.data) : ""),
    [snapshot],
  );
  const structure = useMemo(
    () => (snapshot ? buildStructure(snapshot.data).join("\n") : ""),
    [snapshot],
  );

  if (!snapshot) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-foreground">JSON Preview</h3>
        <EmptyState
          title="No snapshot yet"
          description="Run the scraper to capture the first JSON snapshot."
        />
      </Card>
    );
  }

  const stale = isSnapshotStale(snapshot, pollIntervalMs);

  async function copyJson() {
    await navigator.clipboard.writeText(formatted);
  }

  function downloadJson() {
    const blob = new Blob([formatted], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `engine-snapshot-${snapshot?.id ?? "latest"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">JSON Preview</h3>
          <p className="mt-1 text-xs text-muted">
            Captured {formatRelativeTime(snapshot.captured_at)}
            {stale ? " · Stale" : " · Fresh"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={copyJson}>
            Copy JSON
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={downloadJson}>
            Download
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {(["formatted", "raw", "structure"] as JsonTab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium capitalize ${
              tab === value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-surface text-muted"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <pre className="mt-4 max-h-[480px] overflow-auto rounded-md border border-border bg-background p-4 font-mono text-xs text-foreground">
        {tab === "formatted" ? formatted : tab === "raw" ? raw : structure}
      </pre>
    </Card>
  );
}
