import type { ReserveStatus } from "@/lib/bag/reserve-status";

export function getLotKey(lot: {
  id?: string | null;
  lotNumber?: string | null;
  lot?: string | null;
} | null | undefined): string {
  if (!lot) return "";
  if (lot.id) return `id:${lot.id}`;
  const raw = (lot.lotNumber ?? lot.lot ?? "").replace(/^lot\s+/i, "").trim().toLowerCase();
  return raw ? `lot:${raw}` : "";
}

export type { ReserveStatus };
