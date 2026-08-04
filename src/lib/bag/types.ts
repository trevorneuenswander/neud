export const BAG_LIVE_STATE_SCHEMA_VERSION = 1;

export const BAG_BID_INCREMENTS = [1000, 1500, 2500, 5000, 10000] as const;

export const BAG_BID_INCREASE_INCREMENTS = BAG_BID_INCREMENTS;
export const BAG_BID_DECREASE_INCREMENTS = BAG_BID_INCREMENTS.map((amount) => -amount);

export type BagConnectionStatus =
  | "stopped"
  | "starting"
  | "connected"
  | "scraping"
  | "disconnected"
  | "retrying"
  | "error";

export type BagLiveStateMode = "automatic" | "manual";

export type BagLiveLot = {
  id?: string;
  lotNumber?: string;
  title?: string;
  description?: string;
  year?: string;
  currentBid?: number;
  currentBidLabel?: string;
  currency?: string;
  sold?: boolean;
  passed?: boolean;
  reserveStatus?: string;
  imageUrl?: string;
  detailUrl?: string;
  status?: string;
};

export type BagLiveState = {
  schemaVersion: typeof BAG_LIVE_STATE_SCHEMA_VERSION;
  projectId: string;
  engineId: string;
  mode: BagLiveStateMode;
  connection: {
    status: BagConnectionStatus;
    lastSuccessfulScrapeAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
  };
  currentLot: BagLiveLot | null;
  previousLot: BagLiveLot | null;
  nextLots: BagLiveLot[];
  lastSold: BagLiveLot | null;
  lots: BagLiveLot[];
  lotCount: number;
  auctionDisplay?: Record<string, unknown> | null;
  source: {
    type: "scraper" | "manual" | "restored";
    snapshotId?: string;
    capturedAt?: string;
  };
  updatedAt: string;
};

export type BagManualSession = {
  startedAt: string | null;
  startedBy: string | null;
  restoredFromPreviousSession: boolean;
};

export type BagAutomaticComparison = {
  hasNewerAutomaticData: boolean;
  differsFromManual: boolean;
  automaticUpdatedAt?: string;
  automaticCurrentLotNumber?: string;
  automaticCurrentBidLabel?: string;
};

export type LocalControllerDraft = {
  lotNumber: string;
  title: string;
  reserveStatus: string;
  currentBid: number | null;
  currentBidLabel: string;
  lotDirty: boolean;
  bidDirty: boolean;
};

export type BagLiveStateEnvelope = {
  state: BagLiveState;
  automaticState: BagLiveState | null;
  manualSession: BagManualSession | null;
  automaticComparison: BagAutomaticComparison | null;
  latestScrapedCurrentLot?: BagLiveLot | null;
  localControllerDraft?: LocalControllerDraft | null;
  localControllerSubmitted?: BagLiveState | null;
  manualLotNavigation?: {
    cursorLotId: string | null;
  } | null;
  manualLotNavigationCapabilities?: {
    cursorLotId: string | null;
    canSelectPrevious: boolean;
    canSelectNext: boolean;
  } | null;
};

export type BagLiveStateUpdatedEvent = {
  type: "bag.live-state.updated";
  projectId: string;
  state: BagLiveState;
  automaticState?: BagLiveState | null;
  automaticComparison?: BagAutomaticComparison | null;
  manualSession?: BagManualSession | null;
  latestScrapedCurrentLot?: BagLiveLot | null;
  localControllerDraft?: LocalControllerDraft | null;
  localControllerSubmitted?: BagLiveState | null;
};

export type BagControllerInfo = {
  projectId: string;
  engineId: string | null;
  displayUrl: string;
  liveUrl: string;
  eventsUrl: string;
};

export type BagBidCalculatorPreview = {
  amount: number;
  label: string;
};
