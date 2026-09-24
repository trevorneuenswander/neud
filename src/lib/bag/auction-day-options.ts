import { detectAuctionDaysFromLotNumbers } from "@/lib/bag/auction-day-from-lot";

export function collectLotNumbersForAuctionDayDetection(
  sources: Array<Array<string | null | undefined>>,
): string[] {
  for (const source of sources) {
    const cleaned = source
      .map((value) => (value == null ? "" : String(value).trim()))
      .filter(Boolean);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }
  return [];
}

export function detectAuctionDayOptionsFromLotNumbers(
  lotNumbers: Iterable<string | null | undefined>,
): number[] {
  return detectAuctionDaysFromLotNumbers(lotNumbers);
}
