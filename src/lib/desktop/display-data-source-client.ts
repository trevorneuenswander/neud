"use client";

import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";

type DisplayDataSourceListener = (source: DisplayDataSource) => void;

let currentSource: DisplayDataSource = "webpage-scraper";
let refCount = 0;
let teardown: (() => void) | null = null;
const listeners = new Set<DisplayDataSourceListener>();

function emit(source: DisplayDataSource) {
  currentSource = source;
  for (const listener of listeners) {
    listener(source);
  }
}

function ensureSubscription() {
  refCount += 1;
  if (teardown) {
    return;
  }

  const api = getDesktopAPI()?.displayDataSource;
  if (!api) {
    return;
  }

  void api.get().then((source) => {
    emit(source);
  });

  void api.subscribe();
  const removeListener = api.onChanged((payload) => {
    emit(payload.source);
  });
  teardown = () => {
    removeListener();
    void api.unsubscribe();
    teardown = null;
  };
}

function releaseSubscription() {
  refCount -= 1;
  if (refCount > 0) {
    return;
  }
  refCount = 0;
  teardown?.();
}

export async function getDesktopDisplayDataSource(): Promise<DisplayDataSource> {
  const displayApi = getDesktopAPI()?.displayDataSource;
  if (displayApi) {
    return displayApi.get();
  }
  const activityApi = getDesktopAPI()?.activity;
  if (activityApi) {
    return activityApi.getDisplayDataSource();
  }
  return "webpage-scraper";
}

export async function setDesktopDisplayDataSource(
  source: DisplayDataSource,
): Promise<DisplayDataSource> {
  const displayApi = getDesktopAPI()?.displayDataSource;
  if (displayApi) {
    return displayApi.set(source);
  }
  const activityApi = getDesktopAPI()?.activity;
  if (activityApi) {
    return activityApi.setDisplayDataSource(source);
  }
  throw new Error("Desktop API is unavailable.");
}

export function subscribeToDesktopDisplayDataSource(
  onChange: (source: DisplayDataSource) => void,
): () => void {
  if (!isDesktopEnvironment()) {
    return () => {};
  }

  listeners.add(onChange);
  ensureSubscription();
  onChange(currentSource);

  return () => {
    listeners.delete(onChange);
    releaseSubscription();
  };
}
