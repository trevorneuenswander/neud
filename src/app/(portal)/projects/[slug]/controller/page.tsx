import { BagControllerClient } from "@/components/bag-graphics/BagControllerClient";
import { SemaLocalControllerClient } from "@/components/sema/SemaLocalControllerClient";
import { requireBagGraphicsProject } from "@/lib/bag/authorization";
import { localGetBagLiveState } from "@/lib/local/bag-api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { resolveProjectAccess } from "@/lib/projects/authorization";
import { projectSupportsSemaWorkflow } from "@/lib/projects/constants";
import { notFound } from "next/navigation";

type ControllerPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectControllerPage({ params }: ControllerPageProps) {
  const { slug } = await params;

  if (!shouldUseLocalData()) {
    notFound();
  }

  const resolution = await resolveProjectAccess(slug);
  if (resolution.state !== "ready") {
    notFound();
  }

  if (projectSupportsSemaWorkflow(resolution.access.project.project_type)) {
    return (
      <SemaLocalControllerClient
        projectSlug={slug}
        canControl={resolution.access.projectRole !== "viewer"}
      />
    );
  }

  const access = await requireBagGraphicsProject(slug);

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
