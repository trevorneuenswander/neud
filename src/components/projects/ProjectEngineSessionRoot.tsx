"use client";

import type { ReactNode } from "react";
import { useEngineExecutionLogSession } from "@/lib/data-engines/execution-log-session-client";
import { useEngineStatusSession } from "@/lib/data-engines/engine-status-session-client";
import { useActivitySession } from "@/lib/desktop/activity-session-client";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type ProjectEngineSessionRootProps = {
  engineId: string | null;
  children: ReactNode;
};

export function ProjectEngineSessionRoot({
  engineId,
  children,
}: ProjectEngineSessionRootProps) {
  if (shouldUseLocalDataClient()) {
    return (
      <ProjectEngineSessionCollector engineId={engineId}>
        {children}
      </ProjectEngineSessionCollector>
    );
  }

  return children;
}

function ProjectEngineSessionCollector({
  engineId,
  children,
}: {
  engineId: string | null;
  children: ReactNode;
}) {
  useActivitySession();
  if (engineId) {
    return (
      <ProjectExecutionLogCollector engineId={engineId}>
        {children}
      </ProjectExecutionLogCollector>
    );
  }
  return children;
}

function ProjectExecutionLogCollector({
  engineId,
  children,
}: {
  engineId: string;
  children: ReactNode;
}) {
  useEngineExecutionLogSession(engineId);
  useEngineStatusSession(engineId);
  return children;
}
