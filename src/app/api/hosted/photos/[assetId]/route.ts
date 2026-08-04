import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { assetId } = await context.params;
  const url = new URL(request.url);
  const projectSlug = url.searchParams.get("projectSlug")?.trim() ?? "";
  const displaySlug = url.searchParams.get("displaySlug")?.trim() ?? "";

  if (!assetId || !projectSlug || !displaySlug) {
    return Response.json(
      { ok: false, code: "invalid_request", message: "Missing photo authorization parameters." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("authorize_hosted_photo_asset", {
    p_asset_id: assetId,
    p_project_slug: projectSlug,
    p_display_slug: displaySlug,
  });

  if (error || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
    const code = (data as { code?: string } | null)?.code ?? "forbidden";
    const status = code === "authentication_required" ? 401 : 403;
    return Response.json({ ok: false, code }, { status });
  }

  const payload = data as {
    storage_bucket?: string;
    storage_path?: string;
  };

  if (!payload.storage_bucket || !payload.storage_path) {
    return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(payload.storage_bucket)
    .createSignedUrl(payload.storage_path, 60 * 60);

  if (signError || !signed?.signedUrl) {
    return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
  }

  return Response.redirect(signed.signedUrl, 302);
}
