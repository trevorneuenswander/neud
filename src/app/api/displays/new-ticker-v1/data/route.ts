import { NextResponse } from "next/server";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

export async function GET() {
  if (shouldUseLocalData()) {
    try {
      const response = await fetch(
        `${getLocalApiBaseUrl()}/api/displays/new-ticker-v1/data`,
        { cache: "no-store" },
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

  return NextResponse.json(
    {
      dataConnected: false,
      enabled: false,
      status: "display_disabled",
      source: "webpage-scraper",
      next: [],
    },
    {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
