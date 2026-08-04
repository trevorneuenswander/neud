import type { ManualControllerDraft } from "@/lib/bag/downloaded-lot-navigation";
import { formatReserveStatusLabel } from "@/lib/bag/reserve-status";

export function reserveStatusSummaryLabel(
  draft: ManualControllerDraft,
  lot?: { reserveStatusLabel?: string },
): string {
  if (lot?.reserveStatusLabel?.trim()) {
    return lot.reserveStatusLabel;
  }
  const label = formatReserveStatusLabel(draft.reserveStatus);
  return label === "Unknown" ? "—" : label;
}

export function bidSummaryLabel(bid: string, bidAmount: number | null): string {
  if (bid.trim()) return bid;
  if (bidAmount != null) {
    return `$${bidAmount.toLocaleString("en-US")}`;
  }
  return "—";
}
