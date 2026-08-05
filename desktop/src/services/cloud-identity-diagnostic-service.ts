import fs from "fs";
import path from "path";
import { app } from "electron";
import { getCanonicalReleaseVersion } from "../app/release-version";
import type { AppPaths } from "./app-paths";
import type { AuthLicenseManager } from "./auth-license-manager";
import type { AccessAuthorizationService } from "./access-authorization-service";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import { getOrCreateNeudInstanceId } from "./neud-instance-id";

export type CloudIdentityDiagnosticReport = {
  generatedAt: string;
  appVersion: string;
  packaged: boolean;
  resourcesPath: string | null;
  neudInstanceId: string;
  cloudConfigured: boolean;
  cloudSessionAvailable: boolean;
  cloudSessionRestoreAt: string | null;
  supabaseUserId: string | null;
  localProfileUserId: string | null;
  platformRole: string | null;
  isOwner: boolean;
  isPlatformAdmin: boolean;
  canManageUsersAndAccess: boolean;
  accessibleProjectCount: number;
  projects: Array<{
    localProjectId: string;
    slug: string;
    projectType: string;
    teamId: string | null;
    inAccessibleSet: boolean;
  }>;
  hostedProjectLookupAttempted: boolean;
  hostedProjectLookupError: string | null;
  hostedProjectsBySlug: Record<string, string | null>;
};

const DIAGNOSTIC_FILENAME = "cloud-identity-diagnostic.json";

export async function runCloudIdentityDiagnostic(input: {
  paths: AppPaths;
  auth: AuthLicenseManager;
  access: AccessAuthorizationService;
  projects: ProjectsRepository;
  cloud: AuthenticatedCloudCoordinator | null;
  settings: AppSettingsRepository;
}): Promise<CloudIdentityDiagnosticReport> {
  const authUser = input.auth.getAuthenticatedUser();
  const context = input.access.getAuthorizationContext();
  const sessionDiagnostics = input.settings.get<{
    lastSessionRestoreAt?: string | null;
  } | null>("cloudSession.diagnostics", null);

  const localProjects = input.projects.list();
  const accessibleIds = new Set(context?.accessibleProjectIds ?? []);

  const report: CloudIdentityDiagnosticReport = {
    generatedAt: new Date().toISOString(),
    appVersion: getCanonicalReleaseVersion(),
    packaged: app.isPackaged,
    resourcesPath: app.isPackaged ? process.resourcesPath : null,
    neudInstanceId: getOrCreateNeudInstanceId(input.settings),
    cloudConfigured: input.cloud?.isCloudConfigured() ?? false,
    cloudSessionAvailable:
      input.cloud?.isAuthenticatedCloudSessionAvailable() ?? false,
    cloudSessionRestoreAt: sessionDiagnostics?.lastSessionRestoreAt ?? null,
    supabaseUserId: authUser?.userId ?? null,
    localProfileUserId: context?.userId ?? null,
    platformRole: context?.platformRole ?? null,
    isOwner: context?.platformRole === "owner",
    isPlatformAdmin: context?.platformRole === "owner",
    canManageUsersAndAccess: context?.canManageUsersAndAccess ?? false,
    accessibleProjectCount: accessibleIds.size,
    projects: localProjects.map((project) => ({
      localProjectId: project.id,
      slug: project.slug,
      projectType: project.projectType,
      teamId: project.teamId ?? null,
      inAccessibleSet: accessibleIds.has(project.id),
    })),
    hostedProjectLookupAttempted: false,
    hostedProjectLookupError: null,
    hostedProjectsBySlug: {},
  };

  if (!input.cloud?.isAuthenticatedCloudSessionAvailable()) {
    return report;
  }

  try {
    const supabase = await input.cloud.getClient();
    if (!supabase) {
      report.hostedProjectLookupError = "Supabase client unavailable.";
      return report;
    }

    report.hostedProjectLookupAttempted = true;
    for (const project of localProjects) {
      const { data, error } = await supabase
        .from("projects")
        .select("id")
        .eq("slug", project.slug)
        .maybeSingle();
      if (error) {
        report.hostedProjectLookupError = error.message;
        report.hostedProjectsBySlug[project.slug] = null;
        continue;
      }
      report.hostedProjectsBySlug[project.slug] =
        typeof data?.id === "string" ? data.id : null;
    }
  } catch (error) {
    report.hostedProjectLookupError =
      error instanceof Error ? error.message : String(error);
  }

  return report;
}

export function writeCloudIdentityDiagnosticReport(
  paths: AppPaths,
  report: CloudIdentityDiagnosticReport,
): string {
  const target = path.join(paths.logs, DIAGNOSTIC_FILENAME);
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
  return target;
}

export async function runAndWriteCloudIdentityDiagnostic(input: {
  paths: AppPaths;
  auth: AuthLicenseManager;
  access: AccessAuthorizationService;
  projects: ProjectsRepository;
  cloud: AuthenticatedCloudCoordinator | null;
  settings: AppSettingsRepository;
}): Promise<string> {
  const report = await runCloudIdentityDiagnostic(input);
  return writeCloudIdentityDiagnosticReport(input.paths, report);
}
