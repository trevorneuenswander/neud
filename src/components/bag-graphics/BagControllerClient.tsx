"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataSourceStatusPill } from "@/components/ui/DataSourceStatusPill";
import { PageHeader } from "@/components/portal/PageHeader";
import { BAG_BID_INCREMENTS, type BagLiveStateEnvelope } from "@/lib/bag/types";
import {
  localEnterBagManualMode,
  localGetBagLiveState,
  localPatchBagManualLot,
  localSetBagManualBid,
  localSubmitBagManualLot,
  localSubmitBagManualBid,
  subscribeToBagLiveState,
} from "@/lib/local/bag-api";
import {
  buildManualDraftFromDownloadedLot,
  type DownloadedAuctionLot,
} from "@/lib/bag/downloaded-lot-navigation";
import {
  buildSelectedLotPersistenceKey,
  findDownloadedLotIndex,
  findDownloadedLotIndexByPersistenceKey,
  normalizeLotNumberForMatch,
  resolveDownloadedLotMatch,
  type LotEditingSource,
} from "@/lib/bag/lot-editing-state";
import {
  readSessionSelectedLotKey,
  writeSessionSelectedLotKey,
} from "@/lib/bag/local-controller-session-lot";
import { useDownloadedLotNavigation } from "@/components/bag-graphics/useDownloadedLotNavigation";
import {
  clearOfflineDownloads,
  hasValidOfflineScrape,
  listOfflineDownloads,
  loadOfflineAuction,
  openOfflineDownloadFolder,
} from "@/lib/desktop/offline-auction-client";
import {
  getWebpageExportOperation,
  isWebpageExportInProgress,
  operationToExportProgress,
  startWebpageExport,
  cancelCurrentWebpageDownload,
  dismissCurrentWebpageExportOperation,
  subscribeToWebpageExportOperations,
} from "@/lib/desktop/webpage-export-client";
import {
  getWebpageExportProgressTitle,
  isActiveWebpageExportStatus,
  type WebpageExportOperation,
} from "@/lib/desktop/webpage-export-types";
import {
  getActiveAuctionDataset,
  getLotDatasetDetails,
  type AuctionDatasetDisplayInfo,
} from "@/lib/desktop/auction-dataset-client";
import type { OfflineExportProgress } from "@/lib/desktop/offline-auction-types";
import { localGetAuthSession } from "@/lib/local/displays-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import {
  formatConvertedUsdAmount,
  formatRatesUpdatedAt,
  SUPPORTED_CURRENCY_CODES,
  type SupportedCurrencyCode,
} from "@/lib/desktop/currency-format";
import { useCurrencyRates } from "@/lib/desktop/use-currency-rates";
import { LotPhotoThumbnails } from "@/components/bag-graphics/LotPhotoThumbnails";
import {
  formatReserveStatusLabel,
  normalizeReserveStatus,
  type ReserveStatus,
} from "@/lib/bag/reserve-status";
import { getLotKey } from "@/lib/bag/lot-key";

type BagControllerClientProps = {
  projectId: string;
  projectSlug: string;
  initialEnvelope: BagLiveStateEnvelope;
  canControl: boolean;
};

type LotDraftFields = {
  lotNumber: string;
  title: string;
  reserveStatus: ReserveStatus;
};

const MANUAL_RESERVE_OPTIONS = [
  { value: "has_reserve", label: "Has Reserve" },
  { value: "offered_without_reserve", label: "Offered Without Reserve" },
  { value: "unknown", label: "Unknown" },
] as const;

type ManualDraft = {
  lotNumber: string;
  title: string;
  reserveStatus: ReserveStatus;
  bid: string;
};

function manualDraftFromEnvelope(envelope: BagLiveStateEnvelope): ManualDraft {
  const lot = lotDraftFromEnvelope(envelope);
  const draft = envelope.localControllerDraft;
  const submittedAmount = submittedBidAmountFromEnvelope(envelope);
  const bid =
    draft?.bidDirty && draft.currentBidLabel.trim()
      ? draft.currentBidLabel
      : draft?.currentBidLabel.trim()
        ? draft.currentBidLabel
        : submittedAmount !== null
          ? formatBidDraft(submittedAmount)
          : bidDraftFromEnvelope(envelope);
  return {
    lotNumber: lot.lotNumber,
    title: lot.title,
    reserveStatus: lot.reserveStatus,
    bid,
  };
}

function normalizeComparableText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeBidForComparison(value: string): string {
  return normalizeBid(value);
}

function normalizeBid(value: string): string {
  const amount = parseManualBidDraft(value);
  if (amount !== null) {
    return formatBidDraft(amount);
  }
  return value;
}

function dirtyFieldClassName(isDirty: boolean, hasError = false): string {
  const base =
    "h-10 w-full rounded-md bg-surface-raised px-3 py-2 text-sm text-foreground";
  if (hasError) {
    return `${base} border border-danger focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/40`;
  }
  if (isDirty) {
    return `${base} border border-warning focus-visible:border-warning focus-visible:ring-2 focus-visible:ring-warning/30`;
  }
  return `${base} border border-border focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30`;
}

const MANUAL_CARD_CLASS = "h-full";
const MANUAL_CARD_BODY_CLASS = "flex h-full flex-col";
const MANUAL_CARD_HEADING_ROW_CLASS = "flex min-h-8 items-start justify-between gap-3";
const MANUAL_CARD_HEADING_ACTIONS_CLASS = "flex min-h-8 shrink-0 items-center gap-1.5";
const MANUAL_SUMMARY_BOX_CLASS =
  "min-h-[8.5rem] rounded-md border border-border bg-surface px-3 py-2 text-sm";
const MANUAL_PRIMARY_FIELD_GROUP_CLASS = "mt-4 space-y-2";
const MANUAL_PRIMARY_LABEL_CLASS = "text-sm text-muted";
const MANUAL_PRIMARY_INPUT_ROW_CLASS = "flex min-h-10 items-center gap-2";
const MANUAL_PRIMARY_INPUT_IN_ROW_CLASS = "min-w-0 flex-1";
const MANUAL_ROW_BUTTON_CLASS = "h-10 shrink-0";

function emptyLotDraft(): LotDraftFields {
  return { lotNumber: "", title: "", reserveStatus: "unknown" };
}

function normalizeDraftReserveStatus(value: unknown): ReserveStatus {
  return normalizeReserveStatus(value);
}

function envelopeFromEvent(event: {
  state: BagLiveStateEnvelope["state"];
  automaticState?: BagLiveStateEnvelope["automaticState"];
  automaticComparison?: BagLiveStateEnvelope["automaticComparison"];
  manualSession?: BagLiveStateEnvelope["manualSession"];
  latestScrapedCurrentLot?: BagLiveStateEnvelope["latestScrapedCurrentLot"];
  localControllerDraft?: BagLiveStateEnvelope["localControllerDraft"];
  localControllerSubmitted?: BagLiveStateEnvelope["localControllerSubmitted"];
  manualLotNavigation?: BagLiveStateEnvelope["manualLotNavigation"];
  manualLotNavigationCapabilities?: BagLiveStateEnvelope["manualLotNavigationCapabilities"];
}): BagLiveStateEnvelope {
  return {
    state: event.state,
    automaticState: event.automaticState ?? null,
    automaticComparison: event.automaticComparison ?? null,
    manualSession: event.manualSession ?? null,
    latestScrapedCurrentLot: event.latestScrapedCurrentLot ?? null,
    localControllerDraft: event.localControllerDraft ?? null,
    localControllerSubmitted: event.localControllerSubmitted ?? null,
    manualLotNavigation: event.manualLotNavigation ?? null,
    manualLotNavigationCapabilities: event.manualLotNavigationCapabilities ?? null,
  };
}

