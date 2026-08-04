import type { BagLiveLot } from "./bag-live-state-types";

export const BAG_BID_INCREMENTS = [
  -10000, -5000, -2500, -1500, -1000, 1000, 1500, 2500, 5000, 10000,
] as const;

export const MAX_LOT_NUMBER_LENGTH = 32;
export const MAX_LOT_TITLE_LENGTH = 240;
export const MAX_LOT_DESCRIPTION_LENGTH = 500;

export function formatBidLabel(amount: number, currency = "USD"): string {
  const prefix = currency === "USD" ? "$" : currency;
  return `${prefix} ${Math.round(amount).toLocaleString("en-US")}`;
}

export function parseBidInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[$€£,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount);
}

export function evaluateBidExpression(
  expression: string,
  currentBid: number | null | undefined,
): { ok: true; amount: number } | { ok: false; error: string } {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a calculator expression." };
  }

  const currentValue = currentBid ?? 0;
  const replaced = trimmed.replace(/\bcurrent\b/gi, String(currentValue));
  const sanitized = replaced.replace(/[$,\s]/g, "");

  if (!/^[\d+\-().]+$/.test(sanitized)) {
    return {
      ok: false,
      error: "Calculator supports numbers, current, +, -, and parentheses only.",
    };
  }

  try {
    const amount = parseSimpleExpression(sanitized);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "Bid cannot be negative." };
    }
    return { ok: true, amount: Math.round(amount) };
  } catch {
    return { ok: false, error: "Invalid calculator expression." };
  }
}

export function formatManualLotTitle(lot: {
  title?: string | null;
  year?: string | null;
}): string {
  const base = (lot.title ?? "").trim();
  const year = (lot.year ?? "").trim();
  if (!base && !year) return "";
  if (year && base && !base.startsWith(year)) {
    return `${year} ${base}`.trim();
  }
  return base || year;
}

export function validateManualLotPatch(patch: {
  lotNumber?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  reserveStatus?: string;
}): { ok: true; patch: typeof patch } | { ok: false; error: string } {
  if (patch.lotNumber !== undefined) {
    const lotNumber = patch.lotNumber.trim();
    if (!lotNumber || lotNumber.length > MAX_LOT_NUMBER_LENGTH) {
      return { ok: false, error: "Lot number is required and must be shorter." };
    }
    patch.lotNumber = lotNumber;
  }

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title || title.length > MAX_LOT_TITLE_LENGTH) {
      return { ok: false, error: "Title is required and must be shorter." };
    }
    patch.title = title;
  }

  if (patch.description !== undefined) {
    const description = patch.description.trim();
    if (description.length > MAX_LOT_DESCRIPTION_LENGTH) {
      return { ok: false, error: "Description is too long." };
    }
    patch.description = description;
  }

  if (patch.imageUrl !== undefined && patch.imageUrl.trim()) {
    try {
      const parsed = new URL(patch.imageUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Image URL must use http or https." };
      }
      patch.imageUrl = parsed.toString();
    } catch {
      return { ok: false, error: "Image URL is invalid." };
    }
  }

  if (patch.reserveStatus !== undefined) {
    patch.reserveStatus = patch.reserveStatus.trim();
  }

  return { ok: true, patch };
}

export function applyBidToLot(
  lot: BagLiveLot | null,
  amount: number,
  currency = "USD",
): BagLiveLot | null {
  if (!lot) return null;
  return {
    ...lot,
    currentBid: amount,
    currentBidLabel: formatBidLabel(amount, currency),
    currency,
  };
}

function parseSimpleExpression(input: string): number {
  let index = 0;

  function parseExpression(): number {
    let value = parseTerm();
    while (index < input.length) {
      const op = input[index];
      if (op === "+") {
        index += 1;
        value += parseTerm();
      } else if (op === "-") {
        index += 1;
        value -= parseTerm();
      } else {
        break;
      }
    }
    return value;
  }

  function parseTerm(): number {
    if (input[index] === "(") {
      index += 1;
      const value = parseExpression();
      if (input[index] !== ")") {
        throw new Error("Missing closing parenthesis.");
      }
      index += 1;
      return value;
    }

    const start = index;
    while (index < input.length && /[\d.]/.test(input[index] ?? "")) {
      index += 1;
    }
    if (start === index) {
      throw new Error("Expected number.");
    }
    return Number(input.slice(start, index));
  }

  const result = parseExpression();
  if (index !== input.length) {
    throw new Error("Unexpected trailing input.");
  }
  return result;
}
