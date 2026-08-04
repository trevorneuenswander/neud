"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalApiServer = void 0;
exports.getDefaultLocalApiPort = getDefaultLocalApiPort;
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bag_live_state_routes_1 = require("../bag/live-state/bag-live-state-routes");
const password_reset_email_diagnostics_1 = require("../auth/password-reset-email-diagnostics");
const messages_1 = require("../auth/messages");
const local_api_errors_1 = require("../auth/local-api-errors");
const developer_tools_routes_1 = require("./developer-tools-routes");
const application_roles_1 = require("../auth/application-roles");
const platform_permissions_1 = require("../auth/platform-permissions");
const project_permissions_1 = require("../projects/project-permissions");
const with_timeout_1 = require("../utils/with-timeout");
const supabase_identity_service_1 = require("./supabase-identity-service");
const DEFAULT_PORT = 8070;
const PORT_RANGE_END = 8080;
class LocalApiServer {
    paths;
    data;
    auth;
    sessionTokens;
    importService;
    bagLiveState;
    bagEvents;
    server = null;
    baseUrl = null;
    activeRequest = null;
    developerTools = null;
    constructor(paths, data, auth, sessionTokens, importService, bagLiveState, bagEvents) {
        this.paths = paths;
        this.data = data;
        this.auth = auth;
        this.sessionTokens = sessionTokens;
        this.importService = importService;
        this.bagLiveState = bagLiveState;
        this.bagEvents = bagEvents;
    }
    setDeveloperTools(service) {
        this.developerTools = service;
    }
    getInfo() {
        if (!this.baseUrl)
            return null;
        const port = Number(new URL(this.baseUrl).port || DEFAULT_PORT);
        return { baseUrl: this.baseUrl, port };
    }
    async start(preferredPort = DEFAULT_PORT) {
        if (this.server) {
            return this.getInfo();
        }
        const port = await findAvailablePort(preferredPort);
        this.server = http_1.default.createServer((request, response) => {
            void this.handleRequest(request, response);
        });
        await new Promise((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(port, "127.0.0.1", () => resolve());
        });
        this.baseUrl = `http://127.0.0.1:${port}`;
        return { baseUrl: this.baseUrl, port };
    }
    async stop() {
        if (!this.server)
            return;
        await new Promise((resolve, reject) => {
            this.server.close((error) => {
                if (error)
                    reject(error);
                else
                    resolve();
            });
        });
        this.server = null;
        this.baseUrl = null;
    }
    async handleRequest(request, response) {
        this.activeRequest = request;
        try {
            await this.handleRequestInner(request, response);
        }
        finally {
            this.activeRequest = null;
        }
    }
    async handleRequestInner(request, response) {
        try {
            const url = new URL(request.url ?? "/", this.baseUrl ?? "http://127.0.0.1");
            setCors(response);
            if (request.method === "OPTIONS") {
                response.writeHead(204);
                response.end();
                return;
            }
            if (url.pathname === "/api/health") {
                return sendJson(response, 200, { ok: true, service: "neud-local-api" });
            }
            const offlineAssetMatch = url.pathname.match(/^\/api\/offline-assets\/([^/]+)\/(.+)$/);
            if (offlineAssetMatch && request.method === "GET") {
                const packageId = decodeURIComponent(offlineAssetMatch[1]);
                const relativePath = decodeURIComponent(offlineAssetMatch[2]);
                const assetPath = this.data.resolveOfflineAsset(packageId, relativePath);
                if (!assetPath) {
                    return sendJson(response, 404, { error: "Asset not found." });
                }
                const contentType = resolveOfflineAssetContentType(assetPath);
                response.writeHead(200, { "Content-Type": contentType });
                fs_1.default.createReadStream(assetPath).pipe(response);
                return;
            }
            if (url.pathname === "/api/auth/status" && request.method === "GET") {
                try {
                    return sendJson(response, 200, this.data.getAuthStatusBundle());
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load authentication status.";
                    return sendJson(response, 500, { error: message });
                }
            }
            if (url.pathname === "/api/auth/verify-online" && request.method === "POST") {
                try {
                    const result = await this.data.verifyOnlineSession();
                    const statusCode = result.verification.status === "revoked" ? 401 : 200;
                    return sendJson(response, statusCode, result.status);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to verify online session.";
                    return sendJson(response, 500, { error: message });
                }
            }
            if (url.pathname === "/api/access/sync-users" && request.method === "POST") {
                try {
                    this.requireAuth();
                    return sendJson(response, 200, await this.data.syncUserDirectory("manual"));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to synchronize users.";
                    const status = message.includes("permission") ? 403 : 401;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/runtime/status") {
                return sendJson(response, 200, {
                    ok: true,
                    localApi: this.getInfo(),
                    auth: this.auth.getStatus(),
                    passwordResetEmail: (0, password_reset_email_diagnostics_1.getPasswordResetEmailDiagnostics)(),
                    dataDir: this.paths.data,
                });
            }
            if (url.pathname === "/api/projects" && request.method === "GET") {
                return sendJson(response, 200, {
                    projects: this.data.listProjects(url.searchParams.get("q") ?? undefined),
                    meta: this.data.getProjectsListMeta(),
                });
            }
            if (url.pathname === "/api/auth/session" && request.method === "GET") {
                return sendJson(response, 200, this.data.getAuthSessionSnapshot());
            }
            if (url.pathname === "/api/identity/retry" && request.method === "POST") {
                try {
                    this.requireAuth();
                    await this.data.refreshIdentity("retry");
                    return sendJson(response, 200, {
                        ok: true,
                        meta: this.data.getProjectsListMeta(),
                    });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to retry identity sync.";
                    return sendJson(response, 401, { ok: false, error: message });
                }
            }
            if (url.pathname === "/api/projects/meta" && request.method === "GET") {
                const waitParam = url.searchParams.get("wait");
                const shouldWait = waitParam !== "false";
                if (shouldWait) {
                    try {
                        await (0, with_timeout_1.withTimeout)(this.data.ensureIdentityLoaded("meta"), supabase_identity_service_1.IDENTITY_TOTAL_TIMEOUT_MS, "Identity resolution timed out");
                    }
                    catch (error) {
                        const meta = this.data.getProjectsListMeta();
                        if (error instanceof with_timeout_1.TimeoutError) {
                            return sendJson(response, 504, {
                                ok: false,
                                code: "IDENTITY_RESOLUTION_TIMEOUT",
                                retryable: true,
                                ...meta,
                            });
                        }
                        return sendJson(response, 503, {
                            ok: false,
                            code: "IDENTITY_RESOLUTION_FAILED",
                            retryable: true,
                            error: error instanceof Error ? error.message : "Identity resolution failed.",
                            ...meta,
                        });
                    }
                }
                else {
                    this.data.kickIdentityResolution("meta-background");
                }
                return sendJson(response, 200, {
                    ok: true,
                    ...this.data.getProjectsListMeta(),
                });
            }
            if (process.env.NODE_ENV !== "production" &&
                url.pathname === "/api/debug/current-supabase-identity" &&
                request.method === "GET") {
                await this.data.ensureIdentityLoaded("debug");
                const identity = this.data.getSupabaseIdentity()?.getDebugSnapshot() ?? {
                    authenticated: false,
                };
                return sendJson(response, 200, identity);
            }
            if (url.pathname === "/api/dashboard" && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load dashboard.";
                    return sendJson(response, 401, { error: message });
                }
                const limit = Number(url.searchParams.get("limit") ?? "5");
                return sendJson(response, 200, this.data.getDashboardData(limit));
            }
            if (url.pathname === "/api/access/directory" && request.method === "GET") {
                try {
                    this.requireAuth();
                    return sendJson(response, 200, await this.data.getAccessDirectory());
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load access directory.";
                    const status = message.includes("permission") ? 403 : 401;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/viewable-user-ids" && request.method === "GET") {
                try {
                    this.requireAuth();
                    return sendJson(response, 200, this.data.listViewableUserIds());
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load viewable users.";
                    const status = message.includes("permission") ? 403 : 401;
                    return sendJson(response, status, { error: message });
                }
            }
            const accessUserMatch = url.pathname.match(/^\/api\/access\/users\/([^/]+)$/);
            if (accessUserMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                    const targetUserId = decodeURIComponent(accessUserMatch[1]);
                    return sendJson(response, 200, await this.data.getUserDetails(targetUserId));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load user details.";
                    let status = 400;
                    if (message.includes("permission")) {
                        status = 403;
                    }
                    else if (message.includes("not found")) {
                        status = 404;
                    }
                    else if (message.includes("permission to view users")) {
                        status = 401;
                    }
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/teams" && request.method === "POST") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    const team = this.data.createTeam({
                        name: String(body.name ?? ""),
                        description: body.description ? String(body.description) : null,
                    });
                    return sendJson(response, 201, { team });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to create team.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            const accessTeamMatch = url.pathname.match(/^\/api\/access\/teams\/([^/]+)$/);
            if (accessTeamMatch && request.method === "PATCH") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    const team = this.data.updateTeam(decodeURIComponent(accessTeamMatch[1]), {
                        name: body.name !== undefined ? String(body.name) : undefined,
                        description: body.description !== undefined
                            ? body.description === null
                                ? null
                                : String(body.description)
                            : undefined,
                        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
                    });
                    return sendJson(response, 200, { team });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to update team.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/invite" && request.method === "POST") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    const result = this.data.inviteAccessUser({
                        email: String(body.email ?? ""),
                        fullName: String(body.fullName ?? ""),
                        teamId: String(body.teamId ?? ""),
                        role: String(body.role ?? "viewer"),
                        projectIds: Array.isArray(body.projectIds)
                            ? body.projectIds.map(String)
                            : [],
                    });
                    return sendJson(response, 201, result);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to invite user.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/team-members" && request.method === "POST") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    const membership = this.data.upsertAccessTeamMember({
                        teamId: String(body.teamId ?? ""),
                        userId: String(body.userId ?? ""),
                        role: String(body.role ?? "viewer"),
                        projectIds: Array.isArray(body.projectIds)
                            ? body.projectIds.map(String)
                            : [],
                    });
                    return sendJson(response, 200, { membership });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to update team member.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/project-assignments" && request.method === "POST") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    this.data.assignAccessProject({
                        projectId: String(body.projectId ?? ""),
                        teamId: String(body.teamId ?? ""),
                        userId: String(body.userId ?? ""),
                        accessRole: String(body.accessRole ?? "viewer"),
                    });
                    return sendJson(response, 200, { ok: true });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to assign project.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/project-assignments" && request.method === "DELETE") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    this.data.removeAccessProjectAssignment(String(body.projectId ?? ""), String(body.teamId ?? ""), String(body.userId ?? ""));
                    return sendJson(response, 200, { ok: true });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to remove assignment.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/projects/team" && request.method === "POST") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    const project = this.data.assignProjectTeam({
                        projectId: String(body.projectId ?? ""),
                        teamId: String(body.teamId ?? ""),
                        removeAssignments: body.removeAssignments !== false,
                    });
                    return sendJson(response, 200, { project });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to move project.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/access/projects/teams" && request.method === "PUT") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    const result = this.data.setProjectTeams({
                        projectId: String(body.projectId ?? ""),
                        teamIds: Array.isArray(body.teamIds) ? body.teamIds.map(String) : [],
                    });
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to assign project teams.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (accessUserMatch && request.method === "PATCH") {
                try {
                    this.requireAuth();
                    const body = await readJsonBody(request);
                    if (typeof body.isActive !== "boolean") {
                        return sendJson(response, 400, { error: "Active status is required." });
                    }
                    const user = this.data.setAccessUserActive(decodeURIComponent(accessUserMatch[1]), body.isActive);
                    return sendJson(response, 200, { user });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to update user.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            const projectAccessMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/access$/);
            if (projectAccessMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const access = this.data.getProjectAccessContextBySlug(decodeURIComponent(projectAccessMatch[1]));
                if (!access) {
                    return sendJson(response, 403, { error: "You do not have permission to view this project." });
                }
                return sendJson(response, 200, access);
            }
            const projectAccessUsersMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/access-users$/);
            if (projectAccessUsersMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectAccessUsersMatch[1]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    const result = this.data.getProjectAccessUsers(project.id);
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load project access users.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (projectAccessUsersMatch && request.method === "POST") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectAccessUsersMatch[1]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    const body = await readJsonBody(request);
                    const userId = String(body.userId ?? "");
                    const teamId = String(body.teamId ?? "");
                    const pathType = body.pathType === "project_operator" ||
                        body.pathType === "project_viewer" ||
                        body.pathType === "team_admin"
                        ? body.pathType
                        : null;
                    if (!userId || !teamId || !pathType) {
                        return sendJson(response, 400, { error: "Invalid access removal request." });
                    }
                    const result = this.data.removeProjectAccessPath({
                        projectId: project.id,
                        userId,
                        teamId,
                        pathType,
                    });
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to remove project access.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (url.pathname === "/api/projects" && request.method === "POST") {
                try {
                    this.requireCanCreateProject();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to create project.";
                    const code = message.includes("Sign in") ? "unauthenticated" : "forbidden";
                    return sendJson(response, code === "unauthenticated" ? 401 : 403, {
                        ok: false,
                        code,
                        message,
                    });
                }
                const body = await readJsonBody(request);
                const project = this.data.createProject({
                    name: String(body.name ?? ""),
                    slug: String(body.slug ?? ""),
                    projectType: String(body.projectType ?? body.project_type ?? ""),
                    description: body.description ? String(body.description) : null,
                    theme: body.theme ? String(body.theme) : undefined,
                    icon: body.icon ? String(body.icon) : undefined,
                });
                return sendJson(response, 201, { project });
            }
            const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
            if (projectMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const project = this.data.getProjectBySlug(decodeURIComponent(projectMatch[1]));
                if (!project) {
                    return sendJson(response, 404, { error: "Project not found." });
                }
                return sendJson(response, 200, { project });
            }
            if (projectMatch && request.method === "PATCH") {
                try {
                    this.requireAuth();
                    this.requireProjectSettingsAccess();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to update project settings.";
                    const status = message.includes("Sign in") ? 401 : 403;
                    return sendJson(response, status, { error: message });
                }
                const body = await readJsonBody(request);
                const isActiveRaw = body.isActive ?? body.is_active;
                if (typeof isActiveRaw !== "boolean") {
                    return sendJson(response, 400, { error: "Project active status is required." });
                }
                try {
                    const project = this.data.updateProjectSettings(decodeURIComponent(projectMatch[1]), {
                        name: String(body.name ?? ""),
                        isActive: isActiveRaw,
                        description: body.description === undefined || body.description === null
                            ? undefined
                            : String(body.description),
                    });
                    return sendJson(response, 200, { project });
                }
                catch (error) {
                    console.error("[settings] Failed to update project settings");
                    const message = error instanceof Error ? error.message : "Unable to update project settings.";
                    const status = message.includes("not found") ? 404 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            if (projectMatch && request.method === "DELETE") {
                try {
                    this.requireCanDeleteProject();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to delete project.";
                    const code = message.includes("Sign in") ? "unauthenticated" : "forbidden";
                    return sendJson(response, code === "unauthenticated" ? 401 : 403, {
                        ok: false,
                        code,
                        message,
                    });
                }
                const body = await readJsonBody(request);
                const result = await this.data.deleteProject({
                    projectId: decodeURIComponent(projectMatch[1]),
                    confirmationName: String(body.confirmationName ?? ""),
                });
                if (!result.ok) {
                    return sendJson(response, deleteStatusCode(result.code), result);
                }
                return sendJson(response, 200, result);
            }
            const projectCanonicalMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/canonical$/);
            if (projectCanonicalMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const segment = decodeURIComponent(projectCanonicalMatch[1]);
                const result = this.data.getLocalCanonicalProjectResponse(segment);
                if (!result.ok && result.error === "Project not found.") {
                    return sendJson(response, 404, { error: result.error });
                }
                return sendJsonNoStore(response, 200, result);
            }
            const projectPublishingStatusMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/publishing\/status$/);
            if (projectPublishingStatusMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const segment = decodeURIComponent(projectPublishingStatusMatch[1]);
                const project = this.data.resolveProjectRecord(segment);
                if (!project) {
                    return sendJson(response, 404, { error: "Project not found." });
                }
                const diagnostics = this.data.getProjectPublishingDiagnostics(project.id);
                return sendJsonNoStore(response, 200, {
                    ok: true,
                    diagnostics,
                });
            }
            const projectPublishingEnableMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/publishing\/enable$/);
            if (projectPublishingEnableMatch && request.method === "POST") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const segment = decodeURIComponent(projectPublishingEnableMatch[1]);
                const project = this.data.resolveProjectRecord(segment);
                if (!project) {
                    return sendJson(response, 404, { error: "Project not found." });
                }
                const body = await readJsonBody(request);
                const enabled = body?.enabled === true;
                try {
                    await this.data.setProjectPublishingEnabled(project.id, enabled);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to update publishing settings.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { ok: false, error: message });
                }
                return sendJson(response, 200, {
                    ok: true,
                    enabled,
                    diagnostics: this.data.getProjectPublishingDiagnostics(project.id),
                });
            }
            if (url.pathname === "/api/publishing/diagnostics" && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access publishing diagnostics.";
                    return sendJson(response, 401, { error: message });
                }
                return sendJsonNoStore(response, 200, {
                    ok: true,
                    diagnostics: this.data.getPublishingDiagnostics(),
                });
            }
            const projectEnginesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/data-sources$/);
            if (projectEnginesMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const slug = decodeURIComponent(projectEnginesMatch[1]);
                const project = this.data.getProjectBySlug(slug);
                if (!project) {
                    return sendJson(response, 404, { error: "Project not found." });
                }
                return sendJson(response, 200, {
                    engines: this.data.ensureProjectEngines(project.id),
                });
            }
            const projectDisplaysMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays$/);
            if (projectDisplaysMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to access project.";
                    return sendJson(response, 401, { error: message });
                }
                const slug = decodeURIComponent(projectDisplaysMatch[1]);
                const project = this.data.getProjectBySlug(slug);
                if (!project) {
                    return sendJson(response, 404, { error: "Project not found." });
                }
                return sendJson(response, 200, {
                    displays: this.data.listProjectDisplays(project.id),
                });
            }
            if (projectDisplaysMatch && request.method === "POST") {
                try {
                    this.requireAuth();
                    if (!this.developerTools) {
                        return sendJson(response, 503, { error: "Display services unavailable." });
                    }
                    const slug = decodeURIComponent(projectDisplaysMatch[1]);
                    const body = await readJsonBody(request);
                    const result = this.developerTools.createDisplay(slug, {
                        name: String(body.name ?? ""),
                        description: typeof body.description === "string" ? body.description : undefined,
                        html: typeof body.html === "string" ? body.html : undefined,
                        refreshRateMs: body.refreshRateMs !== undefined ? Number(body.refreshRateMs) : undefined,
                        enabled: false,
                        uploadedFilename: typeof body.uploadedFilename === "string" ? body.uploadedFilename : undefined,
                    });
                    return sendJson(response, 201, result);
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            const projectArchivedDisplaysMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays\/archived$/);
            if (projectArchivedDisplaysMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                    if (!this.developerTools) {
                        return sendJson(response, 503, { error: "Display services unavailable." });
                    }
                    const slug = decodeURIComponent(projectArchivedDisplaysMatch[1]);
                    return sendJson(response, 200, {
                        displays: this.developerTools.listArchivedDisplays(slug),
                    });
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            const projectDisplayOrderMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays\/order$/);
            if (projectDisplayOrderMatch && request.method === "GET") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectDisplayOrderMatch[1]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    return sendJson(response, 200, {
                        order: this.data.getUserDisplayOrder(project.id),
                    });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to load display order.";
                    return sendJson(response, 400, { error: message });
                }
            }
            if (projectDisplayOrderMatch && request.method === "POST") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectDisplayOrderMatch[1]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    const body = await readJsonBody(request);
                    const displayIds = Array.isArray(body.displayIds)
                        ? body.displayIds.map((value) => String(value))
                        : [];
                    const result = this.data.saveUserDisplayOrder(project.id, displayIds);
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to save display order.";
                    const status = message.includes("permission") ? 403 : 400;
                    return sendJson(response, status, { error: message });
                }
            }
            const projectDisplayRefreshRateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays\/([^/]+)\/refresh-rate$/);
            if (projectDisplayRefreshRateMatch && request.method === "PATCH") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectDisplayRefreshRateMatch[1]);
                    const displayIdOrKey = decodeURIComponent(projectDisplayRefreshRateMatch[2]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    const body = await readJsonBody(request);
                    const refreshRateMs = Number(body.refreshRateMs);
                    const result = this.data.setDisplayRefreshRate(project.id, displayIdOrKey, refreshRateMs);
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            const projectDisplaySizeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays\/([^/]+)\/display-size$/);
            if (projectDisplaySizeMatch && request.method === "PATCH") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectDisplaySizeMatch[1]);
                    const displayIdOrKey = decodeURIComponent(projectDisplaySizeMatch[2]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    const body = await readJsonBody(request);
                    const result = this.data.setDisplaySize(project.id, displayIdOrKey, Number(body.displayWidth), Number(body.displayHeight));
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            const projectDisplayPatchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays\/([^/]+)$/);
            if (projectDisplayPatchMatch && request.method === "DELETE") {
                try {
                    this.requireAuth();
                    if (!this.developerTools) {
                        return sendJson(response, 503, { error: "Display services unavailable." });
                    }
                    const slug = decodeURIComponent(projectDisplayPatchMatch[1]);
                    const displayId = decodeURIComponent(projectDisplayPatchMatch[2]);
                    const result = this.developerTools.deleteDisplay(slug, displayId);
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            if (projectDisplayPatchMatch && request.method === "PATCH") {
                try {
                    this.requireAuth();
                    const slug = decodeURIComponent(projectDisplayPatchMatch[1]);
                    const displayIdOrKey = decodeURIComponent(projectDisplayPatchMatch[2]);
                    const project = this.data.getProjectBySlug(slug);
                    if (!project) {
                        return sendJson(response, 404, { error: "Project not found." });
                    }
                    const body = await readJsonBody(request);
                    if (body.refreshRateMs !== undefined) {
                        const result = this.data.setDisplayRefreshRate(project.id, displayIdOrKey, Number(body.refreshRateMs));
                        return sendJson(response, 200, result);
                    }
                    if (body.name !== undefined || body.description !== undefined) {
                        if (!this.developerTools) {
                            return sendJson(response, 503, { error: "Display services unavailable." });
                        }
                        const display = this.developerTools.updateDisplayDetails(slug, displayIdOrKey, {
                            ...(body.name !== undefined ? { name: String(body.name) } : {}),
                            ...(body.description !== undefined
                                ? {
                                    description: typeof body.description === "string" ? body.description : null,
                                }
                                : {}),
                        });
                        return sendJson(response, 200, { display });
                    }
                    return sendJson(response, 400, { error: "No supported display fields were provided." });
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            const projectDisplayUnarchiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/displays\/([^/]+)\/unarchive$/);
            if (projectDisplayUnarchiveMatch && request.method === "POST") {
                try {
                    this.requireAuth();
                    if (!this.developerTools) {
                        return sendJson(response, 503, { error: "Display services unavailable." });
                    }
                    const slug = decodeURIComponent(projectDisplayUnarchiveMatch[1]);
                    const displayId = decodeURIComponent(projectDisplayUnarchiveMatch[2]);
                    const result = this.developerTools.unarchiveDisplay(slug, displayId);
                    return sendJson(response, 200, result);
                }
                catch (error) {
                    const failure = resolveLocalApiFailure(error);
                    return sendJson(response, failure.status, failure.body);
                }
            }
            const clearBagDefaultsMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/clear-bag-defaults$/);
            if (clearBagDefaultsMatch && request.method === "POST") {
                this.requireSourceManagementAccess();
                const removed = this.data.clearUntouchedBagDefaults(clearBagDefaultsMatch[1]);
                return sendJson(response, 200, { ok: true, removed });
            }
            const convertGenericMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/convert-generic-adapter$/);
            if (convertGenericMatch && request.method === "POST") {
                this.requireSourceManagementAccess();
                const body = await readJsonBody(request);
                const result = this.data.convertGenericAdapter(convertGenericMatch[1], {
                    removeUntouchedBagUrls: body.removeUntouchedBagUrls === true,
                });
                return sendJson(response, 200, { ok: true, ...result });
            }
            const genericConfigMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/generic-config$/);
            if (genericConfigMatch && request.method === "PUT") {
                this.requireSourceManagementAccess();
                const body = await readJsonBody(request);
                const engine = this.data.saveGenericScraperConfig(genericConfigMatch[1], {
                    pageUrl: String(body.pageUrl ?? ""),
                    loginUrl: body.loginUrl ? String(body.loginUrl) : undefined,
                    login: body.login,
                    fields: Array.isArray(body.fields)
                        ? body.fields
                        : [],
                });
                return sendJson(response, 200, { ok: true, engine });
            }
            const bagSourcesMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/bag-sources$/);
            if (bagSourcesMatch && request.method === "PUT") {
                this.requireSourceManagementAccess();
                const body = await readJsonBody(request);
                this.data.saveBagScraperUrls(bagSourcesMatch[1], {
                    vehicles: body.vehicles ? String(body.vehicles) : undefined,
                    login: body.login ? String(body.login) : undefined,
                    auctionDisplay: body.auctionDisplay ? String(body.auctionDisplay) : undefined,
                });
                return sendJson(response, 200, { ok: true });
            }
            const slugExistsMatch = url.pathname.match(/^\/api\/projects\/slug-exists\/([^/]+)$/);
            if (slugExistsMatch && request.method === "GET") {
                return sendJson(response, 200, {
                    exists: this.data.slugExists(decodeURIComponent(slugExistsMatch[1])),
                });
            }
            const engineDetailMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/detail$/);
            if (engineDetailMatch && request.method === "GET") {
                const bundle = this.data.getEngineDetailBundle(engineDetailMatch[1]);
                if (!bundle) {
                    return sendJson(response, 404, { error: "Data Engine not found." });
                }
                return sendJson(response, 200, bundle);
            }
            const workerBundleMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/worker-bundle$/);
            if (workerBundleMatch && request.method === "GET") {
                const bundle = this.data.getWorkerBundle(workerBundleMatch[1]);
                if (!bundle) {
                    return sendJson(response, 404, { error: "Data Engine not found." });
                }
                return sendJson(response, 200, bundle);
            }
            const workerCredentialsMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/worker-credentials$/);
            if (workerCredentialsMatch && request.method === "GET") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                const creds = this.data.getWorkerCredentials(workerCredentialsMatch[1]);
                if (!creds?.email || !creds.password) {
                    return sendJson(response, 404, { error: "Credentials not found." });
                }
                return sendJson(response, 200, {
                    email: creds.email,
                    password: creds.password,
                });
            }
            const engineMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)$/);
            if (engineMatch && request.method === "GET") {
                const engine = this.data.getEngineById(engineMatch[1]);
                if (!engine) {
                    return sendJson(response, 404, { error: "Data Engine not found." });
                }
                return sendJson(response, 200, { engine });
            }
            const desiredStateMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/desired-state$/);
            if (desiredStateMatch && request.method === "PATCH") {
                const body = await readJsonBody(request);
                const desiredState = body.desiredState === "running" || body.desired_state === "running"
                    ? "running"
                    : "stopped";
                this.data.updateDesiredState(desiredStateMatch[1], desiredState);
                return sendJson(response, 200, { ok: true });
            }
            const executionModeMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/execution-mode$/);
            if (executionModeMatch && request.method === "PATCH") {
                const body = await readJsonBody(request);
                const mode = body.executionMode === "local-desktop" ||
                    body.execution_mode === "local-desktop"
                    ? "local-desktop"
                    : "remote-worker";
                this.data.setExecutionMode(executionModeMatch[1], mode);
                return sendJson(response, 200, { ok: true });
            }
            const runOnceMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/run-once$/);
            if (runOnceMatch && request.method === "POST") {
                this.data.queueRunOnce(runOnceMatch[1]);
                return sendJson(response, 200, { ok: true });
            }
            const runOnceConsumeMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/run-once\/consume$/);
            if (runOnceConsumeMatch && request.method === "POST") {
                return sendJson(response, 200, {
                    pending: this.data.consumeRunOnce(runOnceConsumeMatch[1]),
                });
            }
            const settingsMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/settings$/);
            if (settingsMatch && request.method === "PATCH") {
                const body = await readJsonBody(request);
                this.data.updateScraperSettings(settingsMatch[1], {
                    pollIntervalMs: Number(body.pollIntervalMs ?? body.poll_interval_ms),
                    detailsTtlMs: Number(body.detailsTtlMs ?? body.details_ttl_ms),
                    maxDetailChecksPerPoll: Number(body.maxDetailChecksPerPoll ?? body.max_detail_checks_per_poll),
                    headless: Boolean(body.headless),
                });
                return sendJson(response, 200, { ok: true });
            }
            const bagRepairMatch = url.pathname.match(/^\/api\/projects\/repair-broad-arrow$/);
            if (bagRepairMatch && request.method === "POST") {
                this.requireSourceManagementAccess();
                return sendJson(response, 200, this.data.repairBroadArrowConfiguration());
            }
            const sourcesMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/sources$/);
            if (sourcesMatch && request.method === "GET") {
                this.requireAuth();
                return sendJson(response, 200, {
                    sources: this.data.listBagSources(sourcesMatch[1]),
                });
            }
            if (sourcesMatch && request.method === "POST") {
                this.requireSourceManagementAccess();
                const body = await readJsonBody(request);
                const isCustom = body.custom === true || body.sourceType === "custom";
                const source = isCustom
                    ? this.data.addBagCustomSource(sourcesMatch[1], {
                        name: String(body.name ?? ""),
                        url: String(body.url ?? ""),
                        pageType: String(body.pageType ?? body.source_type ?? "custom"),
                        enabled: body.enabled !== false,
                        description: body.description ? String(body.description) : undefined,
                    })
                    : this.data.saveBagSource(sourcesMatch[1], {
                        id: body.id ? String(body.id) : undefined,
                        name: String(body.name ?? ""),
                        sourceKey: body.sourceKey ? String(body.sourceKey) : undefined,
                        url: String(body.url ?? ""),
                        pageType: String(body.pageType ?? body.page_type ?? body.source_type ?? "page"),
                        enabled: body.enabled !== false,
                        position: body.position != null ? Number(body.position) : undefined,
                        description: body.description ? String(body.description) : undefined,
                    });
                return sendJson(response, 200, { source });
            }
            const sourcesReorderMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/sources\/reorder$/);
            if (sourcesReorderMatch && request.method === "POST") {
                this.requireSourceManagementAccess();
                const body = await readJsonBody(request);
                const orderedSourceIds = Array.isArray(body.orderedSourceIds)
                    ? body.orderedSourceIds.map(String)
                    : [];
                const sources = this.data.reorderBagSources(sourcesReorderMatch[1], orderedSourceIds);
                return sendJson(response, 200, { sources });
            }
            const sourceResetMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/sources\/([^/]+)\/reset$/);
            if (sourceResetMatch && request.method === "POST") {
                this.requireSourceManagementAccess();
                const source = this.data.resetBagSource(sourceResetMatch[1], sourceResetMatch[2]);
                return sendJson(response, 200, { source });
            }
            const sourceMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/sources\/([^/]+)$/);
            if (sourceMatch && request.method === "PATCH") {
                this.requireSourceManagementAccess();
                const body = await readJsonBody(request);
                const keys = Object.keys(body).filter((key) => body[key] !== undefined);
                const toggleOnly = typeof body.enabled === "boolean" &&
                    keys.every((key) => key === "enabled");
                if (toggleOnly) {
                    this.data.toggleScraperSource(sourceMatch[1], sourceMatch[2], Boolean(body.enabled));
                    return sendJson(response, 200, { ok: true });
                }
                const source = this.data.saveBagSource(sourceMatch[1], {
                    id: sourceMatch[2],
                    name: String(body.name ?? ""),
                    sourceKey: body.sourceKey ? String(body.sourceKey) : undefined,
                    url: String(body.url ?? ""),
                    pageType: String(body.pageType ?? body.page_type ?? "page"),
                    enabled: body.enabled !== false,
                    position: body.position != null ? Number(body.position) : undefined,
                    description: body.description ? String(body.description) : undefined,
                });
                return sendJson(response, 200, { source });
            }
            if (sourceMatch && request.method === "DELETE") {
                this.requireSourceManagementAccess();
                try {
                    this.data.removeBagSource(sourceMatch[1], sourceMatch[2]);
                    return sendJson(response, 200, { ok: true });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Unable to remove source.";
                    const code = message.includes("required-source") ? "required-source" : "forbidden";
                    return sendJson(response, 400, { error: message, code });
                }
            }
            const statusMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/status$/);
            if (statusMatch && request.method === "PATCH") {
                const body = await readJsonBody(request);
                this.data.recordStatus(statusMatch[1], {
                    actualState: readOptionalString(body, "actualState", "actual_state"),
                    healthState: readOptionalString(body, "healthState", "health_state"),
                    workerId: readNullableString(body, "workerId", "worker_id"),
                    lastHeartbeatAt: readOptionalString(body, "lastHeartbeatAt", "last_heartbeat_at"),
                    lastRunAt: readOptionalString(body, "lastRunAt", "last_run_at"),
                    lastError: readOptionalString(body, "lastError", "last_error"),
                });
                return sendJson(response, 200, { ok: true });
            }
            const snapshotsMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/snapshots$/);
            if (snapshotsMatch && request.method === "POST") {
                const body = await readJsonBody(request);
                const snapshot = this.data.recordSnapshot(snapshotsMatch[1], {
                    data: body.data ?? {},
                    recordCount: readOptionalNumber(body, "recordCount", "record_count"),
                    payloadSizeBytes: readOptionalNumber(body, "payloadSizeBytes", "payload_size_bytes"),
                    durationMs: readOptionalNumber(body, "durationMs", "duration_ms"),
                    capturedAt: readOptionalString(body, "capturedAt", "captured_at"),
                });
                return sendJson(response, 201, { snapshot });
            }
            const logsMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/logs$/);
            if (logsMatch && request.method === "POST") {
                const body = await readJsonBody(request);
                const log = this.data.recordLog(logsMatch[1], {
                    level: String(body.level ?? "info"),
                    eventType: readOptionalString(body, "eventType", "event_type"),
                    message: String(body.message ?? ""),
                    metadata: body.metadata ?? {},
                });
                return sendJson(response, 201, { log });
            }
            const runSuccessMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/run-success$/);
            if (runSuccessMatch && request.method === "POST") {
                const body = await readJsonBody(request);
                this.data.recordRunSuccess(runSuccessMatch[1], {
                    actualState: String(body.actualState ?? body.actual_state ?? "running"),
                    startedAt: String(body.startedAt ?? body.started_at ?? new Date().toISOString()),
                });
                return sendJson(response, 200, { ok: true });
            }
            const runFailureMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/run-failure$/);
            if (runFailureMatch && request.method === "POST") {
                const body = await readJsonBody(request);
                this.data.recordRunFailure(runFailureMatch[1], {
                    actualState: readOptionalString(body, "actualState", "actual_state"),
                    startedAt: String(body.startedAt ?? body.started_at ?? new Date().toISOString()),
                    errorMessage: String(body.errorMessage ?? body.error_message ?? "Run failed."),
                });
                return sendJson(response, 200, { ok: true });
            }
            const exportClaimMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/export-current-auction\/claim$/);
            if (exportClaimMatch && request.method === "POST") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                const command = this.data.claimExportCurrentAuction(exportClaimMatch[1]);
                return sendJson(response, 200, { command });
            }
            const exportCompleteMatch = url.pathname.match(/^\/api\/data-sources\/export-current-auction\/([^/]+)\/complete$/);
            if (exportCompleteMatch && request.method === "POST") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                const body = await readJsonBody(request);
                this.data.completeExportCurrentAuction(exportCompleteMatch[1], body ?? {}, {
                    workerId: readOptionalString(body, "workerId", "worker_id") ?? undefined,
                    operationId: readOptionalString(body, "operationId", "operation_id") ?? undefined,
                });
                return sendJson(response, 200, { ok: true });
            }
            const exportStartedMatch = url.pathname.match(/^\/api\/data-sources\/export-current-auction\/([^/]+)\/started$/);
            if (exportStartedMatch && request.method === "POST") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                const body = await readJsonBody(request);
                this.data.reportExportStarted(exportStartedMatch[1], {
                    workerId: String(body.workerId ?? body.worker_id ?? ""),
                    operationId: readOptionalString(body, "operationId", "operation_id") ?? undefined,
                    projectId: readOptionalString(body, "projectId", "project_id") ?? undefined,
                });
                return sendJson(response, 200, { ok: true });
            }
            const exportProgressMatch = url.pathname.match(/^\/api\/data-sources\/export-current-auction\/([^/]+)\/progress$/);
            if (exportProgressMatch && request.method === "POST") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                const body = await readJsonBody(request);
                this.data.reportExportProgress(exportProgressMatch[1], {
                    workerId: readOptionalString(body, "workerId", "worker_id") ?? undefined,
                    operationId: readOptionalString(body, "operationId", "operation_id") ?? undefined,
                    message: typeof body.message === "string" ? body.message : undefined,
                    progressPhase: body.progressPhase === "metadata" ||
                        body.progressPhase === "photos" ||
                        body.progressPhase === "writing"
                        ? body.progressPhase
                        : undefined,
                    completedMetadataLots: typeof body.completedMetadataLots === "number"
                        ? body.completedMetadataLots
                        : undefined,
                    totalPhotos: typeof body.totalPhotos === "number" ? body.totalPhotos : undefined,
                    completedPhotos: typeof body.completedPhotos === "number" ? body.completedPhotos : undefined,
                    completedLots: typeof body.completedLots === "number" ? body.completedLots : undefined,
                    totalLots: typeof body.totalLots === "number" ? body.totalLots : undefined,
                    currentLotNumber: readOptionalString(body, "currentLotNumber", "current_lot_number") ?? undefined,
                    currentPhotoIndex: typeof body.currentPhotoIndex === "number" ? body.currentPhotoIndex : undefined,
                    currentPhotoTotal: typeof body.currentPhotoTotal === "number" ? body.currentPhotoTotal : undefined,
                    percent: typeof body.percent === "number" ? body.percent : undefined,
                    phase: typeof body.phase === "string" ? body.phase : undefined,
                });
                return sendJson(response, 200, { ok: true });
            }
            const exportCancelledMatch = url.pathname.match(/^\/api\/data-sources\/export-current-auction\/([^/]+)\/cancelled$/);
            if (exportCancelledMatch && request.method === "GET") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                return sendJson(response, 200, {
                    cancelled: this.data.isExportCancelled(exportCancelledMatch[1]),
                });
            }
            const exportFailMatch = url.pathname.match(/^\/api\/data-sources\/export-current-auction\/([^/]+)\/fail$/);
            if (exportFailMatch && request.method === "POST") {
                if (!isWorkerClientRequest(request)) {
                    return sendJson(response, 403, { error: "Forbidden." });
                }
                const body = await readJsonBody(request);
                this.data.failExportCurrentAuction(exportFailMatch[1], String(body.error ?? body.errorMessage ?? "Export failed."), {
                    workerId: readOptionalString(body, "workerId", "worker_id") ?? undefined,
                    operationId: readOptionalString(body, "operationId", "operation_id") ?? undefined,
                });
                return sendJson(response, 200, { ok: true });
            }
            if (url.pathname === "/api/backup/create" && request.method === "POST") {
                this.requireAuth();
                const backupPath = this.importService.createBackup();
                return sendJson(response, 200, { ok: true, backupPath });
            }
            if (url.pathname === "/api/import/supabase/preview" && request.method === "POST") {
                this.requireAuth();
                const preview = await this.importService.preview();
                return sendJson(response, 200, preview);
            }
            if (url.pathname === "/api/import/supabase/execute" && request.method === "POST") {
                this.requireAuth();
                const body = await readJsonBody(request);
                const selections = Array.isArray(body.selections)
                    ? body.selections.map((row) => ({
                        sourceProjectId: String(row.sourceProjectId ?? row.source_project_id ?? ""),
                        action: normalizeImportAction(row.action),
                    }))
                    : [];
                const result = await this.importService.execute(selections);
                return sendJson(response, 200, result);
            }
            const projectDisplayMatch = url.pathname.match(/^\/api\/display\/([^/]+)\/([^/]+)(?:\/(data|enabled|meta))?$/);
            if (projectDisplayMatch && this.developerTools) {
                const projectId = decodeURIComponent(projectDisplayMatch[1]);
                const displaySlug = decodeURIComponent(projectDisplayMatch[2]);
                const action = projectDisplayMatch[3] ?? "";
                if (action === "enabled" && request.method === "GET") {
                    try {
                        return sendJson(response, 200, {
                            enabled: this.developerTools.getDisplayViewerEnabled(projectId, displaySlug)
                                .enabled,
                        });
                    }
                    catch {
                        return sendJson(response, 404, { error: "Display not found." });
                    }
                }
                if (action === "meta" && request.method === "GET") {
                    try {
                        return sendJson(response, 200, {
                            ...this.developerTools.getDisplayViewerMeta(projectId, displaySlug),
                        });
                    }
                    catch {
                        return sendJson(response, 404, { error: "Display not found." });
                    }
                }
                if (action === "data" && request.method === "GET") {
                    const denied = this.maybeDenyInactiveDisplayAccess(response);
                    if (denied)
                        return denied;
                    const previewMode = url.searchParams.get("preview") === "1";
                    let viewerState;
                    try {
                        viewerState = this.developerTools.getDisplayViewerEnabled(projectId, displaySlug);
                        if (!viewerState.enabled && !previewMode) {
                            return sendJsonNoStore(response, 409, {
                                dataConnected: false,
                                enabled: false,
                                status: "display_disabled",
                                snapshot: null,
                            });
                        }
                    }
                    catch {
                        return sendJson(response, 404, { error: "Display not found." });
                    }
                    this.touchDisplayViewer(request, projectId, displaySlug);
                    const bridgeData = this.data.getGenericDisplayBridgeData(projectId);
                    const dataConnected = previewMode || viewerState.enabled;
                    return sendJsonNoStore(response, 200, {
                        ...bridgeData,
                        enabled: previewMode ? true : viewerState.enabled,
                        dataConnected,
                    });
                }
                if (!action && request.method === "GET") {
                    const denied = this.maybeDenyInactiveDisplayAccess(response);
                    if (denied)
                        return denied;
                    const previewMode = url.searchParams.get("preview") === "1";
                    const outputMode = url.searchParams.get("output") === "1" ||
                        url.searchParams.get("mode") === "output";
                    const resolved = this.developerTools.resolveDisplayViewer(projectId, displaySlug, {
                        preview: previewMode,
                        output: outputMode,
                    });
                    if (resolved.status === "not_found") {
                        return sendJson(response, 404, { error: "Display not found." });
                    }
                    if (resolved.status === "disabled") {
                        return sendHtml(response, 403, renderDisabledDisplayPage());
                    }
                    this.touchDisplayViewer(request, projectId, displaySlug);
                    return sendHtml(response, 200, resolved.html);
                }
            }
            if (url.pathname === "/api/displays/pylon/data" && request.method === "GET") {
                const denied = this.maybeDenyInactiveDisplayAccess(response);
                if (denied)
                    return denied;
                const previewMode = url.searchParams.get("preview") === "1";
                if (!this.data.isPylonDisplayEnabled() && !previewMode) {
                    this.logDisplayDataRequest(request, "pylon", false);
                    return this.sendDisabledPlatformDisplayData(response);
                }
                this.logDisplayDataRequest(request, "pylon", true);
                this.touchDisplayViewer(request, "platform", "pylon");
                return sendJsonNoStore(response, 200, this.data.getPylonDisplayData({ preview: previewMode }));
            }
            if (url.pathname === "/api/displays/pylon/status" && request.method === "GET") {
                return this.sendPlatformDisplayStatus(response, "pylon", this.data.isPylonDisplayEnabled());
            }
            if (url.pathname === "/api/displays/pylon/enabled" && request.method === "GET") {
                return sendJson(response, 200, {
                    enabled: this.data.isPylonDisplayEnabled(),
                });
            }
            if (url.pathname === "/api/displays/pylon/enabled" && request.method === "PATCH") {
                this.requireAuth();
                const body = await readJsonBody(request);
                const enabled = body.enabled === true;
                this.data.setPylonDisplayEnabled(enabled);
                return sendJson(response, 200, { enabled });
            }
            if (url.pathname === "/api/displays/lower-ticker-v5/data" && request.method === "GET") {
                const denied = this.maybeDenyInactiveDisplayAccess(response);
                if (denied)
                    return denied;
                const previewMode = url.searchParams.get("preview") === "1";
                if (!this.data.isLowerTickerDisplayEnabled() && !previewMode) {
                    this.logDisplayDataRequest(request, "lower-ticker-v5", false);
                    return this.sendDisabledPlatformDisplayData(response, { next: [] });
                }
                this.logDisplayDataRequest(request, "lower-ticker-v5", true);
                this.touchDisplayViewer(request, "platform", "lower-ticker-v5");
                return sendJsonNoStore(response, 200, this.data.getLowerTickerDisplayData({ preview: previewMode }));
            }
            if (url.pathname === "/api/displays/lower-ticker-v5/status" &&
                request.method === "GET") {
                return this.sendPlatformDisplayStatus(response, "lower-ticker-v5", this.data.isLowerTickerDisplayEnabled());
            }
            if (url.pathname === "/api/displays/lower-ticker-v5/enabled" &&
                request.method === "GET") {
                return sendJson(response, 200, {
                    enabled: this.data.isLowerTickerDisplayEnabled(),
                });
            }
            if (url.pathname === "/api/displays/lower-ticker-v5/enabled" &&
                request.method === "PATCH") {
                this.requireAuth();
                const body = await readJsonBody(request);
                const enabled = body.enabled === true;
                this.data.setLowerTickerDisplayEnabled(enabled);
                return sendJson(response, 200, { enabled });
            }
            if (url.pathname === "/api/displays/new-bid-display-v1/data" && request.method === "GET") {
                const denied = this.maybeDenyInactiveDisplayAccess(response);
                if (denied)
                    return denied;
                const previewMode = url.searchParams.get("preview") === "1";
                if (!this.data.isNewBidDisplayEnabled() && !previewMode) {
                    this.logDisplayDataRequest(request, "new-bid-display-v1", false);
                    return this.sendDisabledPlatformDisplayData(response);
                }
                this.logDisplayDataRequest(request, "new-bid-display-v1", true);
                this.touchDisplayViewer(request, "platform", "new-bid-display-v1");
                return sendJsonNoStore(response, 200, this.data.getNewBidDisplayData({ preview: previewMode }));
            }
            if (url.pathname === "/api/displays/new-bid-display-v1/status" &&
                request.method === "GET") {
                return this.sendPlatformDisplayStatus(response, "new-bid-display-v1", this.data.isNewBidDisplayEnabled());
            }
            if (url.pathname === "/api/displays/new-bid-display-v1/enabled" && request.method === "GET") {
                return sendJson(response, 200, {
                    enabled: this.data.isNewBidDisplayEnabled(),
                });
            }
            if (url.pathname === "/api/displays/new-bid-display-v1/enabled" &&
                request.method === "PATCH") {
                this.requireAuth();
                const body = await readJsonBody(request);
                const enabled = body.enabled === true;
                this.data.setNewBidDisplayEnabled(enabled);
                return sendJson(response, 200, { enabled });
            }
            if (url.pathname === "/api/displays/new-ticker-v1/data" && request.method === "GET") {
                const denied = this.maybeDenyInactiveDisplayAccess(response);
                if (denied)
                    return denied;
                const previewMode = url.searchParams.get("preview") === "1";
                if (!this.data.isNewTickerDisplayEnabled() && !previewMode) {
                    this.logDisplayDataRequest(request, "new-ticker-v1", false);
                    return this.sendDisabledPlatformDisplayData(response, { next: [] });
                }
                this.logDisplayDataRequest(request, "new-ticker-v1", true);
                this.touchDisplayViewer(request, "platform", "new-ticker-v1");
                return sendJsonNoStore(response, 200, this.data.getNewTickerDisplayData({ preview: previewMode }));
            }
            if (url.pathname === "/api/displays/new-ticker-v1/status" && request.method === "GET") {
                return this.sendPlatformDisplayStatus(response, "new-ticker-v1", this.data.isNewTickerDisplayEnabled());
            }
            if (url.pathname === "/api/displays/new-ticker-v1/enabled" && request.method === "GET") {
                return sendJson(response, 200, {
                    enabled: this.data.isNewTickerDisplayEnabled(),
                });
            }
            if (url.pathname === "/api/displays/new-ticker-v1/enabled" &&
                request.method === "PATCH") {
                this.requireAuth();
                const body = await readJsonBody(request);
                const enabled = body.enabled === true;
                this.data.setNewTickerDisplayEnabled(enabled);
                return sendJson(response, 200, { enabled });
            }
            if (await (0, bag_live_state_routes_1.handleBagRoute)(request, response, url, {
                bagLiveState: this.bagLiveState,
                bagEvents: this.bagEvents,
                baseUrl: this.baseUrl ?? "http://127.0.0.1",
                requireAuth: () => this.requireAuth(),
                requireControlAccess: () => this.requireControlAccess(),
                getActor: () => {
                    const user = this.auth.getAuthenticatedUser();
                    const displayName = user?.displayName?.trim();
                    const email = user?.email?.trim() ?? null;
                    return {
                        id: user?.userId ?? null,
                        email,
                        name: displayName ||
                            (email ? email.split("@")[0] : null) ||
                            "Unknown User",
                    };
                },
                recordActivity: (input) => {
                    this.data.recordActivity(input);
                },
                recordLog: (input) => {
                    const engine = this.data.getPrimaryBagEngineIdPublic();
                    if (!engine)
                        return;
                    this.data.recordLog(engine, input);
                },
            })) {
                return;
            }
            if (this.developerTools) {
                const handled = await (0, developer_tools_routes_1.handleDeveloperToolsRoute)({
                    request,
                    response,
                    url,
                    developerTools: this.developerTools,
                    sendJson,
                    readJsonBody,
                });
                if (handled) {
                    return;
                }
            }
            return sendJson(response, 404, { error: "Not found." });
        }
        catch (error) {
            const failure = resolveLocalApiFailure(error);
            return sendJson(response, failure.status, failure.body);
        }
    }
    getProjectRole() {
        return (0, project_permissions_1.resolveAuthenticatedProjectRole)({
            role: this.auth.getAuthenticatedUser()?.role,
        });
    }
    requireProjectSettingsAccess() {
        if (!(0, project_permissions_1.canManageProjectSettings)(this.getProjectRole())) {
            throw new Error("Only platform owners and admins may update project settings.");
        }
    }
    touchDisplayViewer(request, projectId, displayId) {
        const remote = request.socket.remoteAddress ?? "local";
        this.data.recordDisplayViewerHeartbeat({
            projectId,
            displayId,
            sessionId: `${remote}:${projectId}:${displayId}`,
        });
    }
    logDisplayDataRequest(request, displaySlug, dataConnected) {
        if (process.env.NODE_ENV === "production") {
            return;
        }
        console.debug("[DisplayData][Request]", {
            displaySlug,
            dataConnected,
            clientSource: request.headers["x-neud-display-client"] ?? null,
            userAgent: request.headers["user-agent"] ?? null,
            referer: request.headers.referer ?? null,
            timestamp: new Date().toISOString(),
        });
    }
    sendPlatformDisplayStatus(response, displaySlug, enabled) {
        return sendJsonNoStore(response, 200, {
            displayId: displaySlug,
            dataConnected: enabled,
            enabled,
            updatedAt: new Date().toISOString(),
        });
    }
    sendDisabledPlatformDisplayData(response, extra) {
        return sendJsonNoStore(response, 409, {
            dataConnected: false,
            enabled: false,
            status: "display_disabled",
            source: this.data.getDisplayDataSource(),
            ...extra,
        });
    }
    maybeDenyInactiveDisplayAccess(response) {
        if (!this.auth.isAccessAllowed()) {
            return null;
        }
        const role = this.getProjectRole();
        if ((0, project_permissions_1.canManageProjectSettings)(role)) {
            return null;
        }
        const inactiveProject = this.findInactiveBagProject();
        if (!inactiveProject) {
            return null;
        }
        if (!(0, project_permissions_1.canAccessProject)(role, inactiveProject)) {
            return sendJson(response, 404, { error: "Project not found." });
        }
        return null;
    }
    findInactiveBagProject() {
        const slug = this.data.getDefaultProjectSlug();
        if (!slug) {
            return null;
        }
        const project = this.data.getProjectRecordBySlug(slug);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        if ((0, project_permissions_1.normalizeProjectIsActive)(project)) {
            return null;
        }
        return project;
    }
    requireAuth() {
        if (!this.isRequestAuthorized()) {
            const error = new Error(messages_1.SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE);
            error.code =
                local_api_errors_1.LOCAL_API_ERROR_CODES.AUTH_REQUIRED;
            throw error;
        }
        const headers = this.activeRequest?.headers;
        if (!headers) {
            return;
        }
        const requestToken = this.sessionTokens.readRequestToken(headers);
        if (requestToken && !this.sessionTokens.validate(requestToken)) {
            const error = new Error(messages_1.SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE);
            error.code =
                local_api_errors_1.LOCAL_API_ERROR_CODES.AUTH_REQUIRED;
            throw error;
        }
    }
    isRequestAuthorized() {
        return this.auth.isAccessAllowed();
    }
    requireCanCreateProject() {
        this.requireAuth();
        if (!this.data.canCreateProject()) {
            throw new Error("Only platform owners and admins may create projects.");
        }
    }
    requireCanDeleteProject() {
        this.requireAuth();
        if (!this.data.canDeleteProject()) {
            throw new Error("Only platform owners and admins can delete projects.");
        }
    }
    requireAdmin() {
        this.requireAuth();
        if (!this.data.isPlatformAdmin()) {
            throw new Error("Only admin users can perform this action.");
        }
    }
    requireSourceManagementAccess() {
        this.requireAuth();
        const role = (0, application_roles_1.getApplicationRole)({
            role: this.auth.getAuthenticatedUser()?.role,
        });
        if (role === "viewer" || role === "operator") {
            throw new Error("Only owners and admins can manage scraper configuration.");
        }
    }
    requireControlAccess() {
        this.requireAuth();
        const user = this.auth.getAuthenticatedUser();
        if (!(0, platform_permissions_1.canOperateProject)({ role: user?.role })) {
            throw new Error("Only owners, admins, and operators can control Manual Mode.");
        }
    }
}
exports.LocalApiServer = LocalApiServer;
function deleteStatusCode(code) {
    switch (code) {
        case "unauthorized":
            return 401;
        case "forbidden":
        case "confirmation-mismatch":
            return 403;
        case "project-not-found":
            return 404;
        default:
            return 400;
    }
}
function normalizeImportAction(value) {
    if (value === "create" || value === "copy") {
        return value;
    }
    return "skip";
}
function setCors(response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, x-neud-local-session");
}
function resolveOfflineAssetContentType(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    switch (ext) {
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".png":
            return "image/png";
        case ".webp":
            return "image/webp";
        case ".gif":
            return "image/gif";
        default:
            return "application/octet-stream";
    }
}
function sendJson(response, status, payload) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}
function sendJsonNoStore(response, status, payload) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(payload));
}
function sendHtml(response, status, html) {
    response.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
    });
    response.end(html);
}
function renderDisabledDisplayPage() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Display Off</title>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      width: 1920px;
      height: 1080px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #fff;
      background: rgba(5, 8, 13, 0.85);
    }
    .message {
      font-size: 42px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div class="message">Display Off</div>
</body>
</html>`;
}
function resolveLocalApiFailure(error) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    const explicitCode = error.code;
    if (explicitCode === local_api_errors_1.LOCAL_API_ERROR_CODES.AUTH_REQUIRED ||
        message.includes("Sign in")) {
        return {
            status: 401,
            body: (0, local_api_errors_1.localApiErrorResponse)(local_api_errors_1.LOCAL_API_ERROR_CODES.AUTH_REQUIRED, message),
        };
    }
    if (explicitCode === local_api_errors_1.LOCAL_API_ERROR_CODES.FORBIDDEN ||
        message.includes("admin users") ||
        message.includes("Only owners") ||
        message.includes("Only platform") ||
        message.toLowerCase().includes("forbidden")) {
        return {
            status: 403,
            body: (0, local_api_errors_1.localApiErrorResponse)(local_api_errors_1.LOCAL_API_ERROR_CODES.FORBIDDEN, message),
        };
    }
    if (explicitCode === local_api_errors_1.LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND ||
        message.includes("not found")) {
        return {
            status: 404,
            body: (0, local_api_errors_1.localApiErrorResponse)(local_api_errors_1.LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND, message),
        };
    }
    if (message.includes("Unsupported")) {
        return {
            status: 400,
            body: { error: message },
        };
    }
    return {
        status: 500,
        body: {
            error: message,
            code: explicitCode,
        },
    };
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
        return {};
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function readOptionalString(body, camelKey, snakeKey) {
    const value = body[camelKey] ?? body[snakeKey];
    return typeof value === "string" ? value : undefined;
}
function readNullableString(body, camelKey, snakeKey) {
    const value = body[camelKey] ?? body[snakeKey];
    if (value === null)
        return null;
    return typeof value === "string" ? value : undefined;
}
function readOptionalNumber(body, camelKey, snakeKey) {
    const value = body[camelKey] ?? body[snakeKey];
    if (value === null)
        return null;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function isWorkerClientRequest(request) {
    return request.headers["x-neud-worker-client"] === "data-engine";
}
function findAvailablePort(preferred) {
    const candidates = [];
    for (let port = preferred; port <= PORT_RANGE_END; port += 1) {
        candidates.push(port);
    }
    return new Promise((resolve, reject) => {
        const tryNext = (index) => {
            if (index >= candidates.length) {
                reject(new Error("Unable to find a free local API port."));
                return;
            }
            const port = candidates[index];
            const probe = http_1.default.createServer();
            probe.once("error", () => tryNext(index + 1));
            probe.once("listening", () => {
                probe.close(() => resolve(port));
            });
            probe.listen(port, "127.0.0.1");
        };
        tryNext(0);
    });
}
function getDefaultLocalApiPort() {
    return DEFAULT_PORT;
}
