import { NextResponse } from "next/server";
import { shouldUseLocalData, getLocalApiBaseUrl } from "@/lib/local/mode";

export async function GET() {
  if (shouldUseLocalData()) {
    try {
      const response = await fetch(
        `${getLocalApiBaseUrl()}/api/displays/lower-ticker-v5/enabled`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        enabled?: boolean;
      };
      if (response.ok) {
        return NextResponse.json({ enabled: payload.enabled === true });
      }
    } catch {
      // Fall through to default enabled.
    }
  }

  return NextResponse.json({ enabled: true });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };

  if (shouldUseLocalData()) {
    const response = await fetch(
      `${getLocalApiBaseUrl()}/api/displays/lower-ticker-v5/enabled`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: body.enabled === true }),
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      enabled?: boolean;
      error?: string;
    };
    return NextResponse.json(
      { enabled: payload.enabled === true },
      { status: response.ok ? 200 : response.status },
    );
  }

  return NextResponse.json({ enabled: body.enabled === true });
}