function submittedLotFromEnvelope(envelope: BagLiveStateEnvelope): LotDraftFields {
  const lot = envelope.localControllerSubmitted?.currentLot ?? envelope.state.currentLot;
  return {
    lotNumber: lot?.lotNumber ?? "",
    title: lot?.title ?? "",
    reserveStatus: normalizeDraftReserveStatus(lot?.reserveStatus),
  };
}

function submittedReserveStatusLabel(envelope: BagLiveStateEnvelope): string {
  const lot = envelope.localControllerSubmitted?.currentLot ?? envelope.state.currentLot;
  if (lot?.reserveStatus?.trim()) {
    return formatReserveStatusLabel(normalizeReserveStatus(lot.reserveStatus));
  }
  const auctionDisplay = envelope.localControllerSubmitted?.auctionDisplay;
  if (
    auctionDisplay &&
    typeof auctionDisplay === "object" &&
    typeof (auctionDisplay as Record<string, unknown>).reserveStatus === "string"
  ) {
    const value = String((auctionDisplay as Record<string, unknown>).reserveStatus).trim();
    if (value) {
      return formatReserveStatusLabel(normalizeReserveStatus(value));
    }
  }
  return "Unknown";
}

function submittedBidLabelFromEnvelope(envelope: BagLiveStateEnvelope): string {
  const lot = envelope.localControllerSubmitted?.currentLot;
  if (!lot) return "—";
  if (lot.currentBidLabel?.trim()) return lot.currentBidLabel;
  if (lot.currentBid != null) {
    return `$${lot.currentBid.toLocaleString("en-US")}`;
  }
  return "—";
}

function submittedBidAmountFromEnvelope(envelope: BagLiveStateEnvelope): number | null {
  const lot = envelope.localControllerSubmitted?.currentLot;
  if (!lot || lot.currentBid == null) return null;
  return lot.currentBid;
}

function submittedLotSyncKey(envelope: BagLiveStateEnvelope): string {
  const cursor = envelope.manualLotNavigation?.cursorLotId;
  if (cursor) return cursor;
  const lot = envelope.localControllerSubmitted?.currentLot ?? envelope.state.currentLot;
  if (lot?.id) return `id:${lot.id}`;
  if (lot?.lotNumber) return `lot:${lot.lotNumber.trim().toLowerCase()}`;
  return "";
}

function lotDraftFromEnvelope(
  envelope: BagLiveStateEnvelope,
  preferDraftBaseline = false,
): LotDraftFields {
  const draft = envelope.localControllerDraft;
  const hasNavigationCursor = Boolean(envelope.manualLotNavigation?.cursorLotId);
  if (draft && (draft.lotDirty || hasNavigationCursor || preferDraftBaseline)) {
    return {
      lotNumber: draft.lotNumber,
      title: draft.title,
      reserveStatus: normalizeDraftReserveStatus(draft.reserveStatus),
    };
  }
  return submittedLotFromEnvelope(envelope);
}

function bidDraftFromEnvelope(envelope: BagLiveStateEnvelope): string {
  const draft = envelope.localControllerDraft;
  if (draft?.bidDirty && draft.currentBidLabel.trim()) {
    return draft.currentBidLabel;
  }
  const submittedAmount = submittedBidAmountFromEnvelope(envelope);
  if (submittedAmount !== null) {
    return formatBidDraft(submittedAmount);
  }
  return "";
}

function lotDraftChanged(
  draft: LotDraftFields,
  baseline: LotDraftFields,
): boolean {
  return (
    draft.lotNumber !== baseline.lotNumber ||
    draft.title !== baseline.title ||
    draft.reserveStatus !== baseline.reserveStatus
  );
}

function parseManualBidDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[$€£,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount);
}

function parseBidDraft(value: string): number | null {
  return parseManualBidDraft(value);
}

