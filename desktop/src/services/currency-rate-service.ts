import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";
import { NEUD_CURRENCY_API_KEY } from "../env/neud-env";

export const SUPPORTED_CURRENCY_CODES = ["EUR", "GBP", "CHF", "JPY"] as const;
export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export type CurrencyRates = {
  base: "USD";
  rates: Record<SupportedCurrencyCode, number>;
  updatedAt: string;
};

export const RATE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RATES: CurrencyRates = {
  base: "USD",
  rates: {
    EUR: 0.92,
    GBP: 0.79,
    CHF: 0.88,
    JPY: 150,
  },
  updatedAt: "1970-01-01T00:00:00.000Z",
};

function ratesFilePath(paths: AppPaths): string {
  return path.join(paths.root, "currency-rates.json");
}

function readCachedRates(paths: AppPaths): CurrencyRates {
  const filePath = ratesFilePath(paths);
  if (!fs.existsSync(filePath)) {
    return DEFAULT_RATES;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<CurrencyRates>;
    if (parsed.base !== "USD" || !parsed.rates || typeof parsed.updatedAt !== "string") {
      return DEFAULT_RATES;
    }

    const rates = {} as Record<SupportedCurrencyCode, number>;
    for (const code of SUPPORTED_CURRENCY_CODES) {
      const value = parsed.rates[code];
      rates[code] = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_RATES.rates[code];
    }

    return {
      base: "USD",
      rates,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return DEFAULT_RATES;
  }
}

function writeCachedRates(paths: AppPaths, rates: CurrencyRates) {
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(ratesFilePath(paths), JSON.stringify(rates, null, 2), "utf8");
}


async function fetchRatesFromProvider(): Promise<CurrencyRates | null> {
  const apiKey = NEUD_CURRENCY_API_KEY();
  const targetCodes = SUPPORTED_CURRENCY_CODES.join(",");

  const url = apiKey
    ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/USD`
    : `https://api.frankfurter.app/latest?from=USD&to=${targetCodes}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    const conversionRates =
      (payload.conversion_rates as Record<string, unknown> | undefined) ??
      (payload.rates as Record<string, unknown> | undefined);
    if (!conversionRates) return null;

    const rates = {} as Record<SupportedCurrencyCode, number>;
    for (const code of SUPPORTED_CURRENCY_CODES) {
      const value = conversionRates[code];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
      }
      rates[code] = value;
    }

    return {
      base: "USD",
      rates,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export class CurrencyRateService {
  private refreshPromise: Promise<CurrencyRates> | null = null;

  constructor(private readonly paths: AppPaths) {}

  getRates(): CurrencyRates {
    return readCachedRates(this.paths);
  }

  async refreshRatesIfStale(): Promise<CurrencyRates> {
    return readCachedRates(this.paths);
  }

  async refreshRatesNow(): Promise<CurrencyRates> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshRates().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async refreshRates(): Promise<CurrencyRates> {
    const cached = readCachedRates(this.paths);
    const fetched = await fetchRatesFromProvider();
    if (fetched) {
      writeCachedRates(this.paths, fetched);
      return fetched;
    }
    return cached;
  }
}

export function convertUsdAmount(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate);
}

export function formatConvertedAmount(
  amountUsd: number,
  _currency: SupportedCurrencyCode,
  rate: number,
): string {
  const converted = convertUsdAmount(amountUsd, rate);
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(converted);
}

export { buildManualBidCurrencyDisplayStrings } from "../displays/display-currency";
