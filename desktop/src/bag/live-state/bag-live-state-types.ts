import type { LocalControllerDraft } from "./bag-local-controller-state";
import type {
  ManualLotNavigationCapabilities,
  ManualLotNavigationState,
} from "./bag-manual-lot-navigation";

export const BAG_LIVE_STATE_SCHEMA_VERSION = 1;

export const BAG_CONNECTION_STATUSES = [
  "stopped",
  "starting",
  "connected",
  "scraping",
  "disconnected",
  "retrying",
  "error",
] as const;

export type BagConnectionStatus = (typeof BAG_CONNECTION_STATUSES)[number];

export type BagLiveStateMode = "automatic" | "manual";

export type BagLiveSourceType = "scraper" | "manual" | "restored";

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

export type BagLiveConnection = {
  status: BagConnectionStatus;
  lastSuccessfulScrapeAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export type BagLiveSource = {
  type: BagLiveSourceType;
  snapshotId?: string;
  capturedAt?: string;
};

/**
 * Precedence:
 * active manual state → latest valid scraper state → last persisted valid state → empty state
 */
export type BagLiveState = {
  schemaVersion: typeof BAG_LIVE_STATE_SCHEMA_VERSION;
  projectId: string;
  engineId: string;
  mode: BagLiveStateMode;
  connection: BagLiveConnection;
  currentLot: BagLiveLot | null;
  previousLot: BagLiveLot | null;
  nextLots: BagLiveLot[];
  lastSold: BagLiveLot | null;
  lots: BagLiveLot[];
  lotCount: number;
  auctionDisplay?: Record<string, unknown> | null;
  source: BagLiveSource;
  updatedAt: string;
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
  manualLotNavigation?: ManualLotNavigationState | null;
  manualLotNavigationCapabilities?: ManualLotNavigationCapabilities | null;
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

export type BagLiveStateEnvelope = {
  state: BagLiveState;
  automaticState: BagLiveState | null;
  manualSession: BagManualSession | null;
  automaticComparison: BagAutomaticComparison | null;
  latestScrapedCurrentLot?: BagLiveLot | null;
  localControllerDraft?: LocalControllerDraft | null;
  localControllerSubmitted?: BagLiveState | null;
  manualLotNavigation?: ManualLotNavigationState | null;
  manualLotNavigationCapabilities?: ManualLotNavigationCapabilities | null;
};

export type ManualLotStatus = "sold" | "passed" | "clear";

export type BagSnapshotPayload = {
  prev?: Record<string, unknown> | null;
  current?: Record<string, unknown> | null;
  next?: Record<string, unknown>[] | null;
  lots?: Record<string, unknown>[] | null;
  lastSold?: Record<string, unknown> | null;
  auctionDisplay?: Record<string, unknown> | null;
  updatedAt?: string | null;
};
