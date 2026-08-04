"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadArrowLegacyDisplaysImportService = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const broad_arrow_legacy_display_specs_1 = require("../displays/broad-arrow-legacy-display-specs");
const project_scraper_code_repository_1 = require("../repositories/project-scraper-code-repository");
class BroadArrowLegacyDisplaysImportService {
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
                retiredAuctionPylonRemoved: false,
                createdCount: 0,
            };
        }
        const retiredAuctionPylonRemoved = this.removeRetiredAuctionPylonDisplay(project.id);
        const legacyPylonResult = this.ensureLegacyPylonImported(project.id, actorUserId);
        this.settings.set(broad_arrow_legacy_display_specs_1.BROAD_ARROW_LEGACY_DISPLAYS_IMPORT_KEY, "complete");
        return {
            projectId: project.id,
            imported: [legacyPylonResult],
            retiredAuctionPylonRemoved,
            createdCount: legacyPylonResult.created ? 1 : 0,
        };
    }
    ensureLegacyPylonImported(projectId, actorUserId) {
        const spec = broad_arrow_legacy_display_specs_1.LEGACY_PYLON_SPEC;
        const existingCode = this.displayCode.getBySlug(projectId, spec.slug);
        if (existingCode) {
            this.ensureLegacyPylonRuntimeAdapter(existingCode.displayId);
            this.ensureLegacyPylonSortOrder(projectId, existingCode.displayId);
            return {
                slug: spec.slug,
                created: false,
                displayId: existingCode.displayId,
                skipped: true,
                reason: "Legacy Pylon already imported.",
            };
        }
        const v1Html = this.readBundledV1Html(spec.bundledV1RelativePath);
        const sortOrder = this.resolveSortOrderAfterLegacyTicker(projectId);
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
            settings: {
                sourceType: "project-html",
                template: "uploaded-html",
                standaloneDocument: true,
                importKey: spec.importKey,
                uploadedFilename: spec.uploadedFilename,
                graphicType: "pylon",
                description: spec.description,
                runtimeAdapterKey: spec.runtimeAdapterKey,
            },
        });
        const v1RevisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const v1Bundle = {
            html: v1Html,
            css: "",
            javascript: "",
            metadata: {
                revisionId: v1RevisionId,
                revisionName: "v1",
                changeNote: "Initial uploaded HTML",
                standaloneDocument: true,
                importKey: spec.importKey,
                uploadedFilename: spec.uploadedFilename,
                seeded: true,
            },
        };
        this.storage.writeDisplayRevision(projectId, display.id, v1RevisionId, v1Bundle);
        this.storage.writeDisplayPublished(projectId, display.id, v1Bundle);
        this.revisions.create({
            id: v1RevisionId,
            projectId,
            resourceType: "display",
            resourceId: display.id,
            revisionName: "v1",
            changeNote: "Initial uploaded HTML",
            sourceHash: (0, project_scraper_code_repository_1.hashSource)(`${v1Bundle.html}\n${v1Bundle.css}\n${v1Bundle.javascript}`),
            validationStatus: "valid",
            createdBy: actorUserId,
            message: `Imported ${spec.name} v1 from uploaded HTML`,
            metadata: { storageRevisionId: v1RevisionId, importKey: spec.importKey },
        });
        this.displayCode.upsert({
            displayId: display.id,
            projectId,
            slug: spec.slug,
            description: spec.description,
            sourceType: "project-html",
            draftHtml: v1Bundle.html,
            draftCss: v1Bundle.css,
            draftJavascript: v1Bundle.javascript,
            publishedRevisionId: v1RevisionId,
            archived: false,
            archivedAt: null,
            archivedByUserId: null,
            updatedBy: actorUserId,
        });
        return {
            slug: spec.slug,
            created: true,
            displayId: display.id,
        };
    }
    ensureLegacyPylonRuntimeAdapter(displayId) {
        const display = this.displays.getById(displayId);
        if (!display)
            return;
        const settings = display.settings && typeof display.settings === "object" ? display.settings : {};
        const nextSettings = { ...settings };
        let changed = false;
        if (nextSettings.runtimeAdapterKey !== broad_arrow_legacy_display_specs_1.LEGACY_PYLON_SPEC.runtimeAdapterKey) {
            nextSettings.runtimeAdapterKey = broad_arrow_legacy_display_specs_1.LEGACY_PYLON_SPEC.runtimeAdapterKey;
            changed = true;
        }
        if ("rendererKey" in nextSettings) {
            delete nextSettings.rendererKey;
            changed = true;
        }
        if ("activeRenderer" in nextSettings) {
            delete nextSettings.activeRenderer;
            changed = true;
        }
        if (nextSettings.importKey !== broad_arrow_legacy_display_specs_1.LEGACY_PYLON_SPEC.importKey) {
            nextSettings.importKey = broad_arrow_legacy_display_specs_1.LEGACY_PYLON_SPEC.importKey;
            changed = true;
        }
        if (!changed)
            return;
        this.displays.upsert({
            projectId: display.projectId,
            name: display.name,
            displayKey: display.displayKey,
            htmlPath: display.htmlPath,
            enabled: display.enabled,
            refreshRateMs: display.refreshRateMs,
            displayWidth: display.displayWidth,
            displayHeight: display.displayHeight,
            sortOrder: display.sortOrder ?? undefined,
            settings: nextSettings,
        });
    }
    resolveSortOrderAfterLegacyTicker(projectId) {
        const displays = this.displays.listByProject(projectId);
        const legacyTicker = displays.find((display) => display.displayKey === "legacy-ticker");
        if (legacyTicker?.sortOrder != null) {
            return legacyTicker.sortOrder + 1;
        }
        return this.displays.getNextSortOrder(projectId);
    }
    ensureLegacyPylonSortOrder(projectId, displayId) {
        const display = this.displays.getById(displayId);
        if (!display)
            return;
        const legacyTicker = this.displays
            .listByProject(projectId)
            .find((entry) => entry.displayKey === "legacy-ticker");
        if (legacyTicker?.sortOrder == null) {
            return;
        }
        const desiredOrder = legacyTicker.sortOrder + 1;
        if (display.sortOrder === desiredOrder) {
            return;
        }
        this.displays.upsert({
            projectId: display.projectId,
            name: display.name,
            displayKey: display.displayKey,
            htmlPath: display.htmlPath,
            enabled: display.enabled,
            refreshRateMs: display.refreshRateMs,
            displayWidth: display.displayWidth,
            displayHeight: display.displayHeight,
            sortOrder: desiredOrder,
            settings: display.settings,
        });
    }
    removeRetiredAuctionPylonDisplay(projectId) {
        const code = this.displayCode.getBySlug(projectId, broad_arrow_legacy_display_specs_1.RETIRED_AUCTION_PYLON_SLUG);
        if (!code) {
            return false;
        }
        const display = this.displays.getById(code.displayId);
        const settings = display?.settings && typeof display.settings === "object" ? display.settings : {};
        const importKey = typeof settings.importKey === "string" ? settings.importKey : null;
        const rendererKey = typeof settings.rendererKey === "string" ? settings.rendererKey : null;
        const matchesRetiredIdentity = importKey === broad_arrow_legacy_display_specs_1.RETIRED_AUCTION_PYLON_IMPORT_KEY ||
            rendererKey === broad_arrow_legacy_display_specs_1.RETIRED_AUCTION_PYLON_RENDERER_KEY ||
            code.slug === broad_arrow_legacy_display_specs_1.RETIRED_AUCTION_PYLON_SLUG;
        if (!matchesRetiredIdentity) {
            return false;
        }
        this.revisions.deleteByResource({
            projectId,
            resourceType: "display",
            resourceId: code.displayId,
        });
        this.storage.deleteDisplayTree(projectId, code.displayId);
        this.displayCode.deleteByDisplayId(code.displayId);
        this.displays.deleteById(code.displayId);
        return true;
    }
    readBundledV1Html(relativePath) {
        const filename = node_path_1.default.basename(relativePath);
        const candidates = [
            node_path_1.default.join(this.repoRoot, relativePath),
            node_path_1.default.join(this.repoRoot, "displays", "bundled", filename),
            node_path_1.default.join(this.repoRoot, "desktop", "dist", "displays", "bundled", filename),
            node_path_1.default.join(__dirname, "bundled", filename),
        ];
        for (const candidate of candidates) {
            if (node_fs_1.default.existsSync(candidate)) {
                return node_fs_1.default.readFileSync(candidate, "utf8");
            }
        }
        throw new Error(`Bundled display source not found (${relativePath})`);
    }
}
exports.BroadArrowLegacyDisplaysImportService = BroadArrowLegacyDisplaysImportService;
