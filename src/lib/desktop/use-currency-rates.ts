"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrencyRates, refreshCurrencyRatesNow } from "@/lib/desktop/currency-rates-client";
import { isDesktopEnvironment } from "@/lib/desktop/client";
import type { CurrencyRates } from "@/lib/desktop/types";

export function useCurrencyRates() {
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!isDesktopEnvironment()) return;

    let cancelled = false;

    const load = async () => {
      try {
        const cached = await getCurrencyRates();
        if (!cancelled) {
          setRates(cached);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRates(null);
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load currency rates.",
          );
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshRatesManually = useCallback(async () => {
    if (!isDesktopEnvironment()) return null;
    if (refreshInFlightRef.current) {
      return rates;
    }

    refreshInFlightRef.current = true;
    setIsRefreshingRates(true);

    try {
      const nextRates = await refreshCurrencyRatesNow();
      setRates(nextRates);
      setError(null);
      return nextRates;
    } catch (refreshError) {
      try {
        const cached = await getCurrencyRates();
        setRates(cached);
      } catch {
        setRates(null);
      }
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh currency rates.",
      );
      return null;
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshingRates(false);
    }
  }, [rates]);

  return {
    rates,
    error,
    isRefreshingRates,
    refreshRatesManually,
  };
}
