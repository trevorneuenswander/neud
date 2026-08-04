import {
  proxyProjectDisplayDataRoute,
} from "@/lib/displays/project-display-api-proxy";

type RouteContext = {
  params: Promise<{ projectId: string; slug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyProjectDisplayDataRoute(request, context);
}
