"use client";

/**
 * In-app optimistic SEMA on-air source selection.
 * Lets the top-menu toggle and page LIVE/OFFLINE pills share state immediately
 * without waiting for the next poll. Authoritative persistence still goes through
 * the SEMA API; failed writes roll back via emitSemaSourceMode.
 */

export type SemaOnAirSourceMode = "google-sheets" | "manual";

type SemaSourceModeListener = (source: SemaOnAirSourceMode, generation: number) => void;

const listenersByProject = new Map<string, Set<SemaSourceModeListener>>();
const currentByProject = new Map<string, { mode: SemaOnAirSourceMode; generation: number }>();

function nextGeneration(projectSlug: string): number {
  const current = currentByProject.get(projectSlug);
  return (current?.generation ?? 0) + 1;
}

export function getSemaSourceModeSnapshot(
  projectSlug: string,
): { mode: SemaOnAirSourceMode; generation: number } | null {
  return currentByProject.get(projectSlug) ?? null;
}

export function emitSemaSourceMode(projectSlug: string, mode: SemaOnAirSourceMode): number {
  const generation = nextGeneration(projectSlug);
  currentByProject.set(projectSlug, { mode, generation });
  const listeners = listenersByProject.get(projectSlug);
  if (listeners) {
    for (const listener of listeners) {
      listener(mode, generation);
    }
  }
  return generation;
}

/**
 * Apply a polled/server value only when it is at least as new as the last
 * optimistic emit (or when no optimistic state exists yet).
 */
export function applyAuthoritativeSemaSourceMode(
  projectSlug: string,
  mode: SemaOnAirSourceMode,
  minGeneration = 0,
): number | null {
  const current = currentByProject.get(projectSlug);
  if (current && current.generation > minGeneration && current.mode !== mode) {
    // A newer optimistic selection is in flight — ignore this older snapshot.
    return null;
  }
  if (current && current.mode === mode) {
    return current.generation;
  }
  return emitSemaSourceMode(projectSlug, mode);
}

export function subscribeToSemaSourceMode(
  projectSlug: string,
  onChange: SemaSourceModeListener,
): () => void {
  let listeners = listenersByProject.get(projectSlug);
  if (!listeners) {
    listeners = new Set();
    listenersByProject.set(projectSlug, listeners);
  }
  listeners.add(onChange);
  const snapshot = currentByProject.get(projectSlug);
  if (snapshot) {
    onChange(snapshot.mode, snapshot.generation);
  }

  return () => {
    listeners?.delete(onChange);
    if (listeners && listeners.size === 0) {
      listenersByProject.delete(projectSlug);
    }
  };
}
