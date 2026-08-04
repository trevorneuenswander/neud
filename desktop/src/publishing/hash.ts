import { stripVolatileCanonicalFields } from "./sanitize";
import { createHash } from "crypto";

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

export function hashCanonicalProjectData(data: unknown): string {
  return createHash("sha256").update(stableSerialize(data)).digest("hex");
}

/** Hash only meaningful display content; excludes volatile transport timestamps. */
export function hashCanonicalProjectDataForPublish(data: unknown): string {
  const normalized =
    data && typeof data === "object"
      ? stripVolatileCanonicalFields(data as Record<string, unknown>)
      : data;
  return hashCanonicalProjectData(normalized);
}
