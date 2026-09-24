import type { AuctionDayFilter } from "@/lib/bag/auction-day-from-lot";

const SESSION_STREAM_TICKER_DAY_FILTER_PREFIX = "neud:stream-ticker:day-filter";

function sessionStorageKey(userId: string, projectId: string): string {
  return `${SESSION_STREAM_TICKER_DAY_FILTER_PREFIX}:${userId}:${projectId}`;
}

export function readSessionStreamTickerDayFilter(
  userId: string | null | undefined,
  projectId: string,
): AuctionDayFilter {
  if (!userId || typeof window === "undefined") {
    return "all";
  }

  try {
    const raw = sessionStorage.getItem(sessionStorageKey(userId, projectId));
    if (!raw || raw === "all") {
      return "all";
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : "all";
  } catch {
    return "all";
  }
}

export function writeSessionStreamTickerDayFilter(
  userId: string | null | undefined,
  projectId: string,
  filter: AuctionDayFilter,
): void {
  if (!userId || typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(
      sessionStorageKey(userId, projectId),
      filter === "all" ? "all" : String(filter),
    );
  } catch {
    // Ignore storage failures.
  }
}
