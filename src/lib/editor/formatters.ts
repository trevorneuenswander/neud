/**
 * Declarative formatter pipeline for graphic text values.
 * No JavaScript expressions — ordered steps only.
 */

import type { EditableFormatterStep } from "./editable-graphic-types";

function toTitleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatNumber(value: string, decimals?: number, commas?: boolean): string {
  const num = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(num)) return value;
  const fixed =
    typeof decimals === "number" && decimals >= 0 ? num.toFixed(decimals) : String(num);
  if (!commas) return fixed;
  const [intPart, frac] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null ? `${withCommas}.${frac}` : withCommas;
}

function formatCurrency(value: string, currency = "USD", decimals = 2): string {
  const num = Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(num)) return value;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  } catch {
    return `$${formatNumber(String(num), decimals, true)}`;
  }
}

function formatDate(value: string, format: "short" | "medium" | "long" | "time" = "medium"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (format === "time") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const opts: Intl.DateTimeFormatOptions =
    format === "short"
      ? { month: "numeric", day: "numeric", year: "2-digit" }
      : format === "long"
        ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString("en-US", opts);
}

export function applyFormatters(
  raw: string | null | undefined,
  steps: EditableFormatterStep[] | undefined | null,
): string {
  let value = raw == null ? "" : String(raw);
  const pipeline = steps ?? [];
  for (const step of pipeline) {
    switch (step.type) {
      case "fallback":
        if (!value.trim()) value = step.value;
        break;
      case "case":
        if (step.value === "upper") value = value.toUpperCase();
        else if (step.value === "lower") value = value.toLowerCase();
        else value = toTitleCase(value);
        break;
      case "number":
        value = formatNumber(value, step.decimals, step.commas !== false);
        break;
      case "currency":
        value = formatCurrency(value, step.currency, step.decimals ?? 2);
        break;
      case "date":
        value = formatDate(value, step.format);
        break;
      case "prefix":
        value = `${step.value}${value}`;
        break;
      case "suffix":
        value = `${value}${step.value}`;
        break;
      default:
        break;
    }
  }
  return value;
}
