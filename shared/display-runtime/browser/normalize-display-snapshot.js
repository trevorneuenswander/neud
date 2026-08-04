(function installNeudDisplayRuntimeNormalization(global) {
  if (global.__NEUD_DISPLAY_RUNTIME_NORMALIZE_INSTALLED__) {
    return;
  }
  global.__NEUD_DISPLAY_RUNTIME_NORMALIZE_INSTALLED__ = true;

  var DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION = "2026-07-31.1";

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasCanonicalDisplayFields(candidate) {
    return Boolean(
      candidate.current ||
        candidate.dataSource ||
        Array.isArray(candidate.next) ||
        candidate.auctionDisplay ||
        candidate.broadArrowDisplay ||
        Array.isArray(candidate.lots) ||
        candidate.lastSold ||
        candidate.prev ||
        candidate.pylon ||
        candidate.ticker,
    );
  }

  function resolveDisplayRuntimeSnapshot(payload) {
    if (!isRecord(payload)) {
      return null;
    }

    var candidate =
      isRecord(payload.snapshot) && !Array.isArray(payload.snapshot)
        ? payload.snapshot
        : isRecord(payload.data) && !Array.isArray(payload.data)
          ? payload.data
          : isRecord(payload.broadArrowDisplay) && !Array.isArray(payload.broadArrowDisplay)
            ? payload.broadArrowDisplay
            : payload;

    if (!isRecord(candidate)) {
      return null;
    }

    if (candidate.pylon || candidate.ticker) {
      var merged = {};
      var pylon = isRecord(candidate.pylon) ? candidate.pylon : null;
      if (pylon) {
        merged.auctionDisplay =
          isRecord(pylon.auctionDisplay) && !Array.isArray(pylon.auctionDisplay)
            ? pylon.auctionDisplay
            : pylon;
      }
      var ticker = isRecord(candidate.ticker) ? candidate.ticker : null;
      if (ticker && Array.isArray(ticker.next)) {
        merged.next = ticker.next;
      }
      if (typeof candidate.updatedAt === "string") {
        merged.updatedAt = candidate.updatedAt;
      }
      merged.dataSource =
        (typeof candidate.dataSource === "string" ? candidate.dataSource : null) ||
        (typeof payload.dataSource === "string" ? payload.dataSource : null);
      if (isRecord(payload.current)) {
        merged.current = payload.current;
      }
      if (isRecord(payload.snapshot) && isRecord(payload.snapshot.current)) {
        merged.current = payload.snapshot.current;
      }
      return merged;
    }

    if (hasCanonicalDisplayFields(candidate)) {
      return candidate;
    }

    return null;
  }

  global.DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION = DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION;
  global.resolveDisplayRuntimeSnapshot = resolveDisplayRuntimeSnapshot;
  global.hasCanonicalDisplayFields = hasCanonicalDisplayFields;
})(typeof window !== "undefined" ? window : globalThis);
