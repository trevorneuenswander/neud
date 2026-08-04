"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  countProjectManagers,
  requireProjectCreationAccess,
  requireProjectMemberManagement,
} from "@/lib/projects/authorization";
import { requireUser } from "@/lib/auth/authorization";
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_THEME,
} from "@/lib/projects/constants";
import { getProjectBySlug, resolveUniqueSlug } from "@/lib/projects/queries";
import { type ProjectActionState } from "@/lib/projects/state";
import {
  generateSlugFromName,
  validateCreatableProjectDataType,
  validateProjectAccessLevel,
  validateProjectDescription,
  validateProjectIcon,
  validateProjectName,
  validateProjectTheme,
  isValidUuid,
} from "@/lib/projects/validation";
import { createClient } from "@/lib/supabase/server";
import { shouldUseLocalData } from "@/lib/local/mode";
import { localCreateProject } from "@/lib/local/api";

function collectCreateProjectFieldValues(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    dataType: String(formData.get("dataType") ?? ""),
  };
}

function toProjectErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) {
    return "Unable to complete this Project action. Please try again.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("at least one manager")) {
    return "A Project must retain at least one manager.";
  }

  if (message.includes("duplicate key")) {
    return "That user is already assigned to this Project.";
  }

  if (message.includes("only platform owners and admins")) {
    return "Only platform owners and admins may create Projects.";
  }

  if (message.includes("forbidden")) {
    return "You do not have permission to create Projects.";
  }

  return "Unable to complete this Project action. Please try again.";
}

export async function createProject(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  await requireProjectCreationAccess();

  const fieldValues = collectCreateProjectFieldValues(formData);
  const nameError = validateProjectName(fieldValues.name);
  const descriptionError = validateProjectDescription(fieldValues.description);
  const dataType = validateCreatableProjectDataType(fieldValues.dataType);
  const themeError = validateProjectTheme(DEFAULT_PROJECT_THEME);
  const iconError = validateProjectIcon(DEFAULT_PROJECT_ICON);

  const validationError =
    nameError ??
    descriptionError ??
    (!dataType ? "Select a valid data type." : null) ??
    themeError ??
    iconError;

  if (validationError) {
    return {
      error: validationError,
      success: null,
      fieldValues,
    };
  }

  const baseSlug = generateSlugFromName(fieldValues.name);

  if (!baseSlug) {
    return {
      error: "Project name must contain at least one letter or number.",
      success: null,
      fieldValues,
    };
  }

  const uniqueSlug = await resolveUniqueSlug(baseSlug);

  if (!uniqueSlug) {
    return {
      error: "Unable to generate a unique Project slug. Try a different name.",
      success: null,
      fieldValues,
    };
  }

  if (shouldUseLocalData()) {
    try {
      await localCreateProject({
        name: fieldValues.name.trim(),
        slug: uniqueSlug,
        projectType: dataType as string,
        description: fieldValues.description.trim() || null,
        theme: DEFAULT_PROJECT_THEME,
        icon: DEFAULT_PROJECT_ICON,
      });
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create Project locally.",
        success: null,
        fieldValues,
      };
    }

    revalidatePath("/projects");
    revalidatePath("/dashboard");
    redirect(`/projects/${uniqueSlug}`);
  }

  const supabase = await createClient();

  const { data: projectId, error } = await supabase.rpc("create_project_with_manager", {
    p_name: fieldValues.name.trim(),
    p_slug: uniqueSlug,
    p_description: fieldValues.description.trim() || null,
    p_project_type: dataType,
    p_theme: DEFAULT_PROJECT_THEME,
    p_logo_url: null,
    p_primary_color: null,
    p_secondary_color: null,
    p_icon: DEFAULT_PROJECT_ICON,
  });

  if (error || !projectId) {
    return {
      error: toProjectErrorMessage(error),
      success: null,
      fieldValues,
    };
  }

  const project = await getProjectBySlug(uniqueSlug);

  if (!project) {
    return {
      error: "Project was created but could not be loaded.",
      success: null,
      fieldValues,
    };
  }

  // TODO: Record project.created audit event when activity logging is implemented.

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${project.slug}`);
}

export async function addProjectMember(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  if (shouldUseLocalData()) {
    return {
      error: "Project members are not available in desktop mode.",
      success: null,
    };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const accessLevelInput = String(formData.get("accessLevel") ?? "").trim();
  const accessLevel = validateProjectAccessLevel(accessLevelInput);

  const access = await requireProjectMemberManagement(slug);

  if (!isValidUuid(userId)) {
    return { error: "Select a valid user.", success: null };
  }

  if (!accessLevel) {
    return { error: "Select a valid access level.", success: null };
  }

  const supabase = await createClient();
  const { profile } = await requireUser();

  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !targetProfile) {
    return {
      error: "Only approved users with a profile may be assigned to a Project.",
      success: null,
    };
  }

  const { error } = await supabase.from("project_members").insert({
    project_id: access.project.id,
    user_id: userId,
    access_level: accessLevel,
    assigned_by: profile.id,
  });

  if (error) {
    return { error: toProjectErrorMessage(error), success: null };
  }

  // TODO: Record project.member_added audit event when activity logging is implemented.

  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/projects/${slug}/members`);

  return {
    error: null,
    success: "Member added to the Project.",
  };
}

