/** Meaningful canonical payload fingerprint for hosted viewer delivery (no secret values logged). */

const VOLATILE_FINGERPRINT_KEYS = new Set(["updatedAt"]);

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function stripVolatileFingerprintFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (VOLATILE_FINGERPRINT_KEYS.has(key)) {
      continue;
    }
    output[key] = value;
  }
  return output;
}

function hashStableText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic content fingerprint — changes when meaningful payload values change. */
export function fingerprintCanonicalPayloadContent(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== "object") {
    return "fp-content-empty";
  }

  const material = stripVolatileFingerprintFields(payload);
  const serialized = stableSerialize(material);
  return `fp-content-${hashStableText(serialized)}`;
}

/** Legacy structural fingerprint (key names/counts only). Prefer content fingerprint for delivery. */
export function fingerprintCanonicalPayloadStructure(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== "object") {
    return "empty";
  }

  const current =
    payload.current && typeof payload.current === "object" && !Array.isArray(payload.current)
      ? Object.keys(payload.current as Record<string, unknown>)
          .sort()
          .join(",")
      : "";

  const auctionDisplay =
    payload.auctionDisplay &&
    typeof payload.auctionDisplay === "object" &&
    !Array.isArray(payload.auctionDisplay)
      ? Object.keys(payload.auctionDisplay as Record<string, unknown>)
          .sort()
          .join(",")
      : "";

  const photos =
    payload.auctionDisplay &&
    typeof payload.auctionDisplay === "object" &&
    !Array.isArray(payload.auctionDisplay) &&
    Array.isArray((payload.auctionDisplay as Record<string, unknown>).photos)
      ? `photos:${((payload.auctionDisplay as Record<string, unknown>).photos as unknown[]).length}`
      : "";

  const text = [
    Object.keys(payload).sort().join(","),
    current,
    auctionDisplay,
    photos,
    Array.isArray(payload.next) ? `next:${payload.next.length}` : "",
    Array.isArray(payload.lots) ? `lots:${payload.lots.length}` : "",
  ].join("|");

  return `fp-${hashStableText(text)}`;
}
