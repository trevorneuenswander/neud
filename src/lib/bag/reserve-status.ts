export type ReserveStatus =
  | "has_reserve"
  | "offered_without_reserve"
  | "unknown";

const RESERVE_STATUS_VALUES: ReserveStatus[] = [
  "has_reserve",
  "offered_without_reserve",
  "unknown",
];

const LEGACY_RESERVE_STATUS_MAP: Record<string, ReserveStatus> = {
  reserve_met: "has_reserve",
  reserve_not_met: "has_reserve",
  no_reserve: "offered_without_reserve",
  "no-reserve": "offered_without_reserve",
  reserve: "has_reserve",
  has_reserve: "has_reserve",
  offered_without_reserve: "offered_without_reserve",
  unknown: "unknown",
};

export function isReserveStatus(value: unknown): value is ReserveStatus {
  return (
    typeof value === "string" &&
    (RESERVE_STATUS_VALUES as string[]).includes(value)
  );
}

export function normalizeReserveStatus(value: unknown): ReserveStatus {
  if (value == null) return "unknown";
  if (isReserveStatus(value)) return value;

  const text = String(value).trim().toLowerCase();
  if (!text || text === "—" || text === "-") return "unknown";

  const legacy = LEGACY_RESERVE_STATUS_MAP[text.replace(/\s+/g, "_")];
  if (legacy) return legacy;

  if (
    /no\s*reserve|offered\s+without\s+reserve|without\s+reserve/.test(text)
  ) {
    return "offered_without_reserve";
  }
  if (
    /has\s+reserve|^reserve\b|reserve\s*met|reserve\s*not\s*met|not\s*met|^reserved\b/.test(
      text,
    )
  ) {
    return "has_reserve";
  }

  return "unknown";
}

export function formatReserveStatusLabel(status: ReserveStatus): string {
  switch (status) {
    case "has_reserve":
      return "Has Reserve";
    case "offered_without_reserve":
      return "Offered Without Reserve";
    default:
      return "Unknown";
  }
}

export function getVisibleReserveLabel(status: ReserveStatus): string | null {
  return status === "offered_without_reserve"
    ? "OFFERED WITHOUT RESERVE"
    : null;
}

export function resolveReserveStatusDisplayLabel(value: unknown): string {
  const normalized = normalizeReserveStatus(value);
  if (normalized === "unknown") {
    return "";
  }
  return formatReserveStatusLabel(normalized);
}

export function readReserveStatusFromRecord(
  record: Record<string, unknown> | null | undefined,
): ReserveStatus {
  if (!record) return "unknown";
  const candidates = [
    record.reserveStatus,
    record.reserve_status,
    record.reserve,
    record.reserveText,
    record.reserve_text,
    record.hasReserve,
    record.noReserve,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeReserveStatus(candidate);
    if (normalized !== "unknown") {
      return normalized;
    }
  }
  return "unknown";
}

export function serializeReserveStatusForStorage(
  value: unknown,
): ReserveStatus {
  return normalizeReserveStatus(value);
}

export function resolveMergedReserveStatusLabel(
  submittedValue: unknown,
  datasetRecord: Record<string, unknown> | null | undefined,
): string {
  const fromSubmitted = getVisibleReserveLabel(normalizeReserveStatus(submittedValue));
  if (fromSubmitted) return fromSubmitted;

  if (datasetRecord) {
    const canonical = readReserveStatusFromRecord(datasetRecord);
    const label = getVisibleReserveLabel(canonical);
    if (label) return label;
  }

  return "";
}

export function resolveStoredReserveStatusLabel(
  submittedValue: unknown,
  datasetRecord: Record<string, unknown> | null | undefined,
): string {
  const normalizedSubmitted = normalizeReserveStatus(submittedValue);
  if (normalizedSubmitted !== "unknown") {
    return formatReserveStatusLabel(normalizedSubmitted);
  }

  if (datasetRecord) {
    const fromDataset = readReserveStatusFromRecord(datasetRecord);
    if (fromDataset !== "unknown") {
      return formatReserveStatusLabel(fromDataset);
    }
  }

  return "Unknown";
}

export function resolveMergedReserveStatusLabelOrUnknown(
  submittedValue: unknown,
  datasetRecord: Record<string, unknown> | null | undefined,
): string {
  return resolveStoredReserveStatusLabel(submittedValue, datasetRecord);
}

export function resolveLotReserveStatusLabel(
  raw: Record<string, unknown>,
  matched?: { reserveStatus?: string } | null,
): string | undefined {
  const fromDataset = resolveMergedReserveStatusLabel(undefined, raw);
  if (fromDataset) return fromDataset;

  if (matched?.reserveStatus) {
    const label = getVisibleReserveLabel(normalizeReserveStatus(matched.reserveStatus));
    return label || undefined;
  }

  return undefined;
}
