import {
  DEFAULT_MAX_DETAIL_CHECKS,
  DEFAULT_DETAILS_TTL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  ENGINE_COMMANDS,
  LOG_LEVELS,
  POLL_INPUT_MAX_MS,
  POLL_INPUT_MIN_MS,
  POLL_PRESETS_MS,
  SOURCE_TYPES,
  type EngineCommand,
  type LogLevel,
  type SourceType,
} from "@/lib/data-engines/constants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOURCE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateEngineCommand(value: string): EngineCommand | null {
  if (ENGINE_COMMANDS.includes(value as EngineCommand)) {
    return value as EngineCommand;
  }
  return null;
}

export function validateLogLevelFilter(value: string): LogLevel | "all" {
  if (value === "all") return "all";
  if (LOG_LEVELS.includes(value as LogLevel)) return value as LogLevel;
  return "all";
}

export function validatePollIntervalMs(value: number): string | null {
  if (!Number.isInteger(value)) {
    return "Poll interval must be a whole number of milliseconds.";
  }
  if (value < POLL_INPUT_MIN_MS || value > POLL_INPUT_MAX_MS) {
    return `Poll interval must be between ${POLL_INPUT_MIN_MS / 1000} second and 1 hour.`;
  }
  return null;
}

export function validatePollIntervalInput(raw: string): number | null {
  const parsed = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(parsed)) return null;
  if (validatePollIntervalMs(parsed)) return null;
  return parsed;
}

export function isPollPreset(value: number): boolean {
  return (POLL_PRESETS_MS as readonly number[]).includes(value);
}

export function validateDetailsTtlMs(value: number): string | null {
  if (!Number.isInteger(value) || value < 1000 || value > 86400000) {
    return "Details cache TTL must be between 1 second and 24 hours.";
  }
  return null;
}

export function validateMaxDetailChecks(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return "Maximum detail checks must be between 1 and 100.";
  }
  return null;
}

export function validateSourceKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !SOURCE_KEY_PATTERN.test(trimmed) || trimmed.length > 64) {
    return "Source key must use lowercase letters, numbers, and hyphens.";
  }
  return null;
}

export function validateSourceName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) {
    return "Source name is required and must be 120 characters or fewer.";
  }
  return null;
}

export function validateSourceType(value: string): SourceType | null {
  if (SOURCE_TYPES.includes(value as SourceType)) {
    return value as SourceType;
  }
  return null;
}

export function validateSourceUrl(
  value: string,
  allowInsecure: boolean,
): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) {
    return "URL is required and must be 2048 characters or fewer.";
  }

  try {
    const parsed = new URL(trimmed);
    const isLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    if (!allowInsecure && parsed.protocol !== "https:") {
      return "Production URLs must use HTTPS.";
    }

    if (allowInsecure && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "URL must use HTTP or HTTPS.";
    }

    if (!allowInsecure && parsed.protocol === "http:" && !isLocalhost) {
      return "HTTP is allowed only for localhost during development.";
    }
  } catch {
    return "URL must be valid.";
  }

  return null;
}

export function parseScraperSettingsForm(formData: FormData) {
  return {
    pollIntervalMs: Number.parseInt(String(formData.get("pollIntervalMs") ?? DEFAULT_POLL_INTERVAL_MS), 10),
    detailsTtlMs: Number.parseInt(String(formData.get("detailsTtlMs") ?? DEFAULT_DETAILS_TTL_MS), 10),
    maxDetailChecks: Number.parseInt(String(formData.get("maxDetailChecks") ?? DEFAULT_MAX_DETAIL_CHECKS), 10),
    headless: formData.get("headless") === "on" || formData.get("headless") === "true",
  };
}

export function parseSourceForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    sourceKey: String(formData.get("sourceKey") ?? ""),
    url: String(formData.get("url") ?? ""),
    sourceType: String(formData.get("sourceType") ?? "page"),
    enabled: formData.get("enabled") !== "false",
    position: Number.parseInt(String(formData.get("position") ?? "0"), 10),
  };
}
