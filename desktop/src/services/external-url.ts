export const ALLOWED_EXTERNAL_URL_PREFIXES = [
  "https://",
  "http://localhost",
  "http://127.0.0.1",
] as const;

export function isAllowedExternalUrl(url: string): boolean {
  return ALLOWED_EXTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}
