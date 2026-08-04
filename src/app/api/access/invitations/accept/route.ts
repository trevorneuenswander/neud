import { z } from "zod";
import { hashInvitationToken } from "@/lib/access-management/invitation-server";
import { verifyAuthenticatedAccessRequest } from "@/lib/access-management/verify-access-request";

const acceptSchema = z.object({
  token: z.string().min(16),
});

export async function POST(request: Request) {
  const verified = await verifyAuthenticatedAccessRequest(request);
  if (!verified.ok) {
    return Response.json({ ok: false, code: verified.code }, { status: verified.status });
  }

  const body = acceptSchema.parse(await request.json());
  const tokenHash = hashInvitationToken(body.token);

  const { data, error } = await verified.supabase.rpc("accept_cloud_invitation", {
    p_token_hash: tokenHash,
  });

  if (error || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
    return Response.json(
      { ok: false, code: (data as { code?: string } | null)?.code ?? "forbidden" },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
