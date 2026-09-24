/** Broad Arrow multi-day lot numbering: 101–199 → Day 1, 201–299 → Day 2, etc. */

export type AuctionDayFilter = "all" | number;

export function getAuctionDayFromLotNumber(
  lotNumber: string | number | null | undefined,
): number | null {
  if (lotNumber === null || lotNumber === undefined) {
    return null;
  }

  const raw = String(lotNumber).trim().replace(/^lot\s+/i, "");
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)/);
  if (!match?.[1]) {
    return null;
  }

  const numeric = Number.parseFloat(match[1]);
  if (!Number.isFinite(numeric) || numeric < 100) {
    return null;
  }

  const whole = Math.trunc(numeric);
  const day = Math.floor(whole / 100);
  const lotWithinDay = whole % 100;

  if (day < 1 || lotWithinDay < 1) {
    return null;
  }

  return day;
}

export function detectAuctionDaysFromLotNumbers(
  lotNumbers: Iterable<string | number | null | undefined>,
): number[] {
  const days = new Set<number>();
  for (const lotNumber of lotNumbers) {
    const day = getAuctionDayFromLotNumber(lotNumber);
    if (day !== null) {
      days.add(day);
    }
  }
  return [...days].sort((left, right) => left - right);
}

export function normalizeAuctionDayFilter(
  filter: AuctionDayFilter,
  availableDays: number[],
): AuctionDayFilter {
  if (filter === "all") {
    return "all";
  }
  return availableDays.includes(filter) ? filter : "all";
}
