"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadArrowStreamDisplaysImportService = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const broad_arrow_stream_display_specs_1 = require("../displays/broad-arrow-stream-display-specs");
const stream_display_v2_transform_1 = require("../displays/stream-display-v2-transform");
const project_scraper_code_repository_1 = require("../repositories/project-scraper-code-repository");
class BroadArrowStreamDisplaysImportService {
    settings;
    projects;
    displays;
    displayCode;
    revisions;
    storage;
    repoRoot;
    constructor(settings, projects, displays, displayCode, revisions, storage, repoRoot) {
        this.settings = settings;
        this.projects = projects;
        this.displays = displays;
        this.displayCode = displayCode;
        this.revisions = revisions;
        this.storage = storage;
        this.repoRoot = repoRoot;
    }
    ensureImported(actorUserId = "system") {
        const project = this.projects.getBySlug(broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug);
        if (!project || !(0, broad_arrow_phase_1.isBroadArrowCanonicalProject)(project)) {
            return {
                projectId: null,
                imported: [],
                createdCount: 0,
                revisionCount: 0,
            };
        }
        const imported = broad_arrow_stream_display_specs_1.BROAD_ARROW_STREAM_DISPLAY_SPECS.map((spec) => this.ensureDisplayImported(project.id, spec, actorUserId));
        this.settings.set(broad_arrow_stream_display_specs_1.BROAD_ARROW_STREAM_DISPLAYS_IMPORT_KEY, "complete");
        return {
            projectId: project.id,
            imported,
            createdCount: imported.filter((result) => result.created).length,
            revisionCount: imported.filter((result) => result.revisionPublished).length,
        };
    }
    ensureDisplayImported(projectId, spec, actorUserId) {
        const runtimeHtml = this.buildRuntimeHtml(spec);
        const sourceHash = (0, project_scraper_code_repository_1.hashSource)(`${runtimeHtml}\n\n`);
        const existingCode = this.displayCode.getBySlug(projectId, spec.slug);
        if (existingCode) {
            const published = this.storage.readDisplayPublished(projectId, existingCode.displayId);
            const publishedHash = published
                ? (0, project_scraper_code_repository_1.hashSource)(`${published.html}\n${published.css ?? ""}\n${published.javascript ?? ""}`)
                : null;
            if (publishedHash === sourceHash) {
                this.ensureDisplaySettings(existingCode.displayId, spec);
                return {
                    slug: spec.slug,
                    created: false,
                    revisionPublished: false,
                    displayId: existingCode.displayId,
                    skipped: true,
                    reason: "Display already published with current HTML source.",
                };
            }
            const revisionId = (0, project_scraper_code_repository_1.createRevisionId)();
            const revisionName = (0, broad_arrow_stream_display_specs_1.buildStreamDisplayRevisionName)(spec.graphicType === "stream-bid" ? "stream-bid-v1" : "stream-ticker-v1");
            const bundle = {
                html: runtimeHtml,
                css: "",
                javascript: "",
                metadata: {
                    revisionId,
                    revisionName,
                    changeNote: "Updated Stream display HTML with NEUD runtime bridge.",
                    standaloneDocument: true,
                    importKey: spec.importKey,
                },
            };
            this.storage.writeDisplayRevision(projectId, existingCode.displayId, revisionId, bundle);
            this.storage.writeDisplayPublished(projectId, existingCode.displayId, bundle);
            this.revisions.create({
                id: revisionId,
                projectId,
                resourceType: "display",
                resourceId: existingCode.displayId,
                revisionName,
                changeNote: bundle.metadata.changeNote,
                sourceHash,
                validationStatus: "valid",
                createdBy: actorUserId,
                message: `Published ${spec.name} ${revisionName}`,
                metadata: { storageRevisionId: revisionId, importKey: spec.importKey },
            });
            this.displayCode.upsert({
                displayId: existingCode.displayId,
                projectId,
                slug: spec.slug,
                description: spec.description,
                sourceType: "project-html",
                draftHtml: bundle.html,
                draftCss: bundle.css,
                draftJavascript: bundle.javascript,
                publishedRevisionId: revisionId,
                archived: false,
                archivedAt: null,
                archivedByUserId: null,
                updatedBy: actorUserId,
            });
            this.ensureDisplaySettings(existingCode.displayId, spec);
            return {
                slug: spec.slug,
                created: false,
                revisionPublished: true,
                displayId: existingCode.displayId,
                skipped: true,
                reason: "Published updated HTML revision.",
            };
        }
        const sortOrder = this.displays.getNextSortOrder(projectId);
        const display = this.displays.upsert({
            projectId,
            name: spec.name,
            displayKey: spec.slug,
            htmlPath: null,
            enabled: true,
            refreshRateMs: 5000,
            displayWidth: spec.displayWidth,
            displayHeight: spec.displayHeight,
            sortOrder,
            settings: this.buildDisplaySettings(spec),
        });
        const revisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const revisionName = (0, broad_arrow_stream_display_specs_1.buildStreamDisplayRevisionName)(spec.graphicType === "stream-bid" ? "stream-bid-v1" : "stream-ticker-v1");
        const bundle = {
            html: runtimeHtml,
            css: "",
            javascript: "",
            metadata: {
                revisionId,
                revisionName,
                changeNote: "Initial Stream display HTML with NEUD runtime bridge.",
                standaloneDocument: true,
                importKey: spec.importKey,
                seeded: true,
            },
        };
        this.storage.writeDisplayRevision(projectId, display.id, revisionId, bundle);
        this.storage.writeDisplayPublished(projectId, display.id, bundle);
        this.revisions.create({
            id: revisionId,
            projectId,
            resourceType: "display",
            resourceId: display.id,
            revisionName,
            changeNote: bundle.metadata.changeNote,
            sourceHash,
            validationStatus: "valid",
            createdBy: actorUserId,
            message: `Imported ${spec.name} ${revisionName}`,
            metadata: { storageRevisionId: revisionId, importKey: spec.importKey },
        });
        this.displayCode.upsert({
            displayId: display.id,
            projectId,
            slug: spec.slug,
            description: spec.description,
            sourceType: "project-html",
            draftHtml: bundle.html,
            draftCss: bundle.css,
            draftJavascript: bundle.javascript,
            publishedRevisionId: revisionId,
            archived: false,
            archivedAt: null,
            archivedByUserId: null,
            updatedBy: actorUserId,
        });
        return {
            slug: spec.slug,
            created: true,
            revisionPublished: true,
            displayId: display.id,
        };
    }
    buildDisplaySettings(spec) {
        return {
            sourceType: "project-html",
            template: "uploaded-html",
            standaloneDocument: true,
            importKey: spec.importKey,
            graphicType: spec.graphicType,
            description: spec.description,
            htmlSourceVersion: "stream-v1",
        };
    }
    ensureDisplaySettings(displayId, spec) {
        const display = this.displays.getById(displayId);
        if (!display)
            return;
        const settings = display.settings && typeof display.settings === "object" ? display.settings : {};
        const nextSettings = {
            ...settings,
            ...this.buildDisplaySettings(spec),
        };
        if ("rendererKey" in nextSettings) {
            delete nextSettings.rendererKey;
        }
        if ("activeRenderer" in nextSettings) {
            delete nextSettings.activeRenderer;
        }
        this.displays.upsert({
            projectId: display.projectId,
            name: spec.name,
            displayKey: display.displayKey,
            htmlPath: display.htmlPath,
            enabled: display.enabled,
            refreshRateMs: display.refreshRateMs,
            displayWidth: spec.displayWidth,
            displayHeight: spec.displayHeight,
            sortOrder: display.sortOrder ?? undefined,
            settings: nextSettings,
        });
    }
    buildRuntimeHtml(spec) {
        const baseHtml = this.readBundledHtml(spec.bundledRelativePath);
        if (spec.graphicType === "stream-bid") {
            return (0, stream_display_v2_transform_1.transformStreamBidHtmlForServing)(baseHtml);
        }
        return (0, stream_display_v2_transform_1.transformStreamTickerHtmlForServing)(baseHtml);
    }
    readBundledHtml(relativePath) {
        const filename = node_path_1.default.basename(relativePath);
        const candidates = [
            node_path_1.default.join(this.repoRoot, relativePath),
            node_path_1.default.join(this.repoRoot, "desktop", "dist", "displays", "bundled", filename),
            node_path_1.default.join(__dirname, "bundled", filename),
        ];
        for (const candidate of candidates) {
            if (node_fs_1.default.existsSync(candidate)) {
                return node_fs_1.default.readFileSync(candidate, "utf8");
            }
        }
        throw new Error(`Bundled Stream display source not found (${relativePath})`);
    }
}
exports.BroadArrowStreamDisplaysImportService = BroadArrowStreamDisplaysImportService;
