import { notFound } from "next/navigation";
import { HostedDisplayViewerClient } from "@/components/hosted/HostedDisplayViewerClient";

type PublicDisplayFullscreenPageProps = {
  params: Promise<{ projectSlug: string; displaySlug: string }>;
};

export default async function PublicDisplayFullscreenPage({
  params,
}: PublicDisplayFullscreenPageProps) {
  const { projectSlug, displaySlug } = await params;
  if (!projectSlug || !displaySlug) {
    notFound();
  }

  return (
    <HostedDisplayViewerClient
      projectSlug={projectSlug}
      displaySlug={displaySlug}
      mode="public"
      viewerMode="fullscreen-output"
    />
  );
}
