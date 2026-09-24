import { ProjectLayoutFrame } from "@/components/projects/ProjectLayoutFrame";
import { PinnedViewerProvider } from "@/lib/displays/pinned-viewer-context";
import { ProjectEngineSessionRoot } from "@/components/projects/ProjectEngineSessionRoot";
import { ProjectAccessStatePanel } from "@/components/projects/ProjectAccessStatePanel";
import { resolveProjectAccess } from "@/lib/projects/authorization";
import { ensureProjectEnginesInitialized } from "@/lib/data-engines/authorization";
import { getProjectEngines } from "@/lib/data-engines/queries";
import { isLocalApiError, LOCAL_API_ERROR_CODES } from "@/lib/local/errors";
import { projectSupportsBagController } from "@/lib/projects/constants";
import { shouldUseLocalData } from "@/lib/local/mode";
import { notFound } from "next/navigation";

type ProjectLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { slug } = await params;
  const resolution = await resolveProjectAccess(slug);

  if (resolution.state === "loading") {
    return (
      <ProjectAccessStatePanel slug={slug} state="loading" />
    );
  }

  if (resolution.state === "identity-error") {
    return (
      <ProjectAccessStatePanel
        slug={slug}
        state="identity-error"
        message={resolution.message}
      />
    );
  }

  if (resolution.state === "denied") {
    notFound();
  }

  const access = resolution.access;

  let engineId: string | null = null;
  if (access.project.project_type === "bag-graphics" && shouldUseLocalData()) {
    try {
      await ensureProjectEnginesInitialized(access.project.id);
      const engines = await getProjectEngines(access.project.id);
      engineId = engines[0]?.id ?? null;
    } catch (error) {
      if (isLocalApiError(error)) {
        if (error.code === LOCAL_API_ERROR_CODES.FORBIDDEN) {
          notFound();
        }
        if (error.code === LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND) {
          notFound();
        }
      }
      throw error;
    }
  }

  const showStatusControls =
    shouldUseLocalData() &&
    projectSupportsBagController(access.project.project_type) &&
    access.projectRole !== "viewer";

  return (
    <ProjectEngineSessionRoot engineId={engineId}>
      <PinnedViewerProvider
        projectId={access.project.id}
        projectSlug={access.project.slug}
      >
        <ProjectLayoutFrame
          slug={access.project.slug}
          projectType={access.project.project_type}
          engineId={engineId}
          canManageSettings={access.canManageSettings}
          projectRole={access.projectRole}
          showStatusControls={showStatusControls}
          initialDataSource="webpage-scraper"
        >
          {children}
        </ProjectLayoutFrame>
      </PinnedViewerProvider>
    </ProjectEngineSessionRoot>
  );
}
