import type { CurrencyRates } from "@/lib/desktop/types";

export const SUPPORTED_CURRENCY_CODES = ["EUR", "GBP", "CHF", "JPY"] as const;
export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export function formatConvertedUsdAmount(
  amountUsd: number,
  currency: SupportedCurrencyCode,
  rate: number,
): string {
  const converted = Math.round(amountUsd * rate);
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(converted);
}

export function formatRatesUpdatedAt(rates: CurrencyRates | null): string | null {
  if (!rates?.updatedAt) return null;
  const date = new Date(rates.updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}
