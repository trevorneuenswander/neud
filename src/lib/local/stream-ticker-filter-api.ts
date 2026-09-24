import { localFetch } from "@/lib/local/api";
import type { AuctionDayFilter } from "@/lib/bag/auction-day-from-lot";

export async function localGetStreamTickerDayFilter(projectSlug: string) {
  return localFetch<{
    filter: AuctionDayFilter;
    diagnostics?: Record<string, unknown>;
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/displays/stream-ticker/day-filter`);
}

export async function localSetStreamTickerDayFilter(
  projectSlug: string,
  filter: AuctionDayFilter,
) {
  return localFetch<{
    filter: AuctionDayFilter;
    detectedAuctionDays: number[];
    displayDataRevision?: number;
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/displays/stream-ticker/day-filter`, {
    method: "PATCH",
    body: JSON.stringify({ filter }),
  });
}
