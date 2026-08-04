import { proxyProjectDisplayMetaRoute } from "@/lib/displays/project-display-api-proxy";

type DisplayMetaRouteContext = {
  params: Promise<{ projectId: string; slug: string }>;
};

export async function GET(request: Request, context: DisplayMetaRouteContext) {
  return proxyProjectDisplayMetaRoute(request, context);
}
