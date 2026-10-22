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

  registerIpcHandler(
    "neud:local:createProject",
    async (
      _event,
      input: {
        name: string;
        slug: string;
        projectType: string;
        description?: string | null;
        theme?: string;
        icon?: string;
        capabilities?: string[];
        teamIds?: string[];
      },
    ) => {
      if (!deps.auth.isAccessAllowed()) {
        throw new Error("Authorization required.");
      }
      const project = await deps.data.createProject({
        name: String(input?.name ?? ""),
        slug: String(input?.slug ?? ""),
        projectType: String(input?.projectType ?? "modular"),
        description: input?.description ?? null,
        theme: input?.theme,
        icon: input?.icon,
        capabilities: Array.isArray(input?.capabilities)
          ? input.capabilities.map(String)
          : undefined,
        teamIds: Array.isArray(input?.teamIds)
          ? input.teamIds.map(String)
          : [],
      });
      return { project };
    },
  );

  registerIpcHandler(
    "neud:local:updateProjectCapabilities",
    async (
      _event,
      input: { projectSlug: string; capabilities: string[] },
    ) => {
      if (!deps.auth.isAccessAllowed()) {
        throw new Error("Authorization required.");
      }
      const slug = String(input?.projectSlug ?? "").trim();
      const project = deps.data.getProjectBySlug(slug);
      if (!project || typeof (project as { id?: string }).id !== "string") {
        throw new Error("Project not found.");
      }
      const projectId = (project as { id: string }).id;
      return deps.data.setProjectCapabilities(
        projectId,
        Array.isArray(input?.capabilities)
          ? input.capabilities.map(String)
          : [],
      );
    },
  );
}
