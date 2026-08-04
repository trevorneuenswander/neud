export const PLACEHOLDER_URL_PATTERN =
  /logo|icon|avatar|badge|spinner|placeholder|favicon|1x1|pixel|no-image|noimage|missing|pip/i;

export type AuctionImage = {
  url?: string | null;
  sourceUrl?: string | null;
  relativePath?: string | null;
  displayUrl?: string | null;
  isPlaceholder?: boolean;
};

export function isPlaceholderLotImage(image: AuctionImage | string | null | undefined): boolean {
  if (!image) return true;
  if (typeof image === "object" && image.isPlaceholder === true) {
    return true;
  }

  const url =
    typeof image === "string"
      ? image
      : image.url ?? image.sourceUrl ?? image.displayUrl ?? image.relativePath ?? "";
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_URL_PATTERN.test(trimmed)) return true;
  if (/no[-_]?photo|default[-_]?image|coming[-_]?soon/i.test(trimmed)) return true;
  return false;
}

export function isUsablePhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isPlaceholderLotImage(trimmed)) return false;
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
