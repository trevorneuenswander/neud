import { headers } from "next/headers";

export async function getSiteOrigin(): Promise<string> {
  const headersList = await headers();
  const origin = headersList.get("origin");

  if (origin) {
    return origin;
  }

  const host =
    headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}
