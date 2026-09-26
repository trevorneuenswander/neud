import {
  proxyProjectDisplayDataRoute,
} from "@/lib/displays/project-display-api-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ projectId: string; slug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyProjectDisplayDataRoute(request, context);
}
