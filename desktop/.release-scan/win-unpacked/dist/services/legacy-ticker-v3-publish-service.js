"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyTickerV3PublishService = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const legacy_display_v2_transform_1 = require("../displays/legacy-display-v2-transform");
const project_scraper_code_repository_1 = require("../repositories/project-scraper-code-repository");
class LegacyTickerV3PublishService {
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
    publishLegacyTickerV3(input) {
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
        if ((0, legacy_display_v2_transform_1.isLegacyTickerV3Html)(published.html)) {
            const revisions = this.revisions.listForResource({
                projectId: project.id,
                resourceType: "display",
                resourceId: code.displayId,
            });
            const versionNumber = Math.max(revisions.findIndex((revision) => revision.id === code.publishedRevisionId) + 1, 1);
            const activeRevision = revisions.find((revision) => revision.id === code.publishedRevisionId);
            return {
                projectId: project.id,
                displayId: code.displayId,
                slug: displaySlug,
                previousRevisionId: code.publishedRevisionId,
                revisionId: code.publishedRevisionId ?? "",
                revisionName: activeRevision?.revisionName ?? "v3",
                versionNumber,
                skipped: true,
                reason: "Display HTML is already on ticker v3 lot-label and sizing fixes.",
            };
        }
        const previousRevisionId = code.publishedRevisionId;
        const v3Html = /function placeNextLots/.test(published.html)
            ? (0, legacy_display_v2_transform_1.transformLegacyTickerHtmlToV3)(published.html)
            : (0, legacy_display_v2_transform_1.transformUploadedDisplayToLatest)(published.html, "ticker");
        const revisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const revisionName = "v3";
        const changeNote = "Ticker v3: preserve legacy Lot label/number rendering and content-box pill sizing for NEUD previews.";
        const message = "Published v3 with legacy ticker lot-label and sizing fixes";
        const actorUserId = input?.actorUserId ?? "system";
        const publishedMetadata = published.metadata && typeof published.metadata === "object"
            ? published.metadata
            : {};
        const bundle = {
            html: v3Html,
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
        this.revisions.create({
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
        const revisions = this.revisions.listForResource({
            projectId: project.id,
            resourceType: "display",
            resourceId: code.displayId,
        });
        const versionNumber = Math.max(revisions.findIndex((revision) => revision.id === revisionId) + 1, 1);
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
exports.LegacyTickerV3PublishService = LegacyTickerV3PublishService;
