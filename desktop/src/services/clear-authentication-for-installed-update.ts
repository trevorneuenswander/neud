import type { Session } from "electron";
import { AUTH_EXPLICITLY_SIGNED_OUT_KEY } from "../auth/session-recovery-keys";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { CloudAccessCacheRepository } from "../repositories/cloud-access-cache-repository";
import type { AppPaths } from "./app-paths";
import type { AuthLicenseManager } from "./auth-license-manager";
import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";
import type { LocalAuthBootstrapService } from "./local-auth-bootstrap-service";
import type { SupabaseUserSessionService } from "./supabase-user-session";

export type ClearAuthenticationForInstalledUpdateContext = {
  paths: AppPaths;
  authLicenseManager: AuthLicenseManager;
  supabaseUserSessionService: SupabaseUserSessionService;
  authenticatedCloud: AuthenticatedCloudCoordinator;
  appSettingsRepository: AppSettingsRepository;
  localAuthBootstrap?: LocalAuthBootstrapService;
  cloudAccessCacheRepository?: CloudAccessCacheRepository;
  stopCloudSyncServices?: () => void;
  clearIdentityOnSession?: () => void;
  appUrl?: string;
  electronSession?: Session;
};

export async function clearAuthenticationForInstalledUpdate(
  context: ClearAuthenticationForInstalledUpdateContext,
): Promise<void> {
  console.info("[update-session] Clearing authentication after installed update");

  context.stopCloudSyncServices?.();
  context.appSettingsRepository.set(AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
  context.authLicenseManager.clear();
  context.supabaseUserSessionService.clearSession();
  context.authenticatedCloud.notifySessionCleared();
  context.clearIdentityOnSession?.();
  context.localAuthBootstrap?.getSessionTokenService().clearSessionBinding();
  clearCloudAccessCache(context.cloudAccessCacheRepository);

  if (context.electronSession) {
    await context.electronSession.clearStorageData();
    await context.electronSession.clearCache();
  }

  if (context.appUrl) {
    try {
      await fetch(`${context.appUrl}/api/local/reset-session-cache`, {
        method: "POST",
      });
      console.info("[update-session] Next.js session cache reset requested");
    } catch (error) {
      console.warn("[update-session] Next.js session cache reset failed", error);
    }
  }
}

function clearCloudAccessCache(
  repository: CloudAccessCacheRepository | undefined,
): void {
  if (!repository?.isTableAvailable()) {
    return;
  }

  try {
    repository.clearCachedDirectory();
  } catch (error) {
    console.warn("[update-session] Failed to clear cloud access cache", error);
  }
}
