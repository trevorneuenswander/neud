import type { AuctionDayFilter } from "@/lib/bag/auction-day-from-lot";

const SESSION_DAY_FILTER_PREFIX = "neud:local-controller:day-filter";

function sessionDayFilterStorageKey(userId: string, projectId: string): string {
  return `${SESSION_DAY_FILTER_PREFIX}:${userId}:${projectId}`;
}

export function readSessionAuctionDayFilter(
  userId: string | null | undefined,
  projectId: string,
): AuctionDayFilter {
  if (!userId || typeof window === "undefined") {
    return "all";
  }

  try {
    const raw = sessionStorage.getItem(sessionDayFilterStorageKey(userId, projectId));
    if (!raw || raw === "all") {
      return "all";
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : "all";
  } catch {
    return "all";
  }
}

export function writeSessionAuctionDayFilter(
  userId: string | null | undefined,
  projectId: string,
  filter: AuctionDayFilter,
): void {
  if (!userId || typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(
      sessionDayFilterStorageKey(userId, projectId),
      filter === "all" ? "all" : String(filter),
    );
  } catch {
    // Keep navigation usable even if session storage is unavailable.
  }
}
