import { BagControllerClient } from "@/components/bag-graphics/BagControllerClient";
import { requireBagGraphicsProject } from "@/lib/bag/authorization";
import { localGetBagLiveState } from "@/lib/local/bag-api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { notFound } from "next/navigation";

type BagControllerPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BagControllerPage({ params }: BagControllerPageProps) {
  const { slug } = await params;
  const access = await requireBagGraphicsProject(slug);

  if (!shouldUseLocalData()) {
    notFound();
  }

  let initialEnvelope;
  try {
    initialEnvelope = await localGetBagLiveState(access.project.id);
  } catch {
    notFound();
  }

  const canControl = access.accessLevel !== "viewer";

  return (
    <BagControllerClient
      projectId={access.project.id}
      projectSlug={slug}
      initialEnvelope={initialEnvelope}
      canControl={canControl}
    />
  );
}
