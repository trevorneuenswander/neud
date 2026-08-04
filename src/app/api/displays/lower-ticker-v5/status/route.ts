import { proxyDisplayStatusRoute } from "@/lib/displays/display-status-route";

export async function GET() {
  return proxyDisplayStatusRoute("/api/displays/lower-ticker-v5/status");
}
