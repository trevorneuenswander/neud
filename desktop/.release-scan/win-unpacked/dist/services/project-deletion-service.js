"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectDeletionService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const messages_1 = require("../auth/messages");
const platform_permissions_1 = require("../auth/platform-permissions");
class ProjectDeletionService {
    projects;
    dataSources;
    credentials;
    paths;
    auth;
    bagEvents;
    engineManager = null;
    constructor(projects, dataSources, credentials, paths, auth, bagEvents) {
        this.projects = projects;
        this.dataSources = dataSources;
        this.credentials = credentials;
        this.paths = paths;
        this.auth = auth;
        this.bagEvents = bagEvents;
    }
    setEngineManager(engineManager) {
        this.engineManager = engineManager;
    }
    canDeleteProject() {
        if (!this.auth.isAccessAllowed()) {
            return false;
        }
        return (0, platform_permissions_1.canDeleteProject)({ role: this.auth.getAuthenticatedUser()?.role });
    }
    /** @deprecated Use canDeleteProject() for delete authorization. */
    isPlatformAdmin() {
        return this.canDeleteProject();
    }
    deleteProjectInternal(input) {
        const project = this.projects.getById(input.projectId);
        if (!project) {
            return {
                ok: false,
                code: "project-not-found",
                message: "Project not found.",
            };
        }
        const engines = this.dataSources.listByProject(project.id);
        const stoppedEngineIds = [];
        if (this.engineManager) {
            for (const engine of engines) {
                try {
                    void this.engineManager.stop(engine.id);
                    stoppedEngineIds.push(engine.id);
                }
                catch {
                    // Best effort during bootstrap or shutdown cleanup.
                }
            }
        }
        for (const engine of engines) {
            this.credentials.clearCredentials(engine.id);
        }
        try {
            this.projects.delete(project.id);
        }
        catch {
            return {
                ok: false,
                code: "delete-failed",
                message: "Unable to delete the project.",
            };
        }
        this.bagEvents.closeProject(project.id);
        const cleanupWarnings = this.cleanupRuntimeFiles(project.id, engines.map((engine) => engine.id));
        return {
            ok: true,
            deletedProjectId: project.id,
            stoppedEngineIds,
            cleanupWarnings,
        };
    }
    async deleteProject(input) {
        if (!this.auth.isAccessAllowed()) {
            return {
                ok: false,
                code: "unauthorized",
                message: messages_1.SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE,
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
        const stoppedEngineIds = [];
        if (this.engineManager) {
            for (const engine of engines) {
                try {
                    await this.engineManager.stop(engine.id);
                    stoppedEngineIds.push(engine.id);
                }
                catch (error) {
                    return {
                        ok: false,
                        code: "engine-stop-failed",
                        message: error instanceof Error
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
        }
        catch {
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
    cleanupRuntimeFiles(projectId, engineIds) {
        const warnings = [];
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
                path_1.default.join(this.paths.browserData, engineId),
                path_1.default.join(this.paths.cookies, `${engineId}.json`),
                path_1.default.join(this.paths.engineLogs, `${engineId}.log`),
                path_1.default.join(this.paths.credentialsDir, `${engineId}.cred`),
            ]),
            path_1.default.join(this.paths.projects, projectId),
            path_1.default.join(this.paths.engines, projectId),
        ];
        for (const target of targets) {
            if (!this.isApprovedCleanupPath(target, approvedRoots)) {
                warnings.push(`Skipped unapproved cleanup path: ${target}`);
                continue;
            }
            try {
                if (!fs_1.default.existsSync(target)) {
                    continue;
                }
                const stat = fs_1.default.statSync(target);
                if (stat.isDirectory()) {
                    fs_1.default.rmSync(target, { recursive: true, force: true });
                }
                else {
                    fs_1.default.unlinkSync(target);
                }
            }
            catch {
                warnings.push(`Unable to remove runtime path: ${target}`);
            }
        }
        return warnings;
    }
    isApprovedCleanupPath(target, approvedRoots) {
        const normalizedTarget = path_1.default.resolve(target);
        return approvedRoots.some((root) => {
            const normalizedRoot = path_1.default.resolve(root);
            return (normalizedTarget === normalizedRoot ||
                normalizedTarget.startsWith(`${normalizedRoot}${path_1.default.sep}`));
        });
    }
}
exports.ProjectDeletionService = ProjectDeletionService;
