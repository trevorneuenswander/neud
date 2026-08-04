"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { formatTimeAgo } from "@/lib/data-engines/format";
import {
  subscribeToDesktopEngineStatus,
  type EngineStatusSnapshot,
} from "@/lib/desktop/client";

type EngineStatusSessionState = {
  snapshot: EngineStatusSnapshot | null;
  refCount: number;
  unsubscribe: (() => void) | null;
};

const engineSessions = new Map<string, EngineStatusSessionState>();
const statusListeners = new Set<() => void>();
const tickListeners = new Set<() => void>();

let nowMs = Date.now();
let tickIntervalId: number | null = null;
const SSR_NOW_MS = 0;

function ensureTickInterval() {
  if (tickIntervalId !== null || typeof window === "undefined") {
    return;
  }

  tickIntervalId = window.setInterval(() => {
    nowMs = Date.now();
    for (const listener of tickListeners) {
      listener();
    }
  }, 1000);
}

function releaseTickInterval() {
  if (tickListeners.size > 0 || tickIntervalId === null) {
    return;
  }

  window.clearInterval(tickIntervalId);
  tickIntervalId = null;
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function subscribeTick(listener: () => void) {
  tickListeners.add(listener);
  ensureTickInterval();
  return () => {
    tickListeners.delete(listener);
    releaseTickInterval();
  };
}

function emitStatusChange() {
  for (const listener of statusListeners) {
    listener();
  }
}

function ensureEngineStatusSession(engineId: string) {
  const existing = engineSessions.get(engineId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const session: EngineStatusSessionState = {
    snapshot: null,
    refCount: 1,
    unsubscribe: subscribeToDesktopEngineStatus(engineId, (snapshot) => {
      session.snapshot = snapshot;
      emitStatusChange();
    }),
  };

  engineSessions.set(engineId, session);
  return session;
}

function releaseEngineStatusSession(engineId: string) {
  const session = engineSessions.get(engineId);
  if (!session) return;

  session.refCount -= 1;
  if (session.refCount > 0) {
    return;
  }

  session.unsubscribe?.();
  engineSessions.delete(engineId);
}

export function useEngineStatusSession(engineId: string | null | undefined) {
  useEffect(() => {
    if (!engineId) return undefined;
    ensureEngineStatusSession(engineId);
    return () => {
      releaseEngineStatusSession(engineId);
    };
  }, [engineId]);

  return useSyncExternalStore(
    subscribeStatus,
    () => {
      if (!engineId) return null;
      return engineSessions.get(engineId)?.snapshot ?? null;
    },
    () => null,
  );
}

export function useEngineLastPollAt(engineId: string | null | undefined) {
  const snapshot = useEngineStatusSession(engineId);

  const now = useSyncExternalStore(
    subscribeTick,
    () => nowMs,
    () => SSR_NOW_MS,
  );

  const lastPollAt = snapshot?.lastRunSucceededAt ?? null;

  const formatRelative = useCallback(
    (value: string | null) => formatTimeAgo(value, now),
    [now],
  );

  return {
    lastPollAt,
    lastError: snapshot?.lastError ?? null,
    relativeLastPoll: formatRelative(lastPollAt),
  };
}
