import type { CurrencyRates } from "@/lib/desktop/types";
import { getDesktopAPI } from "@/lib/desktop/client";

export async function getCurrencyRates(): Promise<CurrencyRates> {
  const api = getDesktopAPI();
  if (!api?.currencyRates) {
    throw new Error("Currency rates are unavailable outside the desktop app.");
  }
  return api.currencyRates.getRates();
}

export async function refreshCurrencyRatesIfStale(): Promise<CurrencyRates> {
  const api = getDesktopAPI();
  if (!api?.currencyRates) {
    throw new Error("Currency rates are unavailable outside the desktop app.");
  }
  return api.currencyRates.refreshIfStale();
}

export async function refreshCurrencyRatesNow(): Promise<CurrencyRates> {
  const api = getDesktopAPI();
  if (!api?.currencyRates?.refreshNow) {
    throw new Error("Currency rates are unavailable outside the desktop app.");
  }
  return api.currencyRates.refreshNow();
}
