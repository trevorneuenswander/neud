"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { DataEngineLog } from "@/lib/data-engines/types";
import type { LogLevel } from "@/lib/data-engines/constants";
import {
  clearDesktopExecutionLogSession,
  subscribeToDesktopExecutionLogs,
} from "@/lib/desktop/client";
import { isDesktopEnvironment } from "@/lib/desktop/client";

type SessionExecutionLogEntry = {
  sequenceId: number;
  id: string;
  engine_id: string;
  level: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const EMPTY_EXECUTION_LOG_ENTRIES: SessionExecutionLogEntry[] = [];

type EngineSessionState = {
  entries: SessionExecutionLogEntry[];
  lastSequenceId: number;
  refCount: number;
  unsubscribe: (() => void) | null;
};

const engineSessions = new Map<string, EngineSessionState>();
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toDataEngineLog(entry: SessionExecutionLogEntry): DataEngineLog {
  const parsedId = Number(entry.id);
  const level: LogLevel =
    entry.level === "error" || entry.level === "warning" ? entry.level : "info";

  return {
    id: Number.isFinite(parsedId) ? parsedId : entry.sequenceId,
    engine_id: entry.engine_id,
    level,
    event_type: entry.event_type,
    message: entry.message,
    metadata: entry.metadata ?? {},
    created_at: entry.created_at,
  };
}

function ensureEngineSession(engineId: string) {
  const existing = engineSessions.get(engineId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const session: EngineSessionState = {
    entries: [],
    lastSequenceId: 0,
    refCount: 1,
    unsubscribe: null,
  };

  if (isDesktopEnvironment()) {
    session.unsubscribe = subscribeToDesktopExecutionLogs(engineId, {
      onSnapshot: (entries) => {
        session.entries = entries;
        session.lastSequenceId = entries.at(-1)?.sequenceId ?? 0;
        emitChange();
      },
      onEntry: (entry) => {
        if (entry.sequenceId <= session.lastSequenceId) {
          return;
        }
        session.lastSequenceId = entry.sequenceId;
        session.entries = [...session.entries, entry];
        emitChange();
      },
    });
  }

  engineSessions.set(engineId, session);
  return session;
}

function releaseEngineSession(engineId: string) {
  const session = engineSessions.get(engineId);
  if (!session) return;

  session.refCount -= 1;
  if (session.refCount > 0) {
    return;
  }

  session.unsubscribe?.();
  engineSessions.delete(engineId);
}

export function useEngineExecutionLogSession(engineId: string | null | undefined) {
  useEffect(() => {
    if (!engineId) return undefined;
    ensureEngineSession(engineId);
    return () => {
      releaseEngineSession(engineId);
    };
  }, [engineId]);

  const entries = useSyncExternalStore(
    subscribe,
    () => {
      if (!engineId) return EMPTY_EXECUTION_LOG_ENTRIES;
      return engineSessions.get(engineId)?.entries ?? EMPTY_EXECUTION_LOG_ENTRIES;
    },
    () => EMPTY_EXECUTION_LOG_ENTRIES,
  );

  const logs = useMemo(() => entries.map(toDataEngineLog), [entries]);

  const clearSessionLogs = useCallback(async () => {
    if (!engineId) return;
    const session = engineSessions.get(engineId);
    if (session) {
      session.entries = [];
      session.lastSequenceId = 0;
      emitChange();
    }
    if (isDesktopEnvironment()) {
      await clearDesktopExecutionLogSession(engineId);
    }
  }, [engineId]);

  return { logs, clearSessionLogs };
}
