import { NextResponse } from "next/server";
import { shouldUseLocalData, getLocalApiBaseUrl } from "@/lib/local/mode";

export async function GET() {
  if (shouldUseLocalData()) {
    try {
      const response = await fetch(
        `${getLocalApiBaseUrl()}/api/displays/lower-ticker-v5/data`,
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
      next: [],
    },
    {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
