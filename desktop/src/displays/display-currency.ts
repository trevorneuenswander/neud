import {
  SUPPORTED_CURRENCY_CODES,
  type SupportedCurrencyCode,
  convertUsdAmount,
} from "../services/currency-rate-service";

export type CurrencyDisplaySource = "local-controller" | "webpage-scraper";

export type DisplayCurrency = {
  code: SupportedCurrencyCode;
  rawValue: number | null;
  formattedValue: string;
  icon: string | null;
};

export const DISPLAY_CURRENCY_ORDER = [...SUPPORTED_CURRENCY_CODES] as const;

function formatThousandsEnUs(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatThousandsForSource(
  value: number,
  code: SupportedCurrencyCode,
  source: CurrencyDisplaySource,
): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded));

  if (source === "local-controller") {
    if (code === "EUR") {
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
    if (code === "CHF") {
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    }
  }

  return formatThousandsEnUs(rounded);
}

export function formatCurrencyValue(input: {
  code: SupportedCurrencyCode;
  value: number;
  source: CurrencyDisplaySource;
}): Pick<DisplayCurrency, "formattedValue" | "icon" | "rawValue"> {
  const rawValue = Math.round(input.value);
  const grouped = formatThousandsForSource(rawValue, input.code, input.source);

  if (input.source === "local-controller") {
    return {
      rawValue,
      formattedValue: grouped,
      icon: null,
    };
  }

  switch (input.code) {
    case "EUR":
      return { rawValue, formattedValue: `€${grouped}`, icon: "€" };
    case "GBP":
      return { rawValue, formattedValue: `£${grouped}`, icon: "£" };
    case "CHF":
      return { rawValue, formattedValue: grouped, icon: null };
    case "JPY":
      return { rawValue, formattedValue: `¥${grouped}`, icon: "¥" };
    default:
      return { rawValue, formattedValue: grouped, icon: null };
  }
}

/** @deprecated Prefer formatCurrencyValue with an explicit source. */
export function formatCurrencyValueWithSymbol(
  code: SupportedCurrencyCode,
  amount: number,
): string {
  return formatCurrencyValue({
    code,
    value: amount,
    source: "webpage-scraper",
  }).formattedValue;
}

export function formatDisplayCurrencyRow(currency: DisplayCurrency): string {
  const code = currency.code.trim().toUpperCase();
  const value = currency.formattedValue.trim();

  if (!code) {
    return value;
  }

  if (!value) {
    return "";
  }

  if (value.toUpperCase().startsWith(`${code} `)) {
    return value;
  }

  if (code === "CHF" && /^CHF\b/i.test(value)) {
    return value;
  }

  return `${code} ${value}`;
}

function parseNumericToken(raw: string): number | null {
  let normalized = raw
    .trim()
    .replace(/^[€£¥$]+/, "")
    .replace(/^CHF\s+/i, "")
    .trim();

  if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  } else if (/^\d{1,3}('\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/'/g, "");
  } else if (/^\d{1,3}(,\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(/[^\d.-]/g, "");
  }

  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidDisplayCurrency(currency: DisplayCurrency): boolean {
  if (!currency.code.trim()) return false;
  if (!currency.formattedValue.trim()) return false;
  if (!/\d/.test(currency.formattedValue)) return false;
  if (currency.rawValue != null && currency.rawValue <= 0) return false;
  return true;
}

export function buildDisplayCurrenciesFromUsd(
  amountUsd: number,
  rates: { rates: Record<SupportedCurrencyCode, number> },
  source: CurrencyDisplaySource = "local-controller",
): DisplayCurrency[] {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return [];
  }

  return DISPLAY_CURRENCY_ORDER.map((code) => {
    const numericValue = convertUsdAmount(amountUsd, rates.rates[code]);
    const formatted = formatCurrencyValue({ code, value: numericValue, source });
    return {
      code,
      rawValue: formatted.rawValue,
      formattedValue: formatted.formattedValue,
      icon: formatted.icon,
    };
  }).filter(isValidDisplayCurrency);
}

export function parseDisplayCurrencyEntry(
  entry: string,
  positionalCode?: SupportedCurrencyCode,
  source: CurrencyDisplaySource = "webpage-scraper",
): DisplayCurrency | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const codedMatch = trimmed.match(/^([A-Z]{3})\b[:\s-]*(.+)$/i);
  if (codedMatch) {
    const code = codedMatch[1].toUpperCase() as SupportedCurrencyCode;
    const remainder = codedMatch[2].trim();
    const numericValue = parseNumericToken(remainder);
    const hasScraperSymbol =
      remainder.startsWith("€") ||
      remainder.startsWith("£") ||
      remainder.startsWith("¥") ||
      /^CHF\b/i.test(remainder);

    let formattedValue = remainder;
    let icon: string | null = null;

    if (
      numericValue != null &&
      numericValue > 0 &&
      source === "local-controller" &&
      !hasScraperSymbol
    ) {
      const formatted = formatCurrencyValue({ code, value: numericValue, source });
      formattedValue = formatted.formattedValue;
      icon = formatted.icon;
    } else if (numericValue != null && numericValue > 0 && hasScraperSymbol) {
      if (remainder.startsWith("€")) icon = "€";
      if (remainder.startsWith("£")) icon = "£";
      if (remainder.startsWith("¥")) icon = "¥";
    } else if (numericValue != null && numericValue > 0 && !hasScraperSymbol) {
      formattedValue = formatCurrencyValue({
        code,
        value: numericValue,
        source,
      }).formattedValue;
    }

    return {
      code,
      formattedValue,
      rawValue: numericValue,
      icon,
    };
  }

  if (!positionalCode) {
    return null;
  }

  const numericValue = parseNumericToken(trimmed);
  if (numericValue == null || numericValue <= 0) {
    return null;
  }

  const formatted = formatCurrencyValue({
    code: positionalCode,
    value: numericValue,
    source,
  });

  return {
    code: positionalCode,
    formattedValue: formatted.formattedValue,
    rawValue: formatted.rawValue,
    icon: formatted.icon,
  };
}

export function normalizeDisplayCurrencies(
  rows: string[] | null | undefined,
  source: CurrencyDisplaySource = "webpage-scraper",
): DisplayCurrency[] {
  if (!Array.isArray(rows)) return [];

  const parsed: DisplayCurrency[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const entry = rows[index];
    if (typeof entry !== "string") continue;
    const positionalCode = DISPLAY_CURRENCY_ORDER[index];
    const currency = parseDisplayCurrencyEntry(entry, positionalCode, source);
    if (!currency || !isValidDisplayCurrency(currency)) continue;
    const code = currency.code.toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    parsed.push(currency);
  }

  const ordered: DisplayCurrency[] = [];
  for (const code of DISPLAY_CURRENCY_ORDER) {
    const match = parsed.find((entry) => entry.code.toUpperCase() === code);
    if (match) ordered.push(match);
  }

  return ordered;
}

export function formatDisplayCurrencyRowsForPylon(
  rows: string[] | null | undefined,
  source: CurrencyDisplaySource = "webpage-scraper",
): string[] {
  return normalizeDisplayCurrencies(rows, source)
    .map(formatDisplayCurrencyRow)
    .filter(Boolean)
    .slice(0, DISPLAY_CURRENCY_ORDER.length);
}

export function buildManualBidCurrencyDisplayStrings(
  amountUsd: number,
  rates: { rates: Record<SupportedCurrencyCode, number> },
): string[] {
  return buildDisplayCurrenciesFromUsd(amountUsd, rates, "local-controller").map(
    formatDisplayCurrencyRow,
  );
}
