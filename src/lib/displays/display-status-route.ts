import { NextResponse } from "next/server";
import { getLocalApiBaseUrl, shouldUseLocalData } from "@/lib/local/mode";

export async function proxyDisplayStatusRoute(localPath: string) {
  if (shouldUseLocalData()) {
    try {
      const response = await fetch(`${getLocalApiBaseUrl()}${localPath}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        displayId?: string;
        dataConnected?: boolean;
        enabled?: boolean;
        updatedAt?: string;
      };
      if (response.ok) {
        return NextResponse.json(
          {
            displayId: payload.displayId,
            dataConnected: payload.dataConnected === true,
            enabled: payload.enabled === true,
            updatedAt: payload.updatedAt ?? new Date().toISOString(),
          },
          {
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    } catch {
      // Fall through to safe defaults below.
    }
  }

  return NextResponse.json(
    {
      displayId: localPath.split("/")[3] ?? "unknown",
      dataConnected: false,
      enabled: false,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
