"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadArrowUploadedDisplaysImportService = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const broad_arrow_uploaded_display_specs_1 = require("../displays/broad-arrow-uploaded-display-specs");
const legacy_display_v2_transform_1 = require("../displays/legacy-display-v2-transform");
const legacy_ticker_live_revision_1 = require("../displays/legacy-ticker-live-revision");
const project_scraper_code_repository_1 = require("../repositories/project-scraper-code-repository");
class BroadArrowUploadedDisplaysImportService {
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
                skippedCount: broad_arrow_uploaded_display_specs_1.BROAD_ARROW_UPLOADED_DISPLAY_SPECS.length,
                createdCount: 0,
            };
        }
        const results = broad_arrow_uploaded_display_specs_1.BROAD_ARROW_UPLOADED_DISPLAY_SPECS.map((spec) => this.ensureDisplayImported(project.id, spec, actorUserId));
        this.removeRetiredAuctionTickerOverlay(project.id);
        this.ensureRendererKeys(project.id);
        this.settings.set(broad_arrow_uploaded_display_specs_1.BROAD_ARROW_UPLOADED_DISPLAYS_IMPORT_KEY, "complete");
        return {
            projectId: project.id,
            imported: results,
            skippedCount: results.filter((result) => result.skipped || !result.created).length,
            createdCount: results.filter((result) => result.created).length,
        };
    }
    ensureDisplayImported(projectId, spec, actorUserId) {
        const existingCode = this.displayCode.getBySlug(projectId, spec.slug);
        if (existingCode) {
            const existingDisplay = this.displays.getById(existingCode.displayId);
            const settings = existingDisplay?.settings && typeof existingDisplay.settings === "object"
                ? existingDisplay.settings
                : {};
            const importKey = typeof settings.importKey === "string" ? settings.importKey : null;
            if (importKey && importKey !== spec.importKey) {
                return {
                    slug: spec.slug,
                    created: false,
                    v2Published: false,
                    displayId: existingCode.displayId,
                    skipped: true,
                    reason: "Display slug exists with a different import identity.",
                };
            }
            const v2Result = this.ensureV2Published(projectId, existingCode.displayId, spec, actorUserId);
            const legacyLiveResult = spec.graphicType === "ticker"
                ? this.ensureLegacyLivePublished(projectId, existingCode.displayId, spec, actorUserId)
                : { published: false, reason: "Not a ticker display." };
            this.ensureRendererKeyForDisplay(existingCode.displayId, spec);
            return {
                slug: spec.slug,
                created: false,
                v2Published: v2Result.published || legacyLiveResult.published,
                displayId: existingCode.displayId,
                skipped: true,
                reason: legacyLiveResult.published ? legacyLiveResult.reason : v2Result.reason,
            };
        }
        const v1Html = this.readBundledV1Html(spec);
        const display = this.displays.upsert({
            projectId,
            name: spec.name,
            displayKey: spec.slug,
            htmlPath: null,
            enabled: true,
            refreshRateMs: 5000,
            displayWidth: spec.displayWidth,
            displayHeight: spec.displayHeight,
            settings: {
                sourceType: "project-html",
                template: "uploaded-html",
                standaloneDocument: true,
                importKey: spec.importKey,
                uploadedFilename: spec.uploadedFilename,
                graphicType: spec.graphicType,
                description: spec.description,
                rendererKey: (0, broad_arrow_uploaded_display_specs_1.rendererKeyForGraphicType)(spec.graphicType),
                activeRenderer: "typescript",
                htmlSourceVersion: "v1",
                rendererNotes: "Active output uses the TypeScript renderer derived from the uploaded HTML source. Original HTML versions remain archived in version history.",
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
                standaloneDocument: true,
                importKey: spec.importKey,
                uploadedFilename: spec.uploadedFilename,
                seeded: true,
            },
        };
        this.storage.writeDisplayRevision(projectId, display.id, v1RevisionId, v1Bundle);
        this.revisions.create({
            id: v1RevisionId,
            projectId,
            resourceType: "display",
            resourceId: display.id,
            revisionName: "v1",
            changeNote: `Imported original upload (${spec.uploadedFilename}).`,
            sourceHash: (0, project_scraper_code_repository_1.hashSource)(`${v1Bundle.html}\n${v1Bundle.css}\n${v1Bundle.javascript}`),
            validationStatus: "valid",
            createdBy: actorUserId,
            message: `Imported ${spec.name} v1 from uploaded HTML`,
            metadata: { storageRevisionId: v1RevisionId, importKey: spec.importKey },
        });
        const v2Html = (0, legacy_display_v2_transform_1.transformUploadedDisplayV1ToV2)(v1Html, spec.graphicType);
        const v2RevisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const v2ChangeNote = spec.graphicType === "ticker"
            ? "Legacy ticker live bridge: preserve original HTML/CSS/DOM and subscribe to NEUD runtime data."
            : "NEUD canonical runtime bridge: listens for NEUD_DATA_UPDATE, maps current.* to auctionDisplay fields, and uses shared logo asset path.";
        const v2Bundle = {
            html: v2Html,
            css: "",
            javascript: "",
            metadata: {
                revisionId: v2RevisionId,
                revisionName: "v2",
                changeNote: v2ChangeNote,
                standaloneDocument: true,
                derivedFromRevisionId: v1RevisionId,
                importKey: spec.importKey,
            },
        };
        this.storage.writeDisplayRevision(projectId, display.id, v2RevisionId, v2Bundle);
        this.storage.writeDisplayPublished(projectId, display.id, v2Bundle);
        this.revisions.create({
            id: v2RevisionId,
            projectId,
            resourceType: "display",
            resourceId: display.id,
            revisionName: "v2",
            changeNote: v2ChangeNote,
            sourceHash: (0, project_scraper_code_repository_1.hashSource)(`${v2Bundle.html}\n${v2Bundle.css}\n${v2Bundle.javascript}`),
            validationStatus: "valid",
            createdBy: actorUserId,
            message: `Published ${spec.name} v2 with NEUD runtime bridge`,
            metadata: {
                storageRevisionId: v2RevisionId,
                derivedFromRevisionId: v1RevisionId,
                importKey: spec.importKey,
            },
        });
        this.displayCode.upsert({
            displayId: display.id,
            projectId,
            slug: spec.slug,
            description: spec.description,
            sourceType: "project-html",
            draftHtml: v2Bundle.html,
            draftCss: v2Bundle.css,
            draftJavascript: v2Bundle.javascript,
            publishedRevisionId: v2RevisionId,
            archived: false,
            archivedAt: null,
            archivedByUserId: null,
            updatedBy: actorUserId,
        });
        if (spec.graphicType === "ticker") {
            this.ensureLegacyLivePublished(projectId, display.id, spec, actorUserId);
        }
        return {
            slug: spec.slug,
            created: true,
            v2Published: true,
            displayId: display.id,
        };
    }
    ensureLegacyLivePublished(projectId, displayId, spec, actorUserId) {
        if (spec.graphicType !== "ticker") {
            return { published: false, reason: "Not a ticker display." };
        }
        const code = this.displayCode.getByDisplayId(displayId);
        if (!code) {
            return { published: false, reason: "Display code row missing." };
        }
        const published = this.storage.readDisplayPublished(projectId, displayId);
        if (!published) {
            return { published: false, reason: "Published HTML missing." };
        }
        if ((0, legacy_display_v2_transform_1.isLegacyTickerLiveHtml)(published.html)) {
            return { published: false, reason: "Display already on legacy-live ticker bridge." };
        }
        const sourceRevisionId = code.publishedRevisionId;
        const sourceHtml = (0, legacy_display_v2_transform_1.transformLegacyTickerToLiveBridge)(published.html);
        const liveRevisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const liveBundle = {
            html: sourceHtml,
            css: published.css ?? "",
            javascript: published.javascript ?? "",
            metadata: {
                revisionId: liveRevisionId,
                revisionName: legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_REVISION_NAME,
                changeNote: legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_CHANGE_NOTE,
                standaloneDocument: true,
                derivedFromRevisionId: sourceRevisionId,
                importKey: spec.importKey,
            },
        };
        this.storage.writeDisplayRevision(projectId, displayId, liveRevisionId, liveBundle);
        this.storage.writeDisplayPublished(projectId, displayId, liveBundle);
        this.revisions.create({
            id: liveRevisionId,
            projectId,
            resourceType: "display",
            resourceId: displayId,
            revisionName: legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_REVISION_NAME,
            changeNote: legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_CHANGE_NOTE,
            sourceHash: (0, project_scraper_code_repository_1.hashSource)(`${liveBundle.html}\n${liveBundle.css}\n${liveBundle.javascript}`),
            validationStatus: "valid",
            createdBy: actorUserId,
            message: `Published ${spec.name} legacy-live with unchanged HTML/CSS and NEUD runtime bridge`,
            metadata: {
                storageRevisionId: liveRevisionId,
                derivedFromRevisionId: sourceRevisionId,
                importKey: spec.importKey,
            },
        });
        this.displayCode.upsert({
            displayId: code.displayId,
            projectId,
            slug: code.slug,
            description: code.description,
            sourceType: code.sourceType,
            draftHtml: liveBundle.html,
            draftCss: liveBundle.css,
            draftJavascript: liveBundle.javascript,
            publishedRevisionId: liveRevisionId,
            archived: code.archived,
            archivedAt: code.archivedAt,
            archivedByUserId: code.archivedByUserId,
            updatedBy: actorUserId,
        });
        return { published: true };
    }
    ensureV2Published(projectId, displayId, spec, actorUserId) {
        const code = this.displayCode.getByDisplayId(displayId);
        if (!code) {
            return { published: false, reason: "Display code row missing." };
        }
        const published = this.storage.readDisplayPublished(projectId, displayId);
        if (!published) {
            return { published: false, reason: "Published HTML missing." };
        }
        const alreadyV2 = spec.graphicType === "ticker"
            ? (0, legacy_display_v2_transform_1.isLegacyTickerLiveHtml)(published.html)
            : (0, legacy_display_v2_transform_1.isLegacyPylonV2Html)(published.html);
        if (alreadyV2) {
            return {
                published: false,
                reason: spec.graphicType === "ticker"
                    ? "Display already on legacy-live ticker bridge."
                    : "Display already on v2 NEUD runtime bridge.",
            };
        }
        const v1Revision = this.revisions
            .listForResource({
            projectId,
            resourceType: "display",
            resourceId: displayId,
        })
            .find((revision) => revision.revisionName === "v1");
        const v1Bundle = (v1Revision
            ? this.storage.readDisplayRevision(projectId, displayId, v1Revision.id)
            : null) ?? published;
        const v1Html = v1Bundle.html;
        const v2Html = (0, legacy_display_v2_transform_1.transformUploadedDisplayV1ToV2)(v1Html, spec.graphicType);
        const v2RevisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const v2ChangeNote = spec.graphicType === "ticker"
            ? "Legacy ticker live bridge: preserve original HTML/CSS/DOM and subscribe to NEUD runtime data."
            : "NEUD canonical runtime bridge: listens for NEUD_DATA_UPDATE, maps current.* to auctionDisplay fields, and uses shared logo asset path.";
        const v2Bundle = {
            html: v2Html,
            css: "",
            javascript: "",
            metadata: {
                revisionId: v2RevisionId,
                revisionName: "v2",
                changeNote: v2ChangeNote,
                standaloneDocument: true,
                derivedFromRevisionId: v1Revision?.id ?? code.publishedRevisionId,
                importKey: spec.importKey,
            },
        };
        this.storage.writeDisplayRevision(projectId, displayId, v2RevisionId, v2Bundle);
        this.storage.writeDisplayPublished(projectId, displayId, v2Bundle);
        this.revisions.create({
            id: v2RevisionId,
            projectId,
            resourceType: "display",
            resourceId: displayId,
            revisionName: "v2",
            changeNote: v2ChangeNote,
            sourceHash: (0, project_scraper_code_repository_1.hashSource)(`${v2Bundle.html}\n${v2Bundle.css}\n${v2Bundle.javascript}`),
            validationStatus: "valid",
            createdBy: actorUserId,
            message: `Published ${spec.name} v2 with NEUD runtime bridge`,
            metadata: {
                storageRevisionId: v2RevisionId,
                derivedFromRevisionId: v1Revision?.id ?? code.publishedRevisionId,
                importKey: spec.importKey,
            },
        });
        this.displayCode.upsert({
            displayId: code.displayId,
            projectId,
            slug: code.slug,
            description: code.description,
            sourceType: code.sourceType,
            draftHtml: v2Bundle.html,
            draftCss: v2Bundle.css,
            draftJavascript: v2Bundle.javascript,
            publishedRevisionId: v2RevisionId,
            archived: code.archived,
            archivedAt: code.archivedAt,
            archivedByUserId: code.archivedByUserId,
            updatedBy: actorUserId,
        });
        return { published: true };
    }
    ensureRendererKeys(projectId) {
        for (const spec of broad_arrow_uploaded_display_specs_1.BROAD_ARROW_UPLOADED_DISPLAY_SPECS) {
            const code = this.displayCode.getBySlug(projectId, spec.slug);
            if (!code)
                continue;
            this.ensureRendererKeyForDisplay(code.displayId, spec);
        }
    }
    ensureRendererKeyForDisplay(displayId, spec) {
        const display = this.displays.getById(displayId);
        if (!display)
            return;
        const settings = display.settings && typeof display.settings === "object" ? display.settings : {};
        const rendererKey = (0, broad_arrow_uploaded_display_specs_1.rendererKeyForGraphicType)(spec.graphicType);
        if (settings.rendererKey === rendererKey &&
            settings.activeRenderer === "typescript") {
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
            settings: {
                ...settings,
                rendererKey,
                activeRenderer: "typescript",
                htmlSourceVersion: typeof settings.htmlSourceVersion === "string" ? settings.htmlSourceVersion : "v1",
                rendererNotes: "Active output uses the TypeScript renderer derived from the uploaded HTML source. Original HTML versions remain archived in version history.",
            },
        });
    }
    removeRetiredAuctionTickerOverlay(projectId) {
        const retiredSlug = "auction-ticker-overlay";
        const code = this.displayCode.getBySlug(projectId, retiredSlug);
        if (!code) {
            return;
        }
        const display = this.displays.getById(code.displayId);
        const settings = display?.settings && typeof display.settings === "object" ? display.settings : {};
        const importKey = typeof settings.importKey === "string" ? settings.importKey : null;
        if (importKey !== "broad-arrow:auction-ticker-overlay:v1") {
            return;
        }
        this.revisions.deleteByResource({
            projectId,
            resourceType: "display",
            resourceId: code.displayId,
        });
        this.storage.deleteDisplayTree(projectId, code.displayId);
        this.displayCode.deleteByDisplayId(code.displayId);
        this.displays.deleteById(code.displayId);
    }
    readBundledV1Html(spec) {
        const filename = node_path_1.default.basename(spec.bundledV1RelativePath);
        const candidates = [
            node_path_1.default.join(this.repoRoot, spec.bundledV1RelativePath),
            node_path_1.default.join(this.repoRoot, "displays", "bundled", filename),
            node_path_1.default.join(this.repoRoot, "desktop", "dist", "displays", "bundled", filename),
            node_path_1.default.join(__dirname, "bundled", filename),
        ];
        for (const candidate of candidates) {
            if (node_fs_1.default.existsSync(candidate)) {
                return node_fs_1.default.readFileSync(candidate, "utf8");
            }
        }
        throw new Error(`Bundled display source not found for ${spec.slug} (${spec.bundledV1RelativePath})`);
    }
}
exports.BroadArrowUploadedDisplaysImportService = BroadArrowUploadedDisplaysImportService;
