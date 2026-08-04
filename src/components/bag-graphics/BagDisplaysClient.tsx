"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ProjectDisplay } from "@/lib/displays/types";

type BagDisplaysClientProps = {
  displays: ProjectDisplay[];
};

export function BagDisplaysClient({ displays }: BagDisplaysClientProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopyMessage("Display URL copied.");
  }

  if (displays.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">No displays are configured for this project yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {copyMessage ? <Alert>{copyMessage}</Alert> : null}
      {displays.map((display) => (
        <Card key={display.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{display.name}</h3>
              <p className="mt-1 text-xs text-muted">
                {display.display_type} · {display.width ?? "—"} × {display.height ?? "—"} ·{" "}
                {display.background ?? "default background"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void copyUrl(display.url)}
              >
                Copy vMix URL
              </Button>
              <a
                href={display.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primary/90"
              >
                Open in vMix
              </a>
            </div>
          </div>
          <p className="mt-3 break-all text-sm text-muted">{display.url}</p>
        </Card>
      ))}
    </div>
  );
}
