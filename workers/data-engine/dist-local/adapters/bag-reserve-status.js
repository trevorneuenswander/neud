export function normalizeReserveStatus(value) {
  if (value == null) return "unknown";
  if (
    value === "has_reserve" ||
    value === "offered_without_reserve" ||
    value === "unknown"
  ) {
    return value;
  }
  if (
    value === "reserve_met" ||
    value === "reserve_not_met" ||
    value === "no_reserve"
  ) {
    if (value === "no_reserve") return "offered_without_reserve";
    return "has_reserve";
  }
  if (value === "no-reserve") {
    return "offered_without_reserve";
  }
  if (value === "reserve") {
    return "has_reserve";
  }
  if (typeof value === "boolean") {
    return "has_reserve";
  }

  const text = String(value).trim().toLowerCase();
  if (!text || text === "—" || text === "-") return "unknown";

  if (/no\s*reserve|offered\s+without\s+reserve|without\s+reserve/.test(text)) {
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

export function normalizeEditPageReserveStatus({ noReserve }) {
  if (noReserve === true) {
    return "no-reserve";
  }
  if (noReserve === false) {
    return "reserve";
  }
  return "unknown";
}

export function serializeEditPageReserveForStorage(reserveStatus) {
  if (reserveStatus === "no-reserve") {
    return "offered_without_reserve";
  }
  if (reserveStatus === "reserve") {
    return "has_reserve";
  }
  return "unknown";
}

export function serializeReserveStatusForStorage(value) {
  return normalizeReserveStatus(value);
}
