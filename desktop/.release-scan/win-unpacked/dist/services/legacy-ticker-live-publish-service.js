"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyTickerLivePublishService = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const legacy_display_v2_transform_1 = require("../displays/legacy-display-v2-transform");
const legacy_ticker_live_revision_1 = require("../displays/legacy-ticker-live-revision");
const project_scraper_code_repository_1 = require("../repositories/project-scraper-code-repository");
class LegacyTickerLivePublishService {
    projects;
    displayCode;
    revisions;
    storage;
    constructor(projects, displayCode, revisions, storage) {
        this.projects = projects;
        this.displayCode = displayCode;
        this.revisions = revisions;
        this.storage = storage;
    }
    publishLegacyTickerLive(input) {
        const projectSlug = input?.projectSlug ?? broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug;
        const displaySlug = input?.displaySlug ?? "legacy-ticker";
        const project = this.projects.getBySlug(projectSlug);
        if (!project || !(0, broad_arrow_phase_1.isBroadArrowCanonicalProject)(project)) {
            throw new Error(`Project ${projectSlug} was not found.`);
        }
        const code = this.displayCode.getBySlug(project.id, displaySlug);
        if (!code) {
            throw new Error(`Display ${displaySlug} was not found in ${projectSlug}.`);
        }
        const published = this.storage.readDisplayPublished(project.id, code.displayId);
        if (!published) {
            throw new Error(`Display ${displaySlug} has no published HTML revision.`);
        }
        if ((0, legacy_display_v2_transform_1.isLegacyTickerLiveHtml)(published.html) &&
            /__NEUD_TICKER_REVISION__/.test(published.html)) {
            const revisions = this.revisions.listForResource({
                projectId: project.id,
                resourceType: "display",
                resourceId: code.displayId,
            });
            const activeRevision = revisions.find((revision) => revision.id === code.publishedRevisionId);
            const versionNumber = activeRevision?.versionNumber ?? 1;
            return {
                projectId: project.id,
                displayId: code.displayId,
                slug: displaySlug,
                previousRevisionId: code.publishedRevisionId,
                revisionId: code.publishedRevisionId ?? "",
                revisionName: activeRevision?.revisionName ?? legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_REVISION_NAME,
                versionNumber,
                skipped: true,
                reason: "Display HTML is already on the legacy-live ticker bridge.",
            };
        }
        const previousRevisionId = code.publishedRevisionId;
        const liveHtml = (0, legacy_display_v2_transform_1.transformLegacyTickerToLiveBridge)(published.html);
        const revisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const revisionName = legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_REVISION_NAME;
        const changeNote = legacy_ticker_live_revision_1.LEGACY_TICKER_LIVE_CHANGE_NOTE;
        const message = "Published legacy-live ticker with unchanged HTML/CSS and NEUD runtime bridge";
        const actorUserId = input?.actorUserId ?? "system";
        const publishedMetadata = published.metadata && typeof published.metadata === "object"
            ? published.metadata
            : {};
        const bundle = {
            html: liveHtml,
            css: published.css ?? "",
            javascript: published.javascript ?? "",
            metadata: {
                revisionId,
                revisionName,
                changeNote,
                publishedBy: actorUserId,
                message,
                standaloneDocument: publishedMetadata.standaloneDocument === true,
                derivedFromRevisionId: previousRevisionId,
            },
        };
        this.storage.writeDisplayRevision(project.id, code.displayId, revisionId, bundle);
        this.storage.writeDisplayPublished(project.id, code.displayId, bundle);
        const createdRevision = this.revisions.create({
            id: revisionId,
            projectId: project.id,
            resourceType: "display",
            resourceId: code.displayId,
            revisionName,
            changeNote,
            sourceHash: (0, project_scraper_code_repository_1.hashSource)(`${bundle.html}\n${bundle.css}\n${bundle.javascript}`),
            validationStatus: "valid",
            createdBy: actorUserId,
            message,
        });
        this.displayCode.upsert({
            displayId: code.displayId,
            projectId: project.id,
            slug: code.slug,
            publishedRevisionId: revisionId,
            archived: code.archived,
            archivedAt: code.archivedAt,
            archivedByUserId: code.archivedByUserId,
            updatedBy: actorUserId,
        });
        const versionNumber = createdRevision.versionNumber ?? 1;
        return {
            projectId: project.id,
            displayId: code.displayId,
            slug: displaySlug,
            previousRevisionId,
            revisionId,
            revisionName,
            versionNumber,
            skipped: false,
        };
    }
}
exports.LegacyTickerLivePublishService = LegacyTickerLivePublishService;
