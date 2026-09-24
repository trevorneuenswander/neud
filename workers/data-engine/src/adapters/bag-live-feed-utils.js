/** Pure helpers for Broad Arrow event-driven live feed (worker + tests). */

export function isBagEventDrivenLiveEnabled() {
  const flag = process.env.NEUD_BAG_EVENT_DRIVEN_LIVE;
  if (flag === "0" || flag === "false") {
    return false;
  }
  if (flag === "1" || flag === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

export function resolveBackgroundRefreshIntervalMs(settings) {
  const configured = settings?.poll_interval_ms;
  if (typeof configured === "number" && Number.isFinite(configured) && configured >= 5000) {
    return configured;
  }
  return 10_000;
}

export function resolveLegacyLivePollIntervalMs(settings) {
  const configured = settings?.poll_interval_ms;
  if (typeof configured === "number" && Number.isFinite(configured) && configured >= 250) {
    return configured;
  }
  return 2500;
}

export function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLotKey(value) {
  const cleaned = cleanText(value).replace(/^lot\s+/i, "");
  const numeric = cleaned.match(/\d+/);
  return numeric ? numeric[0] : cleaned.toLowerCase();
}

export function formatLotLabel(lotNumber) {
  const cleaned = cleanText(lotNumber);
  if (!cleaned) {
    return "";
  }
  if (/^lot\b/i.test(cleaned)) {
    return cleaned;
  }
  return `Lot ${cleaned}`;
}

export function formatBiddingPriceFromNumeric(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "";
  }
  return `$ ${Math.round(amount).toLocaleString("en-US")}`;
}

export function buildLiveFingerprint(event) {
  return [
    cleanText(event?.lotNumber),
    cleanText(event?.year),
    cleanText(event?.title),
    cleanText(event?.biddingPrice),
    Array.isArray(event?.currencies) ? event.currencies.join("|") : "",
    cleanText(event?.eventType),
  ].join("::");
}

export function buildAuctionDisplayPatchFromLiveEvent(event) {
  const lot = formatLotLabel(event?.lotNumber);
  const year = cleanText(event?.year);
  const title = cleanText(event?.title);
  const biddingPrice =
    cleanText(event?.biddingPrice) ||
    (typeof event?.currentBid === "number"
      ? formatBiddingPriceFromNumeric(event.currentBid)
      : "");

  const patch = {
    lot,
    year,
    title,
    biddingPrice,
    reserveStatus: cleanText(event?.reserveStatus),
    currencies: Array.isArray(event?.currencies)
      ? event.currencies.map((entry) => cleanText(entry)).filter(Boolean)
      : [],
    scrapedAt: new Date(event?.receivedAt ?? Date.now()).toISOString(),
  };

  if (Array.isArray(event?.photos) && event.photos.length > 0) {
    patch.photos = event.photos.filter(Boolean);
  }

  return patch;
}

export function preservePhotoArray(incoming, existing) {
  if (Array.isArray(incoming) && incoming.length > 0) {
    return incoming.filter(Boolean);
  }
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }
  return Array.isArray(existing) ? existing : [];
}

export function matchLotInCatalog(lots, input = {}) {
  const lotKey = normalizeLotKey(input.lotNumber ?? input.lot);
  const vehicleId = cleanText(input.vehicleId);

  if (!Array.isArray(lots) || lots.length === 0) {
    return {
      index: -1,
      row: null,
      catalogMatchFound: false,
      catalogMatchStrategy: "none",
    };
  }

  if (lotKey) {
    const byLot = lots.findIndex(
      (row) => normalizeLotKey(row?.lot) === lotKey,
    );
    if (byLot >= 0) {
      return {
        index: byLot,
        row: lots[byLot],
        catalogMatchFound: true,
        catalogMatchStrategy: "lotNumber",
      };
    }
  }

  if (vehicleId) {
    const byVehicle = lots.findIndex((row) => {
      const href = cleanText(row?.editHref);
      return href.includes(`/vehicles/${vehicleId}/`);
    });
    if (byVehicle >= 0) {
      return {
        index: byVehicle,
        row: lots[byVehicle],
        catalogMatchFound: true,
        catalogMatchStrategy: "vehicleIdEditHref",
      };
    }
  }

  const activeIndex = lots.findIndex((row) => row?.status && /active/i.test(row.status));
  if (activeIndex >= 0) {
    return {
      index: activeIndex,
      row: lots[activeIndex],
      catalogMatchFound: true,
      catalogMatchStrategy: "listingActiveStatus",
    };
  }

  return {
    index: -1,
    row: null,
    catalogMatchFound: false,
    catalogMatchStrategy: "none",
  };
}

export function mergeCatalogRowWithLive(catalogRow, livePatch, auctionDisplay) {
  const base = catalogRow && typeof catalogRow === "object" ? { ...catalogRow } : {};
  return {
    ...base,
    lot: formatLotLabel(livePatch?.lot) || base.lot || null,
    title: cleanText(livePatch?.title) || base.title || null,
    price: cleanText(livePatch?.biddingPrice) || base.price || "",
    status: base.status ?? "Active",
    editHref: base.editHref ?? null,
  };
}

