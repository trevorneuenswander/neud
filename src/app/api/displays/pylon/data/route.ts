import { NextResponse } from "next/server";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

const DISABLED_FALLBACK = {
  dataConnected: false,
  enabled: false,
  status: "display_disabled",
};

export async function GET() {
  if (shouldUseLocalData()) {
    try {
      const response = await fetch(`${getLocalApiBaseUrl()}/api/displays/pylon/data`, {
        cache: "no-store",
      });
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
