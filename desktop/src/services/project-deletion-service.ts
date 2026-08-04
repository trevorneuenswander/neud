import fs from "fs";
import path from "path";
import type { AuthLicenseManager } from "./auth-license-manager";
import { SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE } from "../auth/messages";
import type { CredentialStore } from "./credential-store";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { AppPaths } from "./app-paths";
import type { EngineManager } from "./engine-manager";
import type { BagLiveStateEvents } from "../bag/live-state/bag-live-state-events";
import { canDeleteProject } from "../auth/platform-permissions";

export type DeleteProjectResult =
  | {
      ok: true;
      deletedProjectId: string;
      stoppedEngineIds: string[];
      cleanupWarnings: string[];
    }
  | {
      ok: false;
      code:
        | "unauthorized"
        | "forbidden"
        | "project-not-found"
        | "confirmation-mismatch"
        | "engine-stop-failed"
        | "delete-failed";
      message: string;
    };

export class ProjectDeletionService {
  private engineManager: EngineManager | null = null;

  constructor(
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly credentials: CredentialStore,
    private readonly paths: AppPaths,
    private readonly auth: AuthLicenseManager,
    private readonly bagEvents: BagLiveStateEvents,
  ) {}

  setEngineManager(engineManager: EngineManager) {
    this.engineManager = engineManager;
  }

  canDeleteProject(): boolean {
    if (!this.auth.isAccessAllowed()) {
      return false;
    }
    return canDeleteProject({ role: this.auth.getAuthenticatedUser()?.role });
  }

  /** @deprecated Use canDeleteProject() for delete authorization. */
  isPlatformAdmin(): boolean {
    return this.canDeleteProject();
  }

  deleteProjectInternal(input: {
    projectId: string;
  }): DeleteProjectResult {
    const project = this.projects.getById(input.projectId);
    if (!project) {
      return {
        ok: false,
        code: "project-not-found",
        message: "Project not found.",
      };
    }

    const engines = this.dataSources.listByProject(project.id);
    const stoppedEngineIds: string[] = [];

    if (this.engineManager) {
      for (const engine of engines) {
        try {
          void this.engineManager.stop(engine.id);
          stoppedEngineIds.push(engine.id);
        } catch {
          // Best effort during bootstrap or shutdown cleanup.
        }
      }
    }

    for (const engine of engines) {
      this.credentials.clearCredentials(engine.id);
    }

    try {
      this.projects.delete(project.id);
    } catch {
      return {
        ok: false,
        code: "delete-failed",
        message: "Unable to delete the project.",
      };
    }

    this.bagEvents.closeProject(project.id);
    const cleanupWarnings = this.cleanupRuntimeFiles(
      project.id,
      engines.map((engine) => engine.id),
    );

    return {
      ok: true,
      deletedProjectId: project.id,
      stoppedEngineIds,
      cleanupWarnings,
    };
  }

  async deleteProject(input: {
    projectId: string;
    confirmationName: string;
  }): Promise<DeleteProjectResult> {
    if (!this.auth.isAccessAllowed()) {
      return {
        ok: false,
        code: "unauthorized",
        message: SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE,
      };
    }

    if (!this.canDeleteProject()) {
      return {
        ok: false,
        code: "forbidden",
        message: "Only platform owners and admins can delete projects.",
      };
    }

    const project = this.projects.getById(input.projectId);
    if (!project) {
      return {
        ok: false,
        code: "project-not-found",
        message: "Project not found.",
      };
    }

    if (input.confirmationName.trim() !== project.name.trim()) {
      return {
        ok: false,
        code: "confirmation-mismatch",
        message: "Project name confirmation does not match.",
      };
    }

    const engines = this.dataSources.listByProject(project.id);
    const stoppedEngineIds: string[] = [];

    if (this.engineManager) {
      for (const engine of engines) {
        try {
          await this.engineManager.stop(engine.id);
          stoppedEngineIds.push(engine.id);
        } catch (error) {
          return {
            ok: false,
            code: "engine-stop-failed",
            message:
              error instanceof Error
                ? error.message
                : "Unable to stop a running project engine before deletion.",
          };
        }
      }
    }

    for (const engine of engines) {
      this.credentials.clearCredentials(engine.id);
    }

    try {
      this.projects.delete(project.id);
    } catch {
      return {
        ok: false,
        code: "delete-failed",
        message: "Unable to delete the project.",
      };
    }

    this.bagEvents.closeProject(project.id);

    const cleanupWarnings = this.cleanupRuntimeFiles(project.id, engines.map((e) => e.id));

    return {
      ok: true,
      deletedProjectId: project.id,
      stoppedEngineIds,
      cleanupWarnings,
    };
  }

  private cleanupRuntimeFiles(projectId: string, engineIds: string[]): string[] {
    const warnings: string[] = [];
    const approvedRoots = [
      this.paths.browserData,
      this.paths.cookies,
      this.paths.engineLogs,
      this.paths.credentialsDir,
      this.paths.engines,
      this.paths.projects,
      this.paths.cache,
    ];

    const targets = [
      ...engineIds.flatMap((engineId) => [
        path.join(this.paths.browserData, engineId),
        path.join(this.paths.cookies, `${engineId}.json`),
        path.join(this.paths.engineLogs, `${engineId}.log`),
        path.join(this.paths.credentialsDir, `${engineId}.cred`),
      ]),
      path.join(this.paths.projects, projectId),
      path.join(this.paths.engines, projectId),
    ];

    for (const target of targets) {
      if (!this.isApprovedCleanupPath(target, approvedRoots)) {
        warnings.push(`Skipped unapproved cleanup path: ${target}`);
        continue;
      }

      try {
        if (!fs.existsSync(target)) {
          continue;
        }

        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          fs.rmSync(target, { recursive: true, force: true });
        } else {
          fs.unlinkSync(target);
        }
      } catch {
        warnings.push(`Unable to remove runtime path: ${target}`);
      }
    }

    return warnings;
  }

  private isApprovedCleanupPath(target: string, approvedRoots: string[]): boolean {
    const normalizedTarget = path.resolve(target);
    return approvedRoots.some((root) => {
      const normalizedRoot = path.resolve(root);
      return (
        normalizedTarget === normalizedRoot ||
        normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
      );
    });
  }
}