export function recomputeLotRelationships(cache, anchor = {}) {
  const lots = Array.isArray(cache?.lots) ? cache.lots : [];
  const lotNumber =
    anchor.lotNumber ??
    cache?.auctionDisplay?.lot ??
    cache?.current?.lot ??
    null;

  const match = matchLotInCatalog(lots, {
    lotNumber,
    vehicleId: anchor.vehicleId,
  });

  if (match.index < 0) {
    const fallbackCurrent = mergeCatalogRowWithLive(
      cache?.current,
      cache?.auctionDisplay ?? {},
      cache?.auctionDisplay,
    );
    return {
      prev: cache?.prev ?? null,
      current: fallbackCurrent.lot ? fallbackCurrent : cache?.current ?? null,
      next: deriveNextLotsFromCatalog(lots, lotNumber, 3),
      catalogMatchFound: false,
      catalogMatchStrategy: match.catalogMatchStrategy,
      resolvedLotNumber: lotNumber,
    };
  }

  const current = mergeCatalogRowWithLive(
    match.row,
    cache?.auctionDisplay ?? {},
    cache?.auctionDisplay,
  );

  return {
    prev: lots[match.index - 1] ?? null,
    current,
    next: lots.slice(match.index + 1, match.index + 4),
    catalogMatchFound: true,
    catalogMatchStrategy: match.catalogMatchStrategy,
    resolvedLotNumber: current?.lot ?? lotNumber,
  };
}

export function applyLiveEventToCache(cache, event) {
  const livePatch = buildAuctionDisplayPatchFromLiveEvent(event);
  const previousPhotos = preservePhotoArray(undefined, cache?.auctionDisplay?.photos);

  const auctionDisplay = {
    ...(cache?.auctionDisplay && typeof cache.auctionDisplay === "object"
      ? cache.auctionDisplay
      : {}),
    ...livePatch,
    photos: preservePhotoArray(livePatch.photos, previousPhotos),
  };

  const nextCache = {
    ...cache,
    auctionDisplay,
    updatedAt: new Date().toISOString(),
    _livePatchMeta: {
      lastLivePatchAt: new Date().toISOString(),
      fayeVehicleId: cleanText(event?.vehicleId) || null,
      eventType: cleanText(event?.eventType) || "vehicle_update",
    },
  };

  const relationships = recomputeLotRelationships(nextCache, {
    lotNumber: livePatch.lot || event?.lotNumber,
    vehicleId: event?.vehicleId,
  });

  nextCache.prev = relationships.prev;
  nextCache.current = relationships.current;
  nextCache.next = relationships.next;
  nextCache._livePatchMeta = {
    ...nextCache._livePatchMeta,
    catalogMatchFound: relationships.catalogMatchFound,
    catalogMatchStrategy: relationships.catalogMatchStrategy,
    resolvedLotNumber: relationships.resolvedLotNumber,
  };

  return nextCache;
}

export function stripInternalLiveMetaForSnapshot(cache) {
  if (!cache || typeof cache !== "object") {
    return cache;
  }
  const { _livePatchMeta, _backgroundMergeMeta, ...publicCache } = cache;
  return publicCache;
}

export function mergeCatalogRefreshIntoCache(cache, catalogData) {
  const lots = Array.isArray(catalogData?.lots) ? catalogData.lots : [];
  if (lots.length === 0) {
    return cache;
  }

  const liveLot =
    cache?.auctionDisplay?.lot ??
    cache?.current?.lot ??
    null;

  const relationships = recomputeLotRelationships(
    { ...cache, lots },
    { lotNumber: liveLot },
  );

  const merged = {
    ...cache,
    lots,
    prev: relationships.prev,
    current: relationships.current,
    next: relationships.next,
    sourceUrl: cache?.sourceUrl,
    listingUrl: cache?.listingUrl,
    updatedAt: new Date().toISOString(),
    _backgroundMergeMeta: {
      lastBackgroundMergeAt: new Date().toISOString(),
    },
  };

  if (cache?.auctionDisplay && typeof cache.auctionDisplay === "object") {
    merged.auctionDisplay = {
      ...cache.auctionDisplay,
      photos: preservePhotoArray(undefined, cache.auctionDisplay.photos),
    };
  }

  return merged;
}

export function mergeLastSoldFromDetailCheck(cache, previousLotRow, detail, editUrl = null) {
  if (!detail?.sold || !previousLotRow) {
    return cache;
  }
  return {
    ...cache,
    lastSold: {
      lot: previousLotRow.lot,
      title: previousLotRow.title,
      price: detail.currentPrice
        ? `$ ${Number(detail.currentPrice).toLocaleString("en-US")}`
        : previousLotRow.price,
      editUrl: editUrl ?? previousLotRow.editHref ?? null,
    },
  };
}

