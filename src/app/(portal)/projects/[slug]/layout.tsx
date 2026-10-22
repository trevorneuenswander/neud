import { ProjectLayoutFrame } from "@/components/projects/ProjectLayoutFrame";
import { PinnedViewerProvider } from "@/lib/displays/pinned-viewer-context";
import { ProjectEngineSessionRoot } from "@/components/projects/ProjectEngineSessionRoot";
import { ProjectAccessStatePanel } from "@/components/projects/ProjectAccessStatePanel";
import { ProjectNotInstalledPanel } from "@/components/projects/ProjectNotInstalledPanel";
import { resolveProjectAccess } from "@/lib/projects/authorization";
import { ensureProjectEnginesInitialized } from "@/lib/data-engines/authorization";
import { getProjectEngines } from "@/lib/data-engines/queries";
import { isLocalApiError, LOCAL_API_ERROR_CODES } from "@/lib/local/errors";
import {
  projectSupportsBagController,
  projectSupportsSemaWorkflow,
} from "@/lib/projects/constants";
import { shouldUseLocalData } from "@/lib/local/mode";
import { localGetProjectCapabilities, localListProjects } from "@/lib/local/api";
import {
  defaultCapabilitiesForProjectType,
  normalizeCapabilityIds,
} from "@/lib/projects/capabilities";
import { notFound } from "next/navigation";

type ProjectLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

async function resolvePackageInstallGate(slug: string): Promise<{
  installed: boolean;
  name: string | null;
  accessible: boolean;
}> {
  if (!shouldUseLocalData()) {
    return { installed: true, name: null, accessible: true };
  }
  try {
    const list = await localListProjects(undefined, { scope: "directory" });
    const entry = list.projects.find((project) => project.slug === slug) as
      | {
          slug?: string;
          name?: string;
          isPackageInstalled?: boolean;
          packageState?: string;
        }
      | undefined;
    if (!entry) {
      return { installed: false, name: null, accessible: false };
    }
    const installed =
      entry.isPackageInstalled === true ||
      entry.packageState === "downloaded" ||
      entry.packageState === "update_available";
    return {
      installed,
      name: typeof entry.name === "string" ? entry.name : null,
      accessible: true,
    };
  } catch {
    return { installed: true, name: null, accessible: true };
  }
}

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { slug } = await params;
  const packageGate = await resolvePackageInstallGate(slug);
  if (packageGate.accessible && !packageGate.installed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <ProjectNotInstalledPanel slug={slug} name={packageGate.name} />
      </div>
    );
  }

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
    if (packageGate.accessible) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <ProjectNotInstalledPanel slug={slug} name={packageGate.name} />
        </div>
      );
    }
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
    access.projectRole !== "viewer" &&
    (projectSupportsBagController(access.project.project_type) ||
      projectSupportsSemaWorkflow(access.project.project_type));

  let capabilities = defaultCapabilitiesForProjectType(
    access.project.project_type,
  );
  if (shouldUseLocalData()) {
    try {
      const payload = await localGetProjectCapabilities(access.project.slug);
      const normalized = normalizeCapabilityIds(payload.capabilities);
      if (normalized.length) {
        capabilities = normalized;
      }
    } catch {
      // Fall back to project_type defaults.
    }
  } else {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("project_capabilities")
        .select("capability")
        .eq("project_id", access.project.id);
      const normalized = normalizeCapabilityIds(
        (data ?? []).map((row) => row.capability),
      );
      if (normalized.length) {
        capabilities = normalized;
      }
    } catch {
      // Fall back to project_type defaults.
    }
  }

  return (
    <ProjectEngineSessionRoot engineId={engineId}>
      <PinnedViewerProvider
        projectId={access.project.id}
        projectSlug={access.project.slug}
      >
        <ProjectLayoutFrame
          slug={access.project.slug}
          projectType={access.project.project_type}
          capabilities={capabilities}
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
