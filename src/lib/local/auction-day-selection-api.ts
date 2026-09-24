import { localFetch } from "@/lib/local/api";
import type { AuctionDayFilter } from "@/lib/bag/auction-day-from-lot";

export async function localGetAuctionDaySelection(projectSlug: string) {
  return localFetch<{
    filter: AuctionDayFilter;
    detectedAuctionDays?: number[];
    diagnostics?: Record<string, unknown> & { detectedAuctionDays?: number[] };
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/auction-day-selection`);
}

export async function localSetAuctionDaySelection(
  projectSlug: string,
  filter: AuctionDayFilter,
) {
  return localFetch<{
    filter: AuctionDayFilter;
    detectedAuctionDays: number[];
    displayDataRevision?: number;
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/auction-day-selection`, {
    method: "PATCH",
    body: JSON.stringify({ filter }),
  });
}
