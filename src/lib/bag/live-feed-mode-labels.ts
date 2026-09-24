export type LiveFeedModePreference = "faye" | "dom" | "legacy";

export function normalizeLiveFeedModePreference(
  value: unknown,
): LiveFeedModePreference {
  const normalized = String(value ?? "faye").trim().toLowerCase();
  if (normalized === "automatic") {
    return "faye";
  }
  if (normalized === "dom" || normalized === "legacy") {
    return normalized;
  }
  return "faye";
}

export function liveFeedModeUiLabel(mode: LiveFeedModePreference): string {
  switch (mode) {
    case "faye":
      return "Faye (Fastest)";
    case "dom":
      return "DOM (Backup)";
    case "legacy":
      return "Legacy Polling (Slowest)";
    default:
      return "Faye (Fastest)";
  }
}

export function liveFeedModeExecutionLogLabel(mode: LiveFeedModePreference): string {
  switch (mode) {
    case "faye":
      return "Faye";
    case "dom":
      return "DOM";
    case "legacy":
      return "Legacy Polling";
    default:
      return "Faye";
  }
}
