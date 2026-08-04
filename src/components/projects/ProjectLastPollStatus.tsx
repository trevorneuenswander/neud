"use client";

import { useEngineLastPollAt } from "@/lib/data-engines/engine-status-session-client";

type ProjectLastPollStatusProps = {
  engineId: string | null;
};

export function ProjectLastPollStatus({ engineId }: ProjectLastPollStatusProps) {
  const { relativeLastPoll } = useEngineLastPollAt(engineId);

  return (
    <div
      className="flex shrink-0 items-center gap-2 self-center whitespace-nowrap text-sm text-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="text-muted">Last Poll:</span>
      <span>{relativeLastPoll}</span>
    </div>
  );
}
