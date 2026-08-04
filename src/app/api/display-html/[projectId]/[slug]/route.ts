import { proxyProjectDisplayViewerRoute } from "@/lib/displays/project-display-api-proxy";

type DisplayHtmlRouteContext = {
  params: Promise<{ projectId: string; slug: string }>;
};

export async function GET(request: Request, context: DisplayHtmlRouteContext) {
  return proxyProjectDisplayViewerRoute(request, context);
}
