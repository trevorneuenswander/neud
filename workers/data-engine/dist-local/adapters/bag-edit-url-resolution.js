export function getVehicleIdFromEditUrl(value) {
  const match = String(value).match(/\/vehicles\/(\d+)\/edit(?:[?#].*)?$/i);
  return match?.[1] ?? null;
}

export function isBlockedAuctionOrigin(urlString) {
  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      parsed.protocol === "file:"
    );
  } catch {
    return true;
  }
}

export function resolveAuctionOrigin(auctionUrl) {
  if (!auctionUrl || typeof auctionUrl !== "string") {
    return null;
  }
  try {
    const parsed = new URL(auctionUrl.trim());
    if (isBlockedAuctionOrigin(parsed.toString())) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function resolveExportEditUrl(editHref, auctionUrl) {
  if (!editHref || typeof editHref !== "string") {
    return null;
  }

  const origin = resolveAuctionOrigin(auctionUrl);
  if (!origin) {
    return null;
  }

  let absolute;
  try {
    absolute = new URL(editHref.trim(), `${origin}/`).toString();
  } catch {
    return null;
  }

  if (isBlockedAuctionOrigin(absolute)) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }

  const vehicleMatch = parsed.pathname.match(/^\/vehicles\/(\d+)(?:\/edit)?\/?$/i);
  if (!vehicleMatch) {
    return null;
  }

  parsed.pathname = `/vehicles/${vehicleMatch[1]}/edit`;
  return parsed.toString();
}

export function summarizeEditUrlSamples(values, limit = 3) {
  return values.filter(Boolean).slice(0, limit);
}
