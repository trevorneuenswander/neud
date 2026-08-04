import { notFound } from "next/navigation";
import { HostedDisplayViewerClient } from "@/components/hosted/HostedDisplayViewerClient";

type PublicDisplayViewerPageProps = {
  params: Promise<{ projectSlug: string; displaySlug: string }>;
};

export default async function PublicDisplayViewerPage({
  params,
}: PublicDisplayViewerPageProps) {
  const { projectSlug, displaySlug } = await params;
  if (!projectSlug || !displaySlug) {
    notFound();
  }

  return (
    <HostedDisplayViewerClient
      projectSlug={projectSlug}
      displaySlug={displaySlug}
      mode="public"
      viewerMode="portal-preview"
    />
  );
}