export async function updateProjectMember(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  if (shouldUseLocalData()) {
    return {
      error: "Project members are not available in desktop mode.",
      success: null,
    };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const accessLevelInput = String(formData.get("accessLevel") ?? "").trim();
  const accessLevel = validateProjectAccessLevel(accessLevelInput);

  const access = await requireProjectMemberManagement(slug);

  if (!isValidUuid(userId)) {
    return { error: "Invalid member.", success: null };
  }

  if (!accessLevel) {
    return { error: "Select a valid access level.", success: null };
  }

  const { data: existingMember, error: existingError } = await createClient()
    .then((client) =>
      client
        .from("project_members")
        .select("access_level")
        .eq("project_id", access.project.id)
        .eq("user_id", userId)
        .maybeSingle(),
    );

  if (existingError || !existingMember) {
    return { error: "Member not found.", success: null };
  }

  if (
    existingMember.access_level === "manager" &&
    accessLevel !== "manager"
  ) {
    const managerCount = await countProjectManagers(access.project.id);

    if (managerCount <= 1) {
      return {
        error: "A Project must retain at least one manager.",
        success: null,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update({ access_level: accessLevel })
    .eq("project_id", access.project.id)
    .eq("user_id", userId);

  if (error) {
    return { error: toProjectErrorMessage(error), success: null };
  }

  // TODO: Record project.member_updated audit event when activity logging is implemented.

  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/projects/${slug}/members`);

  return {
    error: null,
    success: "Member access level updated.",
  };
}

export async function removeProjectMember(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  if (shouldUseLocalData()) {
    return {
      error: "Project members are not available in desktop mode.",
      success: null,
    };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();

  const access = await requireProjectMemberManagement(slug);

  if (!isValidUuid(userId)) {
    return { error: "Invalid member.", success: null };
  }

  const { data: existingMember, error: existingError } = await createClient()
    .then((client) =>
      client
        .from("project_members")
        .select("access_level")
        .eq("project_id", access.project.id)
        .eq("user_id", userId)
        .maybeSingle(),
    );

  if (existingError || !existingMember) {
    return { error: "Member not found.", success: null };
  }

  if (existingMember.access_level === "manager") {
    const managerCount = await countProjectManagers(access.project.id);

    if (managerCount <= 1) {
      return {
        error: "A Project must retain at least one manager.",
        success: null,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", access.project.id)
    .eq("user_id", userId);

  if (error) {
    return { error: toProjectErrorMessage(error), success: null };
  }

  // TODO: Record project.member_removed audit event when activity logging is implemented.

  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/projects/${slug}/members`);

  return {
    error: null,
    success: "Member removed from the Project.",
  };
}
