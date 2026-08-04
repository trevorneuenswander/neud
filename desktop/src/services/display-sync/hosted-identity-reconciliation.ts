import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { DisplaysRepository } from "../../repositories/displays-repository";
import type { ProjectDisplayCodeRepository } from "../../repositories/project-display-code-repository";
import type { ProjectsRepository } from "../../repositories/projects-repository";

export type HostedIdentityReconciliationResult =
  | { ok: true; projectId: string; realignedProjectId: boolean; realignedDisplayIds: string[] }
  | { ok: false; code: string; message: string };

type CloudProjectRow = { id: string; slug: string };
type CloudDisplayRow = { id: string; slug: string };

async function getSupabaseClient(
  cloud: AuthenticatedCloudCoordinator,
): Promise<SupabaseClient | null> {
  return cloud.getClient();
}

async function registerHostedProject(
  supabase: SupabaseClient,
  project: { id: string; slug: string; name: string; projectType: string },
): Promise<{ ok: boolean; code?: string; message?: string }> {
  const { data, error } = await supabase.rpc("register_hosted_project_for_desktop", {
    p_project_id: project.id,
    p_slug: project.slug,
    p_name: project.name,
    p_project_type: project.projectType,
  });
  if (error) {
    return { ok: false, code: error.code ?? "rpc_error", message: error.message };
  }
  const payload = (data ?? { ok: false }) as { ok?: boolean; code?: string; message?: string };
  return {
    ok: Boolean(payload.ok),
    code: payload.code,
    message: payload.message,
  };
}

async function fetchHostedProjectBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<CloudProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data as CloudProjectRow | null;
}

async function fetchHostedDisplaysByProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<CloudDisplayRow[]> {
  const { data, error } = await supabase
    .from("displays")
    .select("id, slug")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as CloudDisplayRow[];
}

export async function reconcileHostedProjectAndDisplayIdentity(input: {
  cloud: AuthenticatedCloudCoordinator;
  projects: ProjectsRepository;
  displays: DisplaysRepository;
  displayCode: ProjectDisplayCodeRepository;
  projectId: string;
  displayIds?: string[];
}): Promise<HostedIdentityReconciliationResult> {
  const localProject = input.projects.getById(input.projectId);
  if (!localProject) {
    return { ok: false, code: "project_not_found", message: "Local project not found." };
  }

  const supabase = await getSupabaseClient(input.cloud);
  if (!supabase) {
    return { ok: false, code: "cloud_session_unavailable", message: "Cloud session unavailable." };
  }

  let resolvedProjectId = localProject.id;
  let realignedProjectId = false;

  const registration = await registerHostedProject(supabase, {
    id: localProject.id,
    slug: localProject.slug,
    name: localProject.name,
    projectType: localProject.projectType,
  });

  if (!registration.ok && registration.code === "slug_conflict") {
    const hostedProject = await fetchHostedProjectBySlug(supabase, localProject.slug);
    if (!hostedProject) {
      return {
        ok: false,
        code: "slug_conflict",
        message: registration.message ?? "Hosted project slug conflict could not be resolved.",
      };
    }

    if (hostedProject.id !== localProject.id) {
      input.projects.realignProjectId(localProject.id, hostedProject.id);
      resolvedProjectId = hostedProject.id;
      realignedProjectId = true;

      const realignedRegistration = await registerHostedProject(supabase, {
        id: hostedProject.id,
        slug: localProject.slug,
        name: localProject.name,
        projectType: localProject.projectType,
      });
      if (!realignedRegistration.ok) {
        return {
          ok: false,
          code: realignedRegistration.code ?? "registration_failed",
          message:
            realignedRegistration.message ??
            "Unable to register realigned hosted project identity.",
        };
      }
    }
  } else if (!registration.ok) {
    return {
      ok: false,
      code: registration.code ?? "registration_failed",
      message: registration.message ?? "Unable to register hosted project identity.",
    };
  }

  const hostedDisplays = await fetchHostedDisplaysByProject(supabase, resolvedProjectId);
  const hostedBySlug = new Map(hostedDisplays.map((row) => [row.slug, row.id]));
  const realignedDisplayIds: string[] = [];

  const localDisplays = input.displayIds?.length
    ? input.displayIds
        .map((displayId) => input.displays.getById(displayId))
        .filter((display): display is NonNullable<typeof display> => Boolean(display))
    : input.displays.listByProject(resolvedProjectId);

  for (const display of localDisplays) {
    const code = input.displayCode.getByDisplayId(display.id);
    const slug = code?.slug ?? display.displayKey;
    const hostedDisplayId = hostedBySlug.get(slug);
    if (hostedDisplayId && hostedDisplayId !== display.id) {
      input.displays.realignDisplayId(display.id, hostedDisplayId);
      realignedDisplayIds.push(`${slug}:${display.id}->${hostedDisplayId}`);
    }
  }

  return {
    ok: true,
    projectId: resolvedProjectId,
    realignedProjectId,
    realignedDisplayIds,
  };
}