export function enrichAuctionDisplayPhotosFromDetail(cache, detail) {
  if (!detail || !Array.isArray(detail.photoUrls) || detail.photoUrls.length === 0) {
    return cache;
  }
  const photos = detail.photoUrls.filter(Boolean);
  return {
    ...cache,
    auctionDisplay: {
      ...(cache?.auctionDisplay && typeof cache.auctionDisplay === "object"
        ? cache.auctionDisplay
        : {}),
      photos: preservePhotoArray(photos, cache?.auctionDisplay?.photos),
    },
  };
}

export function deriveNextLotsFromCatalog(lots, currentLotNumber, maxCount = 3) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return [];
  }
  const target = normalizeLotKey(currentLotNumber);
  let activeIndex = lots.findIndex(
    (row) => normalizeLotKey(row?.lot) === target,
  );
  if (activeIndex < 0) {
    activeIndex = lots.findIndex((row) => row?.status && /active/i.test(row.status));
  }
  if (activeIndex < 0) {
    return lots.slice(0, maxCount);
  }
  return lots.slice(activeIndex + 1, activeIndex + 1 + maxCount);
}

export function buildRuntimeDiagnosticsFromCache(cache, liveFeedRuntime = null) {
  const nextLots = Array.isArray(cache?.next)
    ? cache.next.map((row) => cleanText(row?.lot)).filter(Boolean)
    : [];
  return {
    currentActiveLot: cleanText(cache?.current?.lot) || cleanText(cache?.auctionDisplay?.lot) || null,
    previousLot: cleanText(cache?.prev?.lot) || null,
    nextLots,
    lastSoldLot: cleanText(cache?.lastSold?.lot) || null,
    listingRowCount: Array.isArray(cache?.lots) ? cache.lots.length : null,
    liveFeedMode: liveFeedRuntime?.liveFeedActiveSource ?? liveFeedRuntime?.liveFeedMode ?? null,
    liveFeedModePreference:
      liveFeedRuntime?.liveFeedModePreference ?? liveFeedRuntime?.liveFeedMode ?? null,
    liveFeedHealth: liveFeedRuntime?.liveFeedHealth ?? null,
    lastLivePatchAt: cache?._livePatchMeta?.lastLivePatchAt ?? null,
    lastBackgroundMergeAt: cache?._backgroundMergeMeta?.lastBackgroundMergeAt ?? null,
    catalogMatchFound: cache?._livePatchMeta?.catalogMatchFound ?? null,
    photosAvailableForCurrentLot:
      Array.isArray(cache?.auctionDisplay?.photos) && cache.auctionDisplay.photos.length > 0,
    currentPhotoCount: Array.isArray(cache?.auctionDisplay?.photos)
      ? cache.auctionDisplay.photos.length
      : 0,
  };
}

export function normalizeLiveFeedModePreference(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "automatic") {
    return "faye";
  }
  if (normalized === "faye" || normalized === "dom" || normalized === "legacy") {
    return normalized;
  }
  return "faye";
}

export function formatLiveFeedModePreferenceLabel(value) {
  switch (normalizeLiveFeedModePreference(value)) {
    case "faye":
      return "Faye";
    case "dom":
      return "DOM";
    case "legacy":
      return "Legacy Polling";
    default:
      return "Faye";
  }
}

export function createInitialLiveFeedRuntimeState() {
  return {
    liveFeedModePreference: "faye",
    liveFeedActiveSource: "faye",
    liveFeedMode: "faye",
    liveFeedHealth: "recovering",
    lastLiveUpdateAt: null,
    lastLiveChangeAt: null,
    liveDataLatencyMs: null,
    fayeConnected: false,
    domObserverActive: false,
    legacyPollingActive: false,
    fayeObserverInstalled: false,
    fayeConnectionHealthy: false,
    domObserverInstalled: false,
    lastFayeTransportActivityAt: null,
    lastFayeApplicationEventAt: null,
    activeVehicleSubscriptionPresent: false,
    fallbackCount: 0,
    recoveryCount: 0,
    lastFallbackReason: null,
    background: {
      intervalMs: null,
      lastRunDurationMs: null,
      lastRunAt: null,
      missedIntervals: 0,
      scheduledStartAt: null,
      actualStartAt: null,
    },
    latency: {
      sampleCount: 0,
      min: null,
      median: null,
      p95: null,
      max: null,
      recentMs: [],
    },
    catalog: {
      activeDay: null,
      activeDayLotCount: null,
      cachedLotCount: 0,
    },
    sold: {
      lastTransitionLotChecked: null,
      backgroundReconciliationCount: 0,
    },
  };
}

export function recordLatencySample(state, totalMs) {
  if (typeof totalMs !== "number" || !Number.isFinite(totalMs)) {
    return state;
  }
  const recent = [...(state.latency?.recentMs ?? []), totalMs].slice(-200);
  const sorted = [...recent].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    ...state,
    liveDataLatencyMs: totalMs,
    latency: {
      sampleCount: recent.length,
      min: sorted[0] ?? null,
      median,
      p95: sorted[p95Index] ?? null,
      max: sorted[sorted.length - 1] ?? null,
      recentMs: recent,
    },
  };
}
