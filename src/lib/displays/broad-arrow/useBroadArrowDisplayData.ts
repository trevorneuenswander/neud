"use client";

import { useEffect, useMemo, useState } from "react";
import {
  bagLiveStateToPreviewData,
  pickLegacyPreviewFields,
} from "@/lib/bag/live-state-preview";
import type { BagLiveStateEnvelope } from "@/lib/bag/types";
import type { BagSnapshotData } from "@/lib/data-engines/types";
import { resolveEffectiveDisplayData } from "@/lib/displays/resolve-effective-display-data";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import {
  getDesktopDisplayDataSource,
  subscribeToDesktopDisplayDataSource,
} from "@/lib/desktop/display-data-source-client";
import {
  localGetBagLiveState,
  subscribeToBagLiveState,
} from "@/lib/local/bag-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import {
  broadArrowDisplayDataHasLiveContent,
  normalizeBroadArrowDisplayData,
} from "./normalizeBroadArrowDisplayData";
import type { BroadArrowDisplayData } from "./types";

export type BroadArrowDisplayDataState = {
  data: BroadArrowDisplayData;
  connected: boolean;
  loadError: string | null;
  hasLiveContent: boolean;
  displaySource: DisplayDataSource;
};

export function useBroadArrowDisplayData(
  projectId: string,
  fallbackSnapshot: BagSnapshotData | null = null,
): BroadArrowDisplayDataState {
  const [envelope, setEnvelope] = useState<BagLiveStateEnvelope | null>(null);
  const [displaySource, setDisplaySource] = useState<DisplayDataSource>("webpage-scraper");
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    void getDesktopDisplayDataSource().then(setDisplaySource).catch(() => {
      // Keep default.
    });
    return subscribeToDesktopDisplayDataSource(setDisplaySource);
  }, []);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    let cancelled = false;

    const load = () =>
      localGetBagLiveState(projectId)
        .then((payload) => {
          if (!cancelled) {
            setEnvelope(payload);
            setLoadError(null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setLoadError(
              error instanceof Error ? error.message : "Unable to load live state.",
            );
          }
        });

    void load();

    const unsubscribe = subscribeToBagLiveState(projectId, (event) => {
      setConnected(true);
      setEnvelope((current) => ({
        state: event.state,
        automaticState: event.automaticState ?? current?.automaticState ?? null,
        manualSession: event.manualSession ?? current?.manualSession ?? null,
        automaticComparison:
          event.automaticComparison ?? current?.automaticComparison ?? null,
        latestScrapedCurrentLot:
          event.latestScrapedCurrentLot ?? current?.latestScrapedCurrentLot ?? null,
        localControllerDraft:
          event.localControllerDraft ?? current?.localControllerDraft ?? null,
        localControllerSubmitted:
          event.localControllerSubmitted ?? current?.localControllerSubmitted ?? null,
      }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  const canonicalSnapshot = useMemo(() => {
    const scraperRecord =
      envelope?.automaticState != null
        ? (bagLiveStateToPreviewData(envelope.automaticState) ??
          (fallbackSnapshot ? pickLegacyPreviewFields(fallbackSnapshot) : null))
        : fallbackSnapshot
          ? pickLegacyPreviewFields(fallbackSnapshot)
          : null;

    const submittedState = envelope?.localControllerSubmitted ?? null;
    const resolved = resolveEffectiveDisplayData({
      source: displaySource,
      scraperSnapshot: scraperRecord as Record<string, unknown> | null,
      localControllerState: null,
      submittedState,
    });

    return resolved.canonicalSnapshot ?? resolved.previewSnapshot;
  }, [displaySource, envelope, fallbackSnapshot]);

  const data = useMemo(
    () => normalizeBroadArrowDisplayData(canonicalSnapshot),
    [canonicalSnapshot],
  );

  return {
    data,
    connected,
    loadError,
    hasLiveContent: broadArrowDisplayDataHasLiveContent(data),
    displaySource,
  };
}
