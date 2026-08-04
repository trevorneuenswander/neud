import { formatAbsoluteDateTime } from "@/lib/data-engines/format";

export function formatActivityTableDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatActivityTableDateTitle(timestamp: string): string {
  return formatAbsoluteDateTime(timestamp);
}

/** Shared activity timestamp formatter for overview, dashboard, and full activity views. */
export const formatActivityDate = formatActivityTableDate;
