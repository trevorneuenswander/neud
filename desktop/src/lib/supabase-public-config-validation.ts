export function isPlaceholderSupabasePublishableKey(key: string | null | undefined): boolean {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith(".test")) {
    return true;
  }
  if (lower.includes("example") || lower.includes("placeholder") || lower === "test") {
    return true;
  }
  if (lower.includes("service_role")) {
    return true;
  }
  return false;
}

export function isValidSupabasePublishableKey(key: string | null | undefined): boolean {
  const trimmed = key?.trim() ?? "";
  if (isPlaceholderSupabasePublishableKey(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("sb_publishable_")) {
    return trimmed.length >= 20;
  }
  if (trimmed.startsWith("eyJ")) {
    return trimmed.length >= 80;
  }
  return trimmed.length >= 20;
}
