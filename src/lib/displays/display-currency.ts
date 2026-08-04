import {
  SUPPORTED_CURRENCY_CODES,
  type SupportedCurrencyCode,
} from "@/lib/desktop/currency-format";

export type DisplayCurrency = {
  code: string;
  formattedValue: string;
  numericValue?: number | null;
};

export const DISPLAY_CURRENCY_ORDER = [...SUPPORTED_CURRENCY_CODES] as const;

function formatNumericAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(value);
}

function convertUsdAmount(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate);
}

export function formatCurrencyValueWithSymbol(
  code: SupportedCurrencyCode,
  amount: number,
): string {
  const formatted = formatNumericAmount(amount);
  switch (code) {
    case "EUR":
      return `€${formatted}`;
    case "GBP":
      return `£${formatted}`;
    case "CHF":
      return `CHF ${formatted}`;
    case "JPY":
      return `¥${formatted}`;
    default:
      return formatted;
  }
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

  return `${code}  ${value}`;
}

function parseNumericToken(raw: string): number | null {
  const normalized = raw.replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidDisplayCurrency(currency: DisplayCurrency): boolean {
  if (!currency.code.trim()) return false;
  if (!currency.formattedValue.trim()) return false;
  if (!/\d/.test(currency.formattedValue)) return false;
  if (currency.numericValue != null && currency.numericValue <= 0) return false;
  return true;
}

export function buildDisplayCurrenciesFromUsd(
  amountUsd: number,
  rates: { rates: Record<SupportedCurrencyCode, number> },
): DisplayCurrency[] {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return [];
  }

  return DISPLAY_CURRENCY_ORDER.map((code) => {
    const numericValue = convertUsdAmount(amountUsd, rates.rates[code]);
    return {
      code,
      formattedValue: formatCurrencyValueWithSymbol(code, numericValue),
      numericValue,
    };
  }).filter(isValidDisplayCurrency);
}

export function parseDisplayCurrencyEntry(
  entry: string,
  positionalCode?: SupportedCurrencyCode,
): DisplayCurrency | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const codedMatch = trimmed.match(/^([A-Z]{3})\b[:\s-]*(.+)$/i);
  if (codedMatch) {
    const code = codedMatch[1].toUpperCase();
    const remainder = codedMatch[2].trim();
    const numericValue = parseNumericToken(remainder);
    const formattedValue =
      remainder.startsWith("€") ||
      remainder.startsWith("£") ||
      remainder.startsWith("¥") ||
      /^CHF\b/i.test(remainder)
        ? remainder
        : formatNumericAmount(numericValue ?? 0);

    return {
      code,
      formattedValue,
      numericValue,
    };
  }

  if (!positionalCode) {
    return null;
  }

  const numericValue = parseNumericToken(trimmed);
  if (numericValue == null || numericValue <= 0) {
    return null;
  }

  return {
    code: positionalCode,
    formattedValue: formatCurrencyValueWithSymbol(positionalCode, numericValue),
    numericValue,
  };
}

export function normalizeDisplayCurrencies(
  rows: string[] | null | undefined,
): DisplayCurrency[] {
  if (!Array.isArray(rows)) return [];

  const parsed: DisplayCurrency[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const entry = rows[index];
    if (typeof entry !== "string") continue;
    const positionalCode = DISPLAY_CURRENCY_ORDER[index];
    const currency = parseDisplayCurrencyEntry(entry, positionalCode);
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
): string[] {
  return normalizeDisplayCurrencies(rows)
    .map(formatDisplayCurrencyRow)
    .filter(Boolean)
    .slice(0, DISPLAY_CURRENCY_ORDER.length);
}
