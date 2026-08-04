"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ActivityEvent } from "@/lib/desktop/types";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import {
  filterActivityEventsForProject,
  getActivityScopeKey,
  type ActivityProjectScope,
} from "@/lib/activity/filter";

type ActivitySessionState = {
  entries: ActivityEvent[];
  refCount: number;
  unsubscribe: (() => void) | null;
};

let session: ActivitySessionState = {
  entries: [],
  refCount: 0,
  unsubscribe: null,
};

const EMPTY_ACTIVITY_ENTRIES: ActivityEvent[] = [];

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

function ensureActivitySession() {
  session.refCount += 1;
  if (session.unsubscribe) {
    return;
  }

  const api = getDesktopAPI()?.activity;
  if (!api) {
    return;
  }

  void api.subscribe();
  const unsubscribeSnapshot = api.onSnapshot((payload) => {
    session.entries = payload.entries;
    emitChange();
  });
  const unsubscribeEntry = api.onEntry((payload) => {
    session.entries = [payload.entry, ...session.entries];
    emitChange();
  });

  session.unsubscribe = () => {
    unsubscribeSnapshot();
    unsubscribeEntry();
    void api.unsubscribe();
  };
}

function releaseActivitySession() {
  session.refCount -= 1;
  if (session.refCount > 0) return;
  session.unsubscribe?.();
  session = {
    entries: [],
    refCount: 0,
    unsubscribe: null,
  };
  emitChange();
}

export function useActivitySession() {
  useEffect(() => {
    if (!isDesktopEnvironment()) return undefined;
    ensureActivitySession();
    return () => {
      releaseActivitySession();
    };
  }, []);

  const entries = useSyncExternalStore(
    subscribe,
    () => session.entries,
    () => EMPTY_ACTIVITY_ENTRIES,
  );

  const recordActivity = useCallback(
    async (payload: {
      type: string;
      message: string;
      source?: string;
      severity?: ActivityEvent["severity"];
      metadata?: Record<string, unknown>;
    }) => {
      const api = getDesktopAPI()?.activity;
      if (!api) return null;
      return api.record(payload);
    },
    [],
  );

  return { entries, recordActivity };
}

export function useProjectActivityEntries(scope: ActivityProjectScope): ActivityEvent[] {
  const { entries } = useActivitySession();
  const scopeKey = getActivityScopeKey("project", scope.projectId);

  return useMemo(
    () => filterActivityEventsForProject(entries, scope),
    [entries, scope, scopeKey],
  );
}

export function useGlobalActivityEntries(): ActivityEvent[] {
  const { entries } = useActivitySession();
  const scopeKey = getActivityScopeKey("global");

  return useMemo(() => entries, [entries, scopeKey]);
}

export async function recordDesktopActivity(payload: {
  type: string;
  message: string;
  source?: string;
  severity?: ActivityEvent["severity"];
  metadata?: Record<string, unknown>;
  userAction?: string;
}) {
  const api = getDesktopAPI()?.activity;
  if (!api) return null;
  return api.record(payload);
}

export {
  getDesktopDisplayDataSource,
  setDesktopDisplayDataSource,
  subscribeToDesktopDisplayDataSource,
} from "@/lib/desktop/display-data-source-client";
