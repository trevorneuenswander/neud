import type { AuthLicenseManager } from "../services/auth-license-manager";
import type { LocalApiServer } from "../services/local-api-server";
import type { LocalDataService } from "../services/local-data-service";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  normalizeLocalApiOrigin,
} from "../lib/normalize-local-api-origin";
import { registerIpcHandler } from "./channels";

export function registerLocalDataIpc(deps: {
  data: LocalDataService;
  localApi: LocalApiServer;
  auth: AuthLicenseManager;
  getSessionConfig: () => {
    baseUrl: string;
    sessionToken: string;
    userId: string;
    updatedAt: string;
  } | null;
}) {
  registerIpcHandler("neud:local:listProjects", () => {
    if (!deps.auth.isAccessAllowed()) {
      throw new Error("Authorization required.");
    }
    return deps.data.listProjects();
  });

  registerIpcHandler("neud:local:getRuntimeStatus", () => {
    return {
      localApi: deps.localApi.getInfo(),
      auth: deps.auth.getStatus(),
    };
  });

  registerIpcHandler("neud:local:getApiConfig", () => {
    const config = deps.getSessionConfig();
    const localApi = deps.localApi.getInfo();
    const baseUrl =
      normalizeLocalApiOrigin(config?.baseUrl) ??
      normalizeLocalApiOrigin(localApi?.baseUrl) ??
      DEFAULT_LOCAL_API_ORIGIN;
    return {
      baseUrl,
      sessionToken: config?.sessionToken ?? null,
    };
  });
}
