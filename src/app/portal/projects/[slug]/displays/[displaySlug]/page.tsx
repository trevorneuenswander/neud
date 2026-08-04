import { notFound, redirect } from "next/navigation";
import { HostedDisplayViewerClient } from "@/components/hosted/HostedDisplayViewerClient";
import {
  logViewerBundleDiagnostic,
  summarizeViewerBundleDiagnostic,
} from "@/lib/hosted/viewer-bundle";
import { getHostedActiveDisplaySnapshot } from "@/lib/hosted/portal-queries";
import { createClient } from "@/lib/supabase/server";

type HostedDisplayViewerPageProps = {
  params: Promise<{ slug: string; displaySlug: string }>;
};

export default async function HostedDisplayViewerPage({
  params,
}: HostedDisplayViewerPageProps) {
  const { slug, displaySlug } = await params;
  if (!slug || !displaySlug) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/portal/projects/${slug}/displays/${displaySlug}`)}`);
  }

  if (process.env.NODE_ENV !== "production") {
    const { data, error } = await supabase.rpc("get_online_display_viewer_bundle", {
      p_project_slug: slug,
      p_display_slug: displaySlug,
    });

    logViewerBundleDiagnostic(
      "[HostedDisplayViewerRoute]",
      summarizeViewerBundleDiagnostic({
        rpcData: data,
        rpcError: error,
        sessionAvailable: true,
        membershipAccess: "unknown",
      }),
    );
  }

  const displaySnapshot = await getHostedActiveDisplaySnapshot(slug, displaySlug);

  return (
    <HostedDisplayViewerClient
      projectSlug={slug}
      displaySlug={displaySlug}
      mode="private"
      viewerMode="portal-preview"
      displaySnapshot={displaySnapshot}
    />
  );
}
