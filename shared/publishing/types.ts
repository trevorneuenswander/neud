export type CanonicalDataSource = "webpage-scraper" | "local-controller";

/** Display-facing canonical project snapshot (matches desktop CanonicalProjectData). */
export type CanonicalProjectData = {
  prev?: Record<string, unknown> | null;
  current?: Record<string, unknown> | null;
  next?: Record<string, unknown>[];
  lots?: Record<string, unknown>[];
  lastSold?: Record<string, unknown> | null;
  auctionDisplay?: Record<string, unknown> | null;
  updatedAt?: string;
  dataSource: CanonicalDataSource;
};

export type NeudPublishedProjectSource = {
  mode: CanonicalDataSource;
  connected: boolean;
};

export type NeudPublishedProjectPublisher = {
  instanceId: string;
  lastSeenAt: string;
};