function formatBidDraft(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function getBidIncrementBase(
  draftBid: string,
  submittedBid: number | null,
): number {
  const draftAmount = parseBidDraft(draftBid);
  if (draftAmount !== null) return draftAmount;
  if (submittedBid !== null) return submittedBid;
  return 0;
}

function datasetUsingLabel(info: AuctionDatasetDisplayInfo | null): string {
  if (!info) return "No local downloads available.";
  if (info.reference.source === "none") {
    return "No local downloads available.";
  }
  if (info.reference.source === "live-snapshot") {
    return "Live scraper snapshot";
  }
  const filename = info.reference.filename ?? info.label;
  const size = info.totalSizeFormatted ?? info.reference.totalSizeFormatted;
  return size ? `${filename} · ${size}` : filename;
}

type CurrentDownloadNotice = {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  operationId?: string;
  code?: string;
};

function createCurrentDownloadNotice(
  notice: Omit<CurrentDownloadNotice, "id">,
): CurrentDownloadNotice {
  return { ...notice, id: crypto.randomUUID() };
}

function logLocalControllerDatasetDiagnostics(input: {
  activeDataset: AuctionDatasetDisplayInfo | null;
  envelope: BagLiveStateEnvelope;
  reason: string;
}) {
  if (process.env.NODE_ENV !== "development") return;
  const navigation = input.envelope.manualLotNavigation;
  const selectedLot =
    input.envelope.localControllerSubmitted?.currentLot ??
    input.envelope.state.currentLot ??
    null;
  console.debug("[LocalControllerDataset]", {
    reason: input.reason,
    selectedDownloadId: input.activeDataset?.reference.filename ?? null,
    selectedDownloadPath: input.activeDataset?.reference.filePath ?? null,
    downloadCount: input.envelope.state.lotCount ?? 0,
    loadedLotCount: input.envelope.state.lots?.length ?? 0,
    selectedLotIndex: navigation?.cursorLotId ?? null,
    selectedLotId: selectedLot?.lotNumber ?? null,
    datasetSource: input.activeDataset?.reference.source ?? "none",
    hasManualOverrides: Boolean(input.envelope.localControllerSubmitted),
    hasLiveSnapshotFallback: input.activeDataset?.reference.source === "live-snapshot",
  });
}

function bidDraftChanged(bidDraft: string, submittedAmount: number | null): boolean {
  const draftAmount = parseManualBidDraft(bidDraft);
  if (draftAmount === null) {
    return bidDraft.trim() !== "";
  }
  if (submittedAmount === null) {
    return true;
  }
  return draftAmount !== submittedAmount;
}

export function BagControllerClient({
  projectId,
  projectSlug,
  initialEnvelope,
  canControl,
}: BagControllerClientProps) {
  const [envelope, setEnvelope] = useState(initialEnvelope);
  const [submittedValues, setSubmittedValues] = useState<ManualDraft>(() =>
    manualDraftFromEnvelope(initialEnvelope),
  );
  const [draftValues, setDraftValues] = useState<ManualDraft>(() =>
    manualDraftFromEnvelope(initialEnvelope),
  );
  const [photoPreviewLotNumber, setPhotoPreviewLotNumber] = useState<string | null>(() => {
    const lotNumber = manualDraftFromEnvelope(initialEnvelope).lotNumber.trim();
    return lotNumber || null;
  });
  const [submittedBidLabel, setSubmittedBidLabel] = useState(() =>
    submittedBidLabelFromEnvelope(initialEnvelope),
  );
  const [submittedBidAmount, setSubmittedBidAmount] = useState<number | null>(() =>
    submittedBidAmountFromEnvelope(initialEnvelope),
  );
  const { rates: currencyRates, error: currencyRatesError, isRefreshingRates, refreshRatesManually } =
    useCurrencyRates();
  const lotIsDirtyRef = useRef(false);
  const titleEditedRef = useRef(false);
  const reserveEditedRef = useRef(false);
  const bidIsDirtyRef = useRef(false);
  const [isLotNumberFocused, setIsLotNumberFocused] = useState(false);
  const lotDraftSyncKeyRef = useRef(submittedLotSyncKey(initialEnvelope));
  const lotDraftPersistTimerRef = useRef<number | null>(null);
  const bidDraftPersistTimerRef = useRef<number | null>(null);
  const lotDraftPersistRequestRef = useRef(0);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingLot, setIsSubmittingLot] = useState(false);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [isLoadingPackage, setIsLoadingPackage] = useState(false);
  const [canExportOffline, setCanExportOffline] = useState(false);
  const [exportInProgress, setExportInProgress] = useState(false);
  const [exportProgress, setExportProgress] = useState<OfflineExportProgress | null>(null);
  const [activeExportOperation, setActiveExportOperation] = useState<WebpageExportOperation | null>(
    null,
  );
  const [currentDownloadNotice, setCurrentDownloadNotice] =
    useState<CurrentDownloadNotice | null>(null);
  const [activeDataset, setActiveDataset] = useState<AuctionDatasetDisplayInfo | null>(null);
  const [clearingDownloads, setClearingDownloads] = useState(false);
  const [showClearDownloadsDialog, setShowClearDownloadsDialog] = useState(false);
  const [savedDownloadCount, setSavedDownloadCount] = useState(0);
  const clearDownloadsButtonRef = useRef<HTMLButtonElement>(null);
  const downloadDismissTimerRef = useRef<number | null>(null);
  const manualLotViewSourceRef = useRef<"downloaded-dataset" | "manual-entry" | "live-snapshot">(
    "manual-entry",
  );
  const lotEditingSourceRef = useRef<LotEditingSource>("manual-entry");
  const appliedEditingStableIdRef = useRef<string | null>(null);
  const lotNumberInputRef = useRef("");
  const lastProcessedNormalizedLotRef = useRef<string | null>(null);
  const unmatchedLotDraftRef = useRef(false);
  const initialDownloadedLotSelectionDoneRef = useRef(false);
  const downloadedDatasetKeyRef = useRef<string | null>(null);
  const [hasResolvedInitialLot, setHasResolvedInitialLot] = useState(() => !shouldUseLocalDataClient());
  const hasResolvedInitialLotRef = useRef(hasResolvedInitialLot);
  hasResolvedInitialLotRef.current = hasResolvedInitialLot;
  const [sessionAuthReady, setSessionAuthReady] = useState(() => !shouldUseLocalDataClient());
  const [activeDatasetResolved, setActiveDatasetResolved] = useState(() => !shouldUseLocalDataClient());
  const sessionUserIdRef = useRef<string | null>(null);
  const lastPersistedLotKeyRef = useRef<string | null>(null);

  const downloadedNav = useDownloadedLotNavigation({
    projectId,
    datasetSource: activeDataset?.reference.source,
    datasetPath: activeDataset?.reference.filePath,
  });
  manualLotViewSourceRef.current = downloadedNav.manualLotViewSource;

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      sessionUserIdRef.current = null;
      setSessionAuthReady(true);
      setHasResolvedInitialLot(true);
      return;
    }

    setSessionAuthReady(false);

    let cancelled = false;
    void localGetAuthSession()
      .then((session) => {
        if (cancelled) return;
        sessionUserIdRef.current = session.userId;
        lastPersistedLotKeyRef.current = readSessionSelectedLotKey(session.userId, projectId);
      })
      .catch(() => {
        if (cancelled) return;
        sessionUserIdRef.current = null;
        lastPersistedLotKeyRef.current = null;
      })
      .finally(() => {
        if (!cancelled) {
          setSessionAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (downloadDismissTimerRef.current !== null) {
        window.clearTimeout(downloadDismissTimerRef.current);
      }
      if (lotDraftPersistTimerRef.current !== null) {
        window.clearTimeout(lotDraftPersistTimerRef.current);
      }
      if (bidDraftPersistTimerRef.current !== null) {
        window.clearTimeout(bidDraftPersistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      setActiveDatasetResolved(true);
      return;
    }

    setActiveDatasetResolved(false);
    void getActiveAuctionDataset(projectId)
      .then(setActiveDataset)
      .catch(() => {
        setActiveDataset(null);
      })
      .finally(() => {
        setActiveDatasetResolved(true);
      });
  }, [projectId]);

  const refreshSavedDownloadCount = useCallback(async () => {
    if (!shouldUseLocalDataClient()) {
      setSavedDownloadCount(0);
      return;
    }
    try {
      const downloads = await listOfflineDownloads(projectId);
      setSavedDownloadCount(downloads.length);
    } catch {
      setSavedDownloadCount(0);
    }
  }, [projectId]);

  const scheduleExportDismiss = useCallback(
    (operation: WebpageExportOperation) => {
      if (operation.status !== "completed" && operation.status !== "cancelled") {
        return;
      }
      const dismissAfter = operation.dismissAfter;
      if (!dismissAfter) {
        return;
      }
      if (downloadDismissTimerRef.current !== null) {
        window.clearTimeout(downloadDismissTimerRef.current);
      }
      const remaining = Math.max(0, Date.parse(dismissAfter) - Date.now());
      downloadDismissTimerRef.current = window.setTimeout(() => {
        downloadDismissTimerRef.current = null;
        void dismissCurrentWebpageExportOperation(projectId, operation.operationId).finally(() => {
          void getWebpageExportOperation(projectId).then((next) => {
            if (!next) {
              setActiveExportOperation(null);
              setExportProgress(null);
              setExportInProgress(false);
              setCurrentDownloadNotice(null);
            } else {
              setActiveExportOperation(next);
              setExportProgress(operationToExportProgress(next));
              setExportInProgress(isActiveWebpageExportStatus(next.status));
            }
          });
        });
      }, remaining);
    },
    [projectId],
  );

  useEffect(() => {
    void refreshSavedDownloadCount();
  }, [refreshSavedDownloadCount]);

  const populateControllerFromDownloadedLot = useCallback(
    ({
      lot,
      source,
      preserveLotNumber,
    }: {
      lot: DownloadedAuctionLot;
      source: LotEditingSource;
      preserveLotNumber?: string;
    }) => {
      const baseline = buildManualDraftFromDownloadedLot(lot);
      const lotNumberValue = preserveLotNumber ?? baseline.lotNumber;
      lotEditingSourceRef.current = source;
      appliedEditingStableIdRef.current = baseline.stableId;
      unmatchedLotDraftRef.current = false;
      lastProcessedNormalizedLotRef.current = normalizeLotNumberForMatch(lotNumberValue);
      titleEditedRef.current = false;
      reserveEditedRef.current = false;

      setDraftValues((current) => ({
        lotNumber: lotNumberValue,
        title: baseline.title,
        reserveStatus: baseline.reserveStatus,
        bid: current.bid,
      }));
      lotIsDirtyRef.current = true;
      setPhotoPreviewLotNumber(baseline.lotNumber);
    },
    [],
  );

  const persistSelectedLotKey = useCallback(
    (lot: DownloadedAuctionLot) => {
      if (!shouldUseLocalDataClient() || !hasResolvedInitialLotRef.current) {
        return;
      }
      const nextKey = buildSelectedLotPersistenceKey(lot);
      if (nextKey === lastPersistedLotKeyRef.current) {
        return;
      }
      lastPersistedLotKeyRef.current = nextKey;
      writeSessionSelectedLotKey(sessionUserIdRef.current ?? null, projectId, nextKey);
    },
    [projectId],
  );

  const selectDownloadedLotByIndex = useCallback(
    (
      nextIndex: number,
      source: "previous" | "next" | "typed-match" | "downloaded-selection",
    ) => {
      const lots = downloadedNav.loadedLots;
      if (lots.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(nextIndex, lots.length - 1));
      const lot = lots[clampedIndex];
      if (!lot) {
        return;
      }

      downloadedNav.setSelectedDownloadedLotIndex(clampedIndex);
      populateControllerFromDownloadedLot({
        lot,
        source,
        preserveLotNumber: source === "typed-match" ? lotNumberInputRef.current.trim() : undefined,
      });
      persistSelectedLotKey(lot);
    },
    [
      downloadedNav.loadedLots,
      downloadedNav.setSelectedDownloadedLotIndex,
      populateControllerFromDownloadedLot,
      persistSelectedLotKey,
    ],
  );

  const handlePreviousLot = useCallback(() => {
    selectDownloadedLotByIndex(downloadedNav.selectedDownloadedLotIndex - 1, "previous");
  }, [downloadedNav.selectedDownloadedLotIndex, selectDownloadedLotByIndex]);

  const handleNextLot = useCallback(() => {
    selectDownloadedLotByIndex(downloadedNav.selectedDownloadedLotIndex + 1, "next");
  }, [downloadedNav.selectedDownloadedLotIndex, selectDownloadedLotByIndex]);

  useEffect(() => {
    const datasetKey =
      activeDataset?.reference.filePath ??
      activeDataset?.reference.source ??
      "none";
    if (downloadedDatasetKeyRef.current !== datasetKey) {
      downloadedDatasetKeyRef.current = datasetKey;
      initialDownloadedLotSelectionDoneRef.current = false;
      lastProcessedNormalizedLotRef.current = null;
      appliedEditingStableIdRef.current = null;
    }
  }, [activeDataset?.reference.filePath, activeDataset?.reference.source]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }
    if (!activeDatasetResolved || !sessionAuthReady) {
      return;
    }

    if (downloadedNav.manualLotViewSource !== "downloaded-dataset") {
      if (!initialDownloadedLotSelectionDoneRef.current) {
        initialDownloadedLotSelectionDoneRef.current = true;
        hasResolvedInitialLotRef.current = true;
        setHasResolvedInitialLot(true);
      }
      return;
    }
    if (downloadedNav.loadedLots.length === 0) {
      return;
    }
    if (initialDownloadedLotSelectionDoneRef.current) {
      return;
    }

    initialDownloadedLotSelectionDoneRef.current = true;
    hasResolvedInitialLotRef.current = true;
    setHasResolvedInitialLot(true);

    const sessionKey = readSessionSelectedLotKey(sessionUserIdRef.current, projectId);
    if (sessionKey) {
      const restoredIndex = findDownloadedLotIndexByPersistenceKey(
        downloadedNav.loadedLots,
        sessionKey,
      );
      if (restoredIndex >= 0) {
        selectDownloadedLotByIndex(restoredIndex, "downloaded-selection");
        return;
      }
    }

    selectDownloadedLotByIndex(0, "downloaded-selection");
  }, [
    activeDatasetResolved,
    sessionAuthReady,
    downloadedNav.loadedLots,
    downloadedNav.manualLotViewSource,
    projectId,
    selectDownloadedLotByIndex,
  ]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;

    const syncPresentedOperation = async () => {
      try {
        const [valid, inProgress] = await Promise.all([
          hasValidOfflineScrape(projectId),
          isWebpageExportInProgress(projectId),
        ]);
        setCanExportOffline(valid);
        setExportInProgress(inProgress);

        const operation = await getWebpageExportOperation(projectId);
        if (!operation) {
          setExportProgress(null);
          setActiveExportOperation(null);
          setExportInProgress(false);
          setCurrentDownloadNotice(null);
          return;
        }

        setExportProgress(operationToExportProgress(operation));
        setActiveExportOperation(operation);
        setExportInProgress(isActiveWebpageExportStatus(operation.status));

        if (isActiveWebpageExportStatus(operation.status)) {
          setCurrentDownloadNotice(null);
          if (downloadDismissTimerRef.current !== null) {
            window.clearTimeout(downloadDismissTimerRef.current);
            downloadDismissTimerRef.current = null;
          }
          return;
        }

        if (operation.status === "completed" || operation.status === "completed-with-warnings") {
          setCurrentDownloadNotice(
            createCurrentDownloadNotice({
              type: "success",
              message: operation.message || "Download complete",
              operationId: operation.operationId,
            }),
          );
          if (operation.status === "completed") {
            scheduleExportDismiss(operation);
          }
          void refreshSavedDownloadCount();
          void getActiveAuctionDataset(projectId).then(setActiveDataset);
        } else if (operation.status === "failed" || operation.status === "cancelled") {
          setCurrentDownloadNotice(
            createCurrentDownloadNotice({
              type: operation.status === "cancelled" ? "warning" : "error",
              message:
                operation.status === "cancelled"
                  ? "Download cancelled"
                  : operation.error ?? operation.message ?? "Download failed.",
              operationId: operation.operationId,
            }),
          );
          if (operation.status === "cancelled") {
            scheduleExportDismiss(operation);
          }
        }
      } catch {
        setCanExportOffline(false);
      }
    };

    void syncPresentedOperation();

    const unsubscribe = subscribeToWebpageExportOperations((operations) => {
      const operation =
        operations.find((entry) => entry.projectId === projectId) ?? null;
      if (!operation) {
        void syncPresentedOperation();
        return;
      }

      if (operation.presentationDismissedAt) {
        void syncPresentedOperation();
        return;
      }

      if (
        (operation.status === "completed" || operation.status === "cancelled") &&
        operation.dismissAfter &&
        Date.now() >= Date.parse(operation.dismissAfter)
      ) {
        void dismissCurrentWebpageExportOperation(projectId, operation.operationId).finally(() => {
          void syncPresentedOperation();
        });
        return;
      }

      setExportProgress(operationToExportProgress(operation));
      setActiveExportOperation(operation);
      setExportInProgress(isActiveWebpageExportStatus(operation.status));

      if (isActiveWebpageExportStatus(operation.status)) {
        setCurrentDownloadNotice(null);
        if (downloadDismissTimerRef.current !== null) {
          window.clearTimeout(downloadDismissTimerRef.current);
          downloadDismissTimerRef.current = null;
        }
        return;
      }

      if (operation.status === "completed" || operation.status === "completed-with-warnings") {
        setCurrentDownloadNotice(
          createCurrentDownloadNotice({
            type: "success",
            message: operation.message || "Download complete",
            operationId: operation.operationId,
          }),
        );
        if (operation.status === "completed") {
          scheduleExportDismiss(operation);
        }
        void refreshSavedDownloadCount();
        void getActiveAuctionDataset(projectId).then(setActiveDataset);
      } else if (operation.status === "failed" || operation.status === "cancelled") {
        setCurrentDownloadNotice(
          createCurrentDownloadNotice({
            type: operation.status === "cancelled" ? "warning" : "error",
            message:
              operation.status === "cancelled"
                ? "Download cancelled"
                : operation.error ?? operation.message ?? "Download failed.",
            operationId: operation.operationId,
          }),
        );
        if (operation.status === "cancelled") {
          scheduleExportDismiss(operation);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectId, refreshSavedDownloadCount, scheduleExportDismiss]);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || !canControl) return;
    if (lotEditingSourceRef.current !== "manual-entry") return;
    if (downloadedNav.manualLotViewSource === "downloaded-dataset") return;

    const lotNumber = draftValues.lotNumber.trim();
    if (!lotNumber) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getLotDatasetDetails(projectId, lotNumber).then((details) => {
        if (cancelled) return;
        setDraftValues((current) => {
          if (current.lotNumber.trim() !== lotNumber) return current;
          const next = { ...current };
          let changed = false;
          if (!titleEditedRef.current && details?.title && next.title !== details.title) {
            next.title = details.title;
            changed = true;
          }
          if (
            !reserveEditedRef.current &&
            details?.reserveStatus &&
            normalizeDraftReserveStatus(next.reserveStatus) !==
              normalizeDraftReserveStatus(details.reserveStatus)
          ) {
            next.reserveStatus = normalizeDraftReserveStatus(details.reserveStatus);
            changed = true;
          }
          if (!changed) return current;
          lotIsDirtyRef.current = true;
          scheduleLotDraftPersist({
            lotNumber: next.lotNumber,
            title: next.title,
            reserveStatus: next.reserveStatus,
          });
          return next;
        });
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectId, canControl, draftValues.lotNumber]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;

    const poll = async () => {
      try {
        const payload = await localGetBagLiveState(projectId);
        setEnvelope(payload);
      } catch {
        // Keep last known state.
      }
    };

    void poll();
    const unsubscribe = subscribeToBagLiveState(projectId, (event) => {
      setEnvelope(envelopeFromEvent(event));
    });
    const interval = window.setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [projectId]);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || !canControl) return;
    if (envelope.state.mode === "manual") return;

    void localEnterBagManualMode(projectId)
      .then(setEnvelope)
      .catch(() => {
        // Manual controls remain visible; backend may reject until state is ready.
      });
  }, [projectId, canControl, envelope.state.mode]);

  const canSelectPrevious = downloadedNav.canSelectPrevious;
  const canSelectNext = downloadedNav.canSelectNext;
  const isDownloadActive =
    exportInProgress ||
    Boolean(
      activeExportOperation && isActiveWebpageExportStatus(activeExportOperation.status),
    );
  const currentReserveSummaryLabel = submittedReserveStatusLabel(envelope);

  useEffect(() => {
    logLocalControllerDatasetDiagnostics({
      activeDataset,
      envelope,
      reason: "state-change",
    });
  }, [activeDataset, envelope]);

  const hasUnsavedLotChanges =
    normalizeComparableText(draftValues.lotNumber) !==
      normalizeComparableText(submittedValues.lotNumber) ||
    normalizeComparableText(draftValues.title) !== normalizeComparableText(submittedValues.title) ||
    normalizeDraftReserveStatus(draftValues.reserveStatus) !==
      normalizeDraftReserveStatus(submittedValues.reserveStatus);
  const hasUnsavedBidChanges =
    normalizeBidForComparison(draftValues.bid) !== normalizeBidForComparison(submittedValues.bid);
  const isLotNumberDirty =
    normalizeComparableText(draftValues.lotNumber) !==
    normalizeComparableText(submittedValues.lotNumber);
  const isTitleDirty =
    normalizeComparableText(draftValues.title) !== normalizeComparableText(submittedValues.title);
  const isReserveDirty =
    normalizeDraftReserveStatus(draftValues.reserveStatus) !==
    normalizeDraftReserveStatus(submittedValues.reserveStatus);
  const isBidDirty = hasUnsavedBidChanges;
  const hasSavedDownloads = savedDownloadCount > 0;

  useEffect(() => {
    if (lotEditingSourceRef.current !== "manual-entry") {
      return;
    }
    const syncKey = submittedLotSyncKey(envelope);
    const syncKeyChanged = syncKey !== lotDraftSyncKeyRef.current;
    if (!syncKeyChanged) {
      return;
    }

    const lotFieldProtected =
      unmatchedLotDraftRef.current ||
      isLotNumberFocused ||
      isLotNumberDirty ||
      lotIsDirtyRef.current;
    const bidFieldProtected = bidIsDirtyRef.current;
    const titleFieldProtected = titleEditedRef.current;
    const reserveFieldProtected = reserveEditedRef.current;

    if (lotFieldProtected || bidFieldProtected || titleFieldProtected || reserveFieldProtected) {
      return;
    }

    lotDraftSyncKeyRef.current = syncKey;
    lotIsDirtyRef.current = false;
    titleEditedRef.current = false;
    reserveEditedRef.current = false;
    bidIsDirtyRef.current = false;
    appliedEditingStableIdRef.current = null;
    const nextSubmitted = manualDraftFromEnvelope(envelope);
    lastProcessedNormalizedLotRef.current = normalizeLotNumberForMatch(
      nextSubmitted.lotNumber,
    );
    lotNumberInputRef.current = nextSubmitted.lotNumber;
    setSubmittedValues(nextSubmitted);
    setDraftValues(nextSubmitted);
    setPhotoPreviewLotNumber(nextSubmitted.lotNumber.trim());
    setSubmittedBidLabel(submittedBidLabelFromEnvelope(envelope));
    setSubmittedBidAmount(submittedBidAmountFromEnvelope(envelope));
  }, [envelope, isLotNumberFocused, isLotNumberDirty]);

  const lotSubmitDisabled = useMemo(
    () => !hasUnsavedLotChanges || isSubmittingLot,
    [hasUnsavedLotChanges, isSubmittingLot],
  );

  const bidSubmitDisabled = useMemo(() => {
    if (isSubmittingBid) return true;
    if (!hasUnsavedBidChanges) return true;
    if (!draftValues.bid.trim()) {
      return submittedBidAmount === null;
    }
    return parseManualBidDraft(draftValues.bid) === null;
  }, [draftValues.bid, hasUnsavedBidChanges, isSubmittingBid, submittedBidAmount]);

  function scheduleLotDraftPersist(nextDraft: LotDraftFields) {
    if (!canControl) return;
    if (lotDraftPersistTimerRef.current !== null) {
      window.clearTimeout(lotDraftPersistTimerRef.current);
    }
    lotDraftPersistTimerRef.current = window.setTimeout(() => {
      lotDraftPersistTimerRef.current = null;
      const requestId = lotDraftPersistRequestRef.current + 1;
      lotDraftPersistRequestRef.current = requestId;
      void localPatchBagManualLot(projectId, {
        lotNumber: nextDraft.lotNumber,
        title: nextDraft.title,
        reserveStatus: nextDraft.reserveStatus,
      })
        .then((next) => {
          if (lotDraftPersistRequestRef.current !== requestId) return;
          if (lotIsDirtyRef.current) {
            setEnvelope(next);
          }
        })
        .catch(() => {
          // Keep local draft editable even if persistence fails transiently.
        });
    }, 400);
  }

  const clearUnmatchedLotProperties = useCallback(
    (lotInput: string) => {
      appliedEditingStableIdRef.current = null;
      lotEditingSourceRef.current = "manual-entry";
      unmatchedLotDraftRef.current = true;
      titleEditedRef.current = false;
      reserveEditedRef.current = false;
      downloadedNav.clearSelectedDownloadedLot();
      setPhotoPreviewLotNumber(null);

      setDraftValues((current) => {
        const next = {
          lotNumber: lotInput,
          title: "",
          reserveStatus: "unknown" as ReserveStatus,
          bid: current.bid,
        };
        lotIsDirtyRef.current = true;
        scheduleLotDraftPersist({
          lotNumber: next.lotNumber,
          title: next.title,
          reserveStatus: next.reserveStatus,
        });
        return next;
      });
    },
    [downloadedNav.clearSelectedDownloadedLot],
  );

  const applyDownloadedLotMatch = useCallback(
    (lotInput: string) => {
      if (downloadedNav.manualLotViewSource !== "downloaded-dataset") {
        return;
      }
      if (downloadedNav.loadedLots.length === 0) {
        return;
      }

      const resolution = resolveDownloadedLotMatch({
        lotInput,
        loadedLots: downloadedNav.loadedLots,
        lastProcessedNormalizedLot: lastProcessedNormalizedLotRef.current,
      });

      if (resolution.action === "skip") {
        return;
      }

      lastProcessedNormalizedLotRef.current = resolution.normalizedLot;

      if (resolution.action === "clear") {
        clearUnmatchedLotProperties(lotInput);
        return;
      }

      unmatchedLotDraftRef.current = false;

      const matchIndex = findDownloadedLotIndex(
        downloadedNav.loadedLots,
        resolution.lot.stableId,
      );
      if (matchIndex >= 0) {
        downloadedNav.setSelectedDownloadedLotIndex(matchIndex);
      }

      populateControllerFromDownloadedLot({
        lot: resolution.lot,
        source: "typed-match",
        preserveLotNumber: lotInput.trim(),
      });
      persistSelectedLotKey(resolution.lot);
      scheduleLotDraftPersist({
        lotNumber: lotInput.trim(),
        title: resolution.lot.title,
        reserveStatus: resolution.lot.reserveStatus,
      });
    },
    [
      clearUnmatchedLotProperties,
      downloadedNav.loadedLots,
      downloadedNav.manualLotViewSource,
      downloadedNav.setSelectedDownloadedLotIndex,
      populateControllerFromDownloadedLot,
      persistSelectedLotKey,
    ],
  );

  useEffect(() => {
    if (!hasResolvedInitialLot) {
      return;
    }
    if (downloadedNav.manualLotViewSource !== "downloaded-dataset") {
      return;
    }
    if (downloadedNav.loadedLots.length === 0) {
      return;
    }

    lotNumberInputRef.current = draftValues.lotNumber;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      applyDownloadedLotMatch(lotNumberInputRef.current);
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    draftValues.lotNumber,
    downloadedNav.loadedLots,
    downloadedNav.manualLotViewSource,
    applyDownloadedLotMatch,
    hasResolvedInitialLot,
  ]);

  function scheduleBidDraftPersist(nextBid: string) {
    if (!canControl) return;
    if (bidDraftPersistTimerRef.current !== null) {
      window.clearTimeout(bidDraftPersistTimerRef.current);
    }
    bidDraftPersistTimerRef.current = window.setTimeout(() => {
      bidDraftPersistTimerRef.current = null;
      void localSetBagManualBid(projectId, nextBid)
        .then((next) => {
          if (bidIsDirtyRef.current) {
            setEnvelope(next);
          }
        })
        .catch(() => {
          // Keep local draft editable even if persistence fails transiently.
        });
    }, 400);
  }

  function updateLotDraftField<K extends keyof LotDraftFields>(
    field: K,
    value: LotDraftFields[K],
  ) {
    lotIsDirtyRef.current = true;
    if (field === "lotNumber") {
      lotEditingSourceRef.current = "manual-entry";
    }
    if (field === "title") titleEditedRef.current = true;
    if (field === "reserveStatus") reserveEditedRef.current = true;
    setDraftValues((current) => {
      const next = { ...current, [field]: value };
      scheduleLotDraftPersist({
        lotNumber: next.lotNumber,
        title: next.title,
        reserveStatus: next.reserveStatus,
      });
      return next;
    });
  }

  function updateBidDraftValue(nextBid: string) {
    bidIsDirtyRef.current = true;
    setDraftValues((current) => ({ ...current, bid: nextBid }));
    scheduleBidDraftPersist(nextBid);
  }

  function adjustBidDraft(delta: number) {
    const submittedAmount = submittedBidAmount ?? parseBidDraft(submittedValues.bid);
    const current = getBidIncrementBase(draftValues.bid, submittedAmount);
    const next = Math.max(0, current + delta);
    updateBidDraftValue(formatBidDraft(next));
  }

  async function runDraftAction(label: string, action: () => Promise<BagLiveStateEnvelope>) {
    if (!canControl || isSubmittingLot || isSubmittingBid) return;
    const setSubmitting = label.includes("bid") ? setIsSubmittingBid : setIsSubmittingLot;
    setSubmitting(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const next = await action();
      lotIsDirtyRef.current = false;
      titleEditedRef.current = false;
      reserveEditedRef.current = false;
      bidIsDirtyRef.current = false;
      lotDraftSyncKeyRef.current = submittedLotSyncKey(next);
      const nextSubmitted = manualDraftFromEnvelope(next);
      setSubmittedValues(nextSubmitted);
      setDraftValues(nextSubmitted);
      const nextBidAmount = parseManualBidDraft(nextSubmitted.bid);
      setSubmittedBidLabel(
        nextSubmitted.bid.trim()
          ? nextBidAmount !== null
            ? formatBidDraft(nextBidAmount)
            : nextSubmitted.bid
          : submittedBidLabelFromEnvelope(next),
      );
      setSubmittedBidAmount(nextBidAmount);
      setEnvelope(next);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function runSubmitAction(label: string, action: () => Promise<BagLiveStateEnvelope>) {
    if (!canControl) return;
    if (label === "Manual lot" && isSubmittingLot) return;
    if (label === "Manual bid" && isSubmittingBid) return;
    const setSubmitting = label === "Manual lot" ? setIsSubmittingLot : setIsSubmittingBid;
    const previousSubmittedKey = getLotKey(
      envelope.localControllerSubmitted?.currentLot ?? envelope.state.currentLot,
    );
    setSubmitting(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const next = await action();
      setEnvelope(next);
      if (label === "Manual lot") {
        lotIsDirtyRef.current = false;
        titleEditedRef.current = false;
        reserveEditedRef.current = false;
        lotEditingSourceRef.current = "manual-entry";
        appliedEditingStableIdRef.current = null;
        lastProcessedNormalizedLotRef.current = normalizeLotNumberForMatch(
          draftValues.lotNumber,
        );
        lotNumberInputRef.current = draftValues.lotNumber;
        lotDraftSyncKeyRef.current = submittedLotSyncKey(next);
        const nextSubmittedDraft: ManualDraft = {
          lotNumber: draftValues.lotNumber,
          title: draftValues.title,
          reserveStatus: draftValues.reserveStatus,
          bid: draftValues.bid,
        };
        setSubmittedValues(nextSubmittedDraft);
        setPhotoPreviewLotNumber(nextSubmittedDraft.lotNumber.trim());
        const nextSubmittedKey = getLotKey(
          next.localControllerSubmitted?.currentLot ?? next.state.currentLot,
        );
        if (
          nextSubmittedKey !== "" &&
          previousSubmittedKey !== "" &&
          nextSubmittedKey !== previousSubmittedKey
        ) {
          bidIsDirtyRef.current = false;
          const nextSubmitted = manualDraftFromEnvelope(next);
          setSubmittedValues(nextSubmitted);
          setDraftValues(nextSubmitted);
          setPhotoPreviewLotNumber(nextSubmitted.lotNumber.trim());
          setSubmittedBidLabel(submittedBidLabelFromEnvelope(next));
          setSubmittedBidAmount(submittedBidAmountFromEnvelope(next));
        }
      } else if (label === "Manual bid") {
        bidIsDirtyRef.current = false;
        const submittedAmount = parseBidDraft(draftValues.bid);
        const formatted =
          submittedAmount !== null ? formatBidDraft(submittedAmount) : draftValues.bid;
        setSubmittedValues((current) => ({ ...current, bid: formatted }));
        setSubmittedBidLabel(formatted);
        setSubmittedBidAmount(submittedAmount);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExportOffline() {
    if (isDownloadActive || !canExportOffline) return;
    if (downloadDismissTimerRef.current !== null) {
      window.clearTimeout(downloadDismissTimerRef.current);
      downloadDismissTimerRef.current = null;
    }
    setExportInProgress(true);
    setCurrentDownloadNotice(null);
    setExportProgress({
      phase: "preparing",
      completed: 0,
      total: 100,
      percent: 0,
      message: "Preparing export…",
    });
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await startWebpageExport(projectId);
      if (!result.ok) {
        setCurrentDownloadNotice(
          createCurrentDownloadNotice({
            type: "error",
            message: result.error ?? "Download failed.",
          }),
        );
        setExportInProgress(false);
        setExportProgress(null);
      }
    } catch (error) {
      setCurrentDownloadNotice(
        createCurrentDownloadNotice({
          type: "error",
          message: error instanceof Error ? error.message : "Download failed.",
        }),
      );
      setExportInProgress(false);
      setExportProgress(null);
    }
  }

  async function handleOpenDownloadFolder() {
    if (!canControl) return;
    try {
      await openOfflineDownloadFolder(projectId);
    } catch (error) {
      setCurrentDownloadNotice(
        createCurrentDownloadNotice({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unable to open download folder.",
        }),
      );
    }
  }

  async function handleConfirmClearDownloads() {
    if (savedDownloadCount === 0 || clearingDownloads) {
      return;
    }
    setClearingDownloads(true);
    setActionError(null);
    setCurrentDownloadNotice(null);
    try {
      const result = await clearOfflineDownloads(projectId);
      if (!result.ok) {
        throw new Error(result.error ?? "Unable to clear downloads.");
      }
      if (result.dataset) {
        setActiveDataset(result.dataset);
      } else {
        setActiveDataset(null);
      }
      if (result.envelope) {
        setEnvelope(result.envelope);
        lotIsDirtyRef.current = false;
        bidIsDirtyRef.current = false;
        titleEditedRef.current = false;
        reserveEditedRef.current = false;
        lotEditingSourceRef.current = "manual-entry";
        appliedEditingStableIdRef.current = null;
        lotDraftSyncKeyRef.current = submittedLotSyncKey(result.envelope);
        const nextSubmitted = manualDraftFromEnvelope(result.envelope);
        lastProcessedNormalizedLotRef.current = normalizeLotNumberForMatch(
          nextSubmitted.lotNumber,
        );
        lotNumberInputRef.current = nextSubmitted.lotNumber;
        setSubmittedValues(nextSubmitted);
        setDraftValues(nextSubmitted);
        setPhotoPreviewLotNumber(nextSubmitted.lotNumber.trim());
        setSubmittedBidLabel(submittedBidLabelFromEnvelope(result.envelope));
        setSubmittedBidAmount(submittedBidAmountFromEnvelope(result.envelope));
      }
      setExportProgress(null);
      setShowClearDownloadsDialog(false);
      setCurrentDownloadNotice(
        createCurrentDownloadNotice({
          type: "info",
          message: "All local downloads were cleared.",
        }),
      );
      logLocalControllerDatasetDiagnostics({
        activeDataset: result.dataset ?? null,
        envelope: result.envelope ?? envelope,
        reason: "clear-all-downloads",
      });
      void refreshSavedDownloadCount();
      window.requestAnimationFrame(() => {
        clearDownloadsButtonRef.current?.focus();
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unable to clear downloads.");
    } finally {
      setClearingDownloads(false);
    }
  }

  function handleCancelClearDownloads() {
    if (clearingDownloads) return;
    setShowClearDownloadsDialog(false);
    window.requestAnimationFrame(() => {
      clearDownloadsButtonRef.current?.focus();
    });
  }

  async function handleLoadOffline() {
    if (!canControl || isLoadingPackage) return;
    setIsLoadingPackage(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await loadOfflineAuction(projectId);
      if (result.cancelled) {
        return;
      }
      if (!result.ok) {
        setActionError(result.error ?? "Unable to load the selected download folder.");
        return;
      }
      if (result.dataset) {
        setActiveDataset(result.dataset);
      }
      if (result.envelope) {
        setEnvelope(result.envelope);
      }
      lotEditingSourceRef.current = "downloaded-selection";
      appliedEditingStableIdRef.current = null;
      lastProcessedNormalizedLotRef.current = null;
      void refreshSavedDownloadCount();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to load the selected download folder.",
      );
    } finally {
      setIsLoadingPackage(false);
    }
  }

  const downloadButtonLabel = isDownloadActive
    ? "Download in Progress"
    : "Download Current Webpage";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Local Controller"
        description="Edit manual on-air values for displays when Local Controller is the selected data source."
        action={<DataSourceStatusPill pageSource="local-controller" />}
      />
      {canControl ? (
        <Card>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Current Download
              </p>
              <p
                className="mt-1 truncate text-sm text-foreground"
                title={activeDataset?.tooltip ?? datasetUsingLabel(activeDataset)}
              >
                {datasetUsingLabel(activeDataset)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isDownloadActive || !canExportOffline}
                onClick={() => void handleExportOffline()}
              >
                {downloadButtonLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isLoadingPackage}
                onClick={() => void handleLoadOffline()}
              >
                Load
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleOpenDownloadFolder()}
              >
                Open Folder
              </Button>
              <Button
                ref={clearDownloadsButtonRef}
                type="button"
                size="sm"
                variant="destructive"
                disabled={!hasSavedDownloads || clearingDownloads}
                onClick={() => {
                  if (!hasSavedDownloads || clearingDownloads) return;
                  setShowClearDownloadsDialog(true);
                }}
              >
                Clear All Downloads
              </Button>
            </div>

            {currentDownloadNotice ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  currentDownloadNotice.type === "error"
                    ? "border-danger/30 bg-danger/10 text-danger"
                    : currentDownloadNotice.type === "warning"
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : currentDownloadNotice.type === "success"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-primary/30 bg-primary/10 text-primary"
                }`}
                aria-live="polite"
              >
                <p>{currentDownloadNotice.message}</p>
                {currentDownloadNotice.code === "missing-scraper-credentials" ? (
                  <Link
                    href={`/projects/${projectSlug}/data-engines`}
                    className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Open Webpage Scraper Settings
                  </Link>
                ) : null}
              </div>
            ) : null}

            {activeExportOperation && exportProgress && exportProgress.phase !== "idle" ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <p className="truncate font-medium text-foreground">
                    {activeExportOperation
                      ? getWebpageExportProgressTitle(activeExportOperation)
                      : exportProgress.phase === "error"
                        ? "Download Failed"
                        : exportProgress.phase === "complete"
                          ? "Download Complete"
                          : "Downloading Current Webpage"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-surface-raised"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={exportProgress.percent}
                      aria-label="Current webpage download progress"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          activeExportOperation?.status === "failed" ||
                          exportProgress.phase === "error"
                            ? "bg-danger"
                            : "bg-primary"
                        }`}
                        style={{
                          width: `${Math.max(0, Math.min(100, exportProgress.percent))}%`,
                        }}
                      />
                    </div>
                  </div>
                  {activeExportOperation &&
                  isActiveWebpageExportStatus(activeExportOperation.status) ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 shrink-0 self-center px-2.5"
                      disabled={activeExportOperation.status === "cancelling"}
                      onClick={() =>
                        void cancelCurrentWebpageDownload(activeExportOperation.operationId)
                      }
                    >
                      {activeExportOperation.status === "cancelling"
                        ? "Cancelling…"
                        : "Cancel"}
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-start gap-2 text-xs text-muted">
                  <span className="w-10 shrink-0 tabular-nums text-foreground">
                    {exportProgress.percent}%
                  </span>
                  <span className="min-w-0 flex-1 truncate">{exportProgress.message}</span>
                </div>
              </div>
            ) : null}
            {!canExportOffline ? (
              <p className="text-sm text-muted">
                A successful Webpage Scraper snapshot is required before Downloading Current Webpage.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {showClearDownloadsDialog ? (
        <ConfirmDialog
          title="Clear All Downloads?"
          description="This will permanently delete all downloaded JSON files and locally stored photos for Broad Arrow Auctions. This cannot be undone."
          confirmLabel="Clear All Downloads"
          confirmVariant="destructive"
          busyLabel="Clearing…"
          onCancel={handleCancelClearDownloads}
          onConfirm={handleConfirmClearDownloads}
        />
      ) : null}

      {actionMessage ? <Alert>{actionMessage}</Alert> : null}
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <section className="h-full">
          <Card className={MANUAL_CARD_CLASS}>
            <div className={MANUAL_CARD_BODY_CLASS}>
              <div className={MANUAL_CARD_HEADING_ROW_CLASS}>
                <h3 className="text-sm font-semibold text-foreground">Manual Lot Selection</h3>
                <div className={MANUAL_CARD_HEADING_ACTIONS_CLASS} aria-hidden="true" />
              </div>
          {canControl ? (
            <>
              <div className={MANUAL_SUMMARY_BOX_CLASS}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Current Lot</p>
                <dl className="mt-2 grid gap-1">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted">Current Lot Number:</dt>
                    <dd className="text-foreground">{submittedValues.lotNumber || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted">Current Lot Title:</dt>
                    <dd className="text-foreground">{submittedValues.title || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted">Reserve Status:</dt>
                    <dd className="text-foreground">{currentReserveSummaryLabel || "—"}</dd>
                  </div>
                </dl>
              </div>
              <div className={MANUAL_PRIMARY_FIELD_GROUP_CLASS}>
                <span className={MANUAL_PRIMARY_LABEL_CLASS}>Lot number</span>
                <div className={MANUAL_PRIMARY_INPUT_ROW_CLASS}>
                  <input
                    value={draftValues.lotNumber}
                    autoComplete="off"
                    onFocus={() => {
                      setIsLotNumberFocused(true);
                      lotEditingSourceRef.current = "manual-entry";
                    }}
                    onBlur={() => {
                      setIsLotNumberFocused(false);
                    }}
                    onChange={(event) => {
                      lotNumberInputRef.current = event.target.value;
                      lotEditingSourceRef.current = "manual-entry";
                      updateLotDraftField("lotNumber", event.target.value);
                    }}
                    className={`${dirtyFieldClassName(isLotNumberDirty)} h-10 min-w-0 flex-1`}
                  />
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    className={MANUAL_ROW_BUTTON_CLASS}
                    disabled={isSubmittingLot || !canSelectPrevious}
                    aria-disabled={isSubmittingLot || !canSelectPrevious}
                    onClick={handlePreviousLot}
                  >
                    Previous Lot
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    className={MANUAL_ROW_BUTTON_CLASS}
                    disabled={isSubmittingLot || !canSelectNext}
                    aria-disabled={isSubmittingLot || !canSelectNext}
                    onClick={handleNextLot}
                  >
                    Next Lot
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    className={MANUAL_ROW_BUTTON_CLASS}
                    disabled={lotSubmitDisabled}
                    onClick={() =>
                      void runSubmitAction("Manual lot", async () => {
                        await localPatchBagManualLot(projectId, {
                          lotNumber: draftValues.lotNumber,
                          title: draftValues.title,
                          reserveStatus: draftValues.reserveStatus,
                        });
                        return localSubmitBagManualLot(projectId);
                      })
                    }
                  >
                    Submit
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid flex-1 gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-muted">Title</span>
                  <input
                    value={draftValues.title}
                    autoComplete="off"
                    onChange={(event) => {
                      titleEditedRef.current = true;
                      updateLotDraftField("title", event.target.value);
                    }}
                    className={dirtyFieldClassName(isTitleDirty)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted">Reserve status</span>
                  <select
                    value={draftValues.reserveStatus}
                    onChange={(event) => {
                      reserveEditedRef.current = true;
                      updateLotDraftField(
                        "reserveStatus",
                        normalizeDraftReserveStatus(event.target.value),
                      );
                    }}
                    className={dirtyFieldClassName(isReserveDirty)}
                  >
                    {MANUAL_RESERVE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <LotPhotoThumbnails
                  key={`lot-photos-${projectId}`}
                  projectId={projectId}
                  lotNumber={photoPreviewLotNumber ?? ""}
                  canManage={canControl}
                />
              </div>

            </>
          ) : (
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted">Lot number</dt>
                <dd className="text-foreground">
                  {envelope.localControllerSubmitted?.currentLot?.lotNumber ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Title</dt>
                <dd className="text-foreground">
                  {envelope.localControllerSubmitted?.currentLot?.title ?? "—"}
                </dd>
              </div>
            </dl>
          )}
            </div>
          </Card>
        </section>

        {canControl ? (
          <section className="h-full">
            <Card className={MANUAL_CARD_CLASS}>
            <div className={MANUAL_CARD_BODY_CLASS}>
            <div className={MANUAL_CARD_HEADING_ROW_CLASS}>
              <h3 className="text-sm font-semibold text-foreground">Manual Bid</h3>
              <div className={MANUAL_CARD_HEADING_ACTIONS_CLASS}>
              {currencyRates && formatRatesUpdatedAt(currencyRates) ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="!h-5 !w-auto !min-w-0 shrink-0 whitespace-nowrap !px-1.5 !py-0.5 text-xs leading-none"
                    disabled={isRefreshingRates}
                    aria-label="Refresh Rates"
                    onClick={() => void refreshRatesManually()}
                  >
                    {isRefreshingRates ? "Refreshing Rates…" : "Refresh Rates"}
                  </Button>
                  <span className="text-xs text-muted">
                    Rates updated {formatRatesUpdatedAt(currencyRates)}
                  </span>
                </>
              ) : null}
              </div>
            </div>
              <div className={MANUAL_SUMMARY_BOX_CLASS}>
                <p
                  id="current-bid-summary-label"
                  className="text-xs font-medium uppercase tracking-wide text-muted"
                >
                  Current Bid
                </p>
                <p
                  className="mt-2 text-foreground"
                  aria-labelledby="current-bid-summary-label"
                >
                  {submittedBidLabel}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted">
                  {SUPPORTED_CURRENCY_CODES.map((currency) => (
                    <div key={currency} className="flex flex-wrap gap-x-2">
                      <span>{currency}</span>
                      <span className="text-foreground">
                        {submittedBidAmount != null && currencyRates
                          ? formatConvertedUsdAmount(
                              submittedBidAmount,
                              currency as SupportedCurrencyCode,
                              currencyRates.rates[currency as SupportedCurrencyCode],
                            )
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={MANUAL_PRIMARY_FIELD_GROUP_CLASS}>
                <span className={MANUAL_PRIMARY_LABEL_CLASS}>Bid</span>
                <div className={MANUAL_PRIMARY_INPUT_ROW_CLASS}>
                  <input
                    value={draftValues.bid}
                    autoComplete="off"
                    inputMode="decimal"
                    onChange={(event) => updateBidDraftValue(event.target.value)}
                    className={`${dirtyFieldClassName(isBidDirty)} ${MANUAL_PRIMARY_INPUT_IN_ROW_CLASS}`}
                  />
                  <Button
                    type="button"
                    size="md"
                    className={MANUAL_ROW_BUTTON_CLASS}
                    disabled={bidSubmitDisabled}
                    onClick={() =>
                      void runSubmitAction("Manual bid", async () => {
                        await localSetBagManualBid(projectId, draftValues.bid);
                        return localSubmitBagManualBid(projectId);
                      })
                    }
                  >
                    Submit
                  </Button>
                </div>
              </div>

              {currencyRatesError ? (
                <p className="mt-2 text-xs text-danger">{currencyRatesError}</p>
              ) : null}

              <div className="mt-4 space-y-2">
                <div className="space-y-1.5">
                  <p className="text-sm text-muted">Increase Bid</p>
                  <div className="flex flex-wrap gap-2">
                    {BAG_BID_INCREMENTS.map((delta) => (
                      <Button
                        key={delta}
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Increase bid by ${delta.toLocaleString()}`}
                        onClick={() => adjustBidDraft(delta)}
                      >
                        +{delta.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm text-muted">Decrease Bid</p>
                  <div className="flex flex-wrap gap-2">
                    {BAG_BID_INCREMENTS.map((amount) => {
                      const delta = -amount;
                      return (
                        <Button
                          key={delta}
                          type="button"
                          size="sm"
                          variant="secondary"
                          aria-label={`Decrease bid by ${amount.toLocaleString()}`}
                          onClick={() => adjustBidDraft(delta)}
                        >
                          {delta.toLocaleString()}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}
