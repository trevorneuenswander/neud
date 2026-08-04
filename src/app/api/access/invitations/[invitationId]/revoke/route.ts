import { verifyAuthenticatedAccessRequest } from "@/lib/access-management/verify-access-request";

type RouteContext = {
  params: Promise<{ invitationId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const verified = await verifyAuthenticatedAccessRequest(request);
  if (!verified.ok) {
    return Response.json({ ok: false, code: verified.code }, { status: verified.status });
  }

  const { invitationId } = await context.params;
  const { data, error } = await verified.supabase.rpc("revoke_cloud_invitation", {
    p_invitation_id: invitationId,
  });

  if (error || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
    return Response.json(
      { ok: false, code: (data as { code?: string } | null)?.code ?? "forbidden" },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
