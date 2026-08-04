function trimUrl(value) {
  return String(value ?? "").trim();
}

export function normalizePhotoUrl(url) {
  const trimmed = trimUrl(url);
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed, "https://example.com");
    parsed.hash = "";
    let pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return trimmed.replace(/#.*$/, "").replace(/\/{2,}/g, "/");
  }
}

export function dedupePhotoUrls(photoUrls) {
  const seen = new Set();
  const unique = [];

  for (const photoUrl of photoUrls) {
    const key = normalizePhotoUrl(photoUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(photoUrl);
  }

  return unique;
}
