export const PLACEHOLDER_URL_PATTERN =
  /logo|icon|avatar|badge|spinner|placeholder|favicon|1x1|pixel|no-image|noimage|missing|pip/i;

export function isUsablePhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (PLACEHOLDER_URL_PATTERN.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/api/offline-assets/");
}

export function filterUsablePhotoUrls(urls: string[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!isUsablePhotoUrl(url) || seen.has(url)) continue;
    seen.add(url);
    ordered.push(url);
  }
  return ordered;
}

export function generateDisplaySlugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "display";
}

export const DISPLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
