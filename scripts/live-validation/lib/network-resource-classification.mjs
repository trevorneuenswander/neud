/** Resource classification for scraper/Faye diagnostics (not scraper runtime). */

export function classifyNetworkResource(url, resourceType, contentType) {
  const normalized = (url ?? "").toLowerCase();
  const type = (resourceType ?? "").toLowerCase();
  const mime = (contentType ?? "").toLowerCase();

  if (type === "websocket" || normalized.startsWith("ws:") || normalized.startsWith("wss:")) {
    return "websocket";
  }

  if (
    mime.includes("text/event-stream") ||
    (type === "eventsource")
  ) {
    return "eventsource";
  }

  if (normalized.includes("faye.auctionaccelerate.com/faye")) {
    if (/message=.*meta%2Fhandshake|message=.*%22handshake%22/i.test(normalized)) {
      return "Faye/Bayeux handshake";
    }
    if (/message=.*meta%2Fsubscribe|message=.*%22subscribe%22/i.test(normalized)) {
      return "Faye/Bayeux subscribe";
    }
    if (/message=.*meta%2Fconnect|message=.*%22connect%22/i.test(normalized)) {
      return "Faye/Bayeux long-polling";
    }
    if (/jsonp=/.test(normalized) || /callback=/.test(normalized)) {
      return "Faye/Bayeux JSONP";
    }
    return "Faye/Bayeux";
  }

  if (type === "document") {
    return "document";
  }
  if (type === "stylesheet") {
    return "stylesheet";
  }
  if (type === "image") {
    return "image";
  }
  if (type === "font") {
    return "font";
  }
  if (type === "script") {
    return "script";
  }
  if (type === "xhr" || type === "fetch") {
    if (/\/graphql/.test(normalized)) {
      return "GraphQL";
    }
    return "xhr";
  }

  if (/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/.test(normalized)) {
    return "image";
  }
  if (/\.css(\?|$)/.test(normalized)) {
    return "stylesheet";
  }
  if (/\.(woff2?|otf|ttf|eot)(\?|$)/.test(normalized)) {
    return "font";
  }

  return "other";
}

export function reclassifyCapturedRequests(requests) {
  return (requests ?? []).map((entry) => ({
    ...entry,
    category: classifyNetworkResource(
      entry.urlPattern,
      entry.resourceType,
      entry.contentType,
    ),
  }));
}
