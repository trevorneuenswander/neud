import { proxyDisplayStatusRoute } from "@/lib/displays/display-status-route";

export async function GET() {
  return proxyDisplayStatusRoute("/api/displays/pylon/status");
}
