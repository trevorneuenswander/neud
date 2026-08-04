import { NextResponse } from "next/server";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

const DISABLED_FALLBACK = {
  dataConnected: false,
  enabled: false,
  status: "display_disabled",
  source: "webpage-scraper",
  current: {
    lot: null,
    title: null,
    reserveStatus: null,
    biddingPrice: null,
    currencies: {},
    photos: [],
    pipSource: null,
  },
  next: [],
};

export async function GET(request: Request) {
  const clientSource = request.headers.get("x-neud-display-client");
  const clientReferer = request.headers.get("referer");

  if (shouldUseLocalData()) {
    try {
      const response = await fetch(
        `${getLocalApiBaseUrl()}/api/displays/new-bid-display-v1/data`,
        {
          cache: "no-store",
          headers: {
            ...(clientSource ? { "X-NEUD-Display-Client": clientSource } : {}),
            ...(clientReferer ? { Referer: clientReferer } : {}),
          },
        },
      );
      const payload = await response.json().catch(() => null);
      if (payload) {
        return NextResponse.json(payload, {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        });
      }
    } catch {
      // Fall through to safe defaults below.
    }
  }

  return NextResponse.json(DISABLED_FALLBACK, {
    status: 409,
    headers: { "Cache-Control": "no-store" },
  });
}
