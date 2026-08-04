export type BroadArrowReserveDetails = {
  noReserve: boolean;
  reservesOff: boolean;
  reservePriceRaw: string | null;
  reservePrice: number | null;
};

export function deriveBroadArrowReserveStatusLabel(input: {
  noReserve: boolean;
  reservesOff: boolean;
  reservePrice: number | null;
}): string {
  if (input.noReserve) {
    return "No Reserve";
  }
  if (input.reservesOff) {
    return "Reserve Off";
  }
  if (input.reservePrice !== null && input.reservePrice > 0) {
    return "Reserve";
  }
  return "Unknown";
}

export function readReserveDetailsFromDetail(detail: {
  noReserve?: boolean | null;
  reservesOff?: boolean | null;
  reservePriceRaw?: string | null;
  reservePrice?: number | null;
}): BroadArrowReserveDetails {
  return {
    noReserve: detail.noReserve === true,
    reservesOff: detail.reservesOff === true,
    reservePriceRaw:
      typeof detail.reservePriceRaw === "string" ? detail.reservePriceRaw : null,
    reservePrice:
      typeof detail.reservePrice === "number" && Number.isFinite(detail.reservePrice)
        ? detail.reservePrice
        : null,
  };
}
