import { resetLocalApiSessionConfigCache } from "@/lib/local/session-config.server";

export async function POST() {
  resetLocalApiSessionConfigCache();
  return Response.json({ ok: true });
}
