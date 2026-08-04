"use client";

import { Card } from "@/components/ui/Card";
import { ActivityEmptyState } from "@/components/activity/ActivityEmptyState";
import { ActivityFullView } from "@/components/activity/ActivityFullView";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

export function GlobalActivityFullView() {
  if (!shouldUseLocalDataClient()) {
    return (
      <Card>
        <ActivityEmptyState
          title="Activity unavailable"
          description="Activity logging is available in the desktop app."
        />
      </Card>
    );
  }

  return <ActivityFullView scope="global" />;
}
