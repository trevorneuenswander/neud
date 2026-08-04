import { formatDisplayVersion } from "@/lib/displays/display-version-format";

const GENERIC_REVISION_MESSAGES = new Set([
  "Scraper code published",
  "Display code published",
  "Initial scraper seed",
  "Initial display seed",
  "Display created",
]);

export function formatRevisionCreatedTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatVersionNumberLabel(versionNumber: number): string {
  return formatDisplayVersion(versionNumber);
}

export function resolveRevisionVersionNumber(revision: {
  id: string;
  createdAt: string;
  versionNumber?: number | null;
}): number | null {
  if (typeof revision.versionNumber === "number" && revision.versionNumber > 0) {
    return revision.versionNumber;
  }
  return null;
}

export function formatActiveRevisionLabel(
  versionNumber: number,
  createdAt: string,
): string {
  return `v${versionNumber} — ${formatRevisionCreatedTimestamp(createdAt)}`;
}

export function buildRevisionVersionMap(
  revisions: Array<{ id: string; createdAt: string }>,
): Map<string, number> {
  const sorted = [...revisions].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  return new Map(
    sorted.map((revision, index) => [revision.id, index + 1]),
  );
}

export function formatRevisionDownloadTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const parts = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}-${lookup.hour}${lookup.minute}${lookup.second}`;
}

export function formatRevisionDisplayName(input: {
  revisionName?: string | null;
  message?: string | null;
  createdAt: string;
  versionNumber?: number;
}): string {
  if (input.versionNumber) {
    return formatActiveRevisionLabel(input.versionNumber, input.createdAt);
  }

  const revisionName = input.revisionName?.trim();
  if (revisionName) {
    return revisionName;
  }

  const message = input.message?.trim();
  if (message && !GENERIC_REVISION_MESSAGES.has(message) && !message.startsWith("Restored revision")) {
    return message;
  }

  return formatActiveRevisionLabel(1, input.createdAt);
}

export function formatRevisionDescription(input: {
  revisionName?: string | null;
  message?: string | null;
  createdAt: string;
  versionNumber?: number;
}): string {
  const revisionName = input.revisionName?.trim();
  if (revisionName) {
    return revisionName;
  }

  const message = input.message?.trim();
  if (message && !GENERIC_REVISION_MESSAGES.has(message) && !message.startsWith("Restored revision")) {
    return message;
  }

  if (input.versionNumber) {
    return formatDisplayVersion(input.versionNumber);
  }

  return `Saved ${formatRevisionCreatedTimestamp(input.createdAt)}`;
}

export function formatRevisionShortId(revisionId: string): string {
  return revisionId.slice(0, 7);
}

export const MAX_REVISION_NAME_LENGTH = 120;
export const MAX_REVISION_CHANGE_NOTE_LENGTH = 500;

export function normalizeRevisionName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_REVISION_NAME_LENGTH);
}

export function normalizeChangeNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_REVISION_CHANGE_NOTE_LENGTH);
}
