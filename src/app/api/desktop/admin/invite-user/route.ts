import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/desktop-admin/rate-limit";
import { verifyDesktopAdminRequest } from "@/lib/desktop-admin/verify-desktop-admin-request";

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  const verified = await verifyDesktopAdminRequest(request);
  if (!verified.ok) {
    return Response.json(
      { ok: false, code: verified.code, message: verified.message },
      { status: verified.status },
    );
  }

  const rateKey = `invite:${verified.userId}`;
  if (!checkRateLimit(rateKey, 10, 60_000)) {
    return Response.json(
      {
        ok: false,
        code: "rate_limited",
        message: "Too many invitation attempts. Try again shortly.",
      },
      { status: 429 },
    );
  }

  let body: z.infer<typeof inviteSchema>;
  try {
    body = inviteSchema.parse(await request.json());
  } catch {
    return Response.json(
      {
        ok: false,
        code: "invalid_input",
        message: "email and fullName are required.",
      },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
      data: { full_name: body.fullName.trim() },
    });

    if (error || !data.user?.id) {
      return Response.json(
        {
          ok: false,
          code: "invite_failed",
          message: "Unable to invite user.",
        },
        { status: 400 },
      );
    }

    return Response.json({ ok: true, userId: data.user.id });
  } catch {
    return Response.json(
      {
        ok: false,
        code: "invite_failed",
        message: "Unable to invite user.",
      },
      { status: 500 },
    );
  }
}
