"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyDisplayV2PublishService = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const legacy_display_v2_transform_1 = require("../displays/legacy-display-v2-transform");
const project_scraper_code_repository_1 = require("../repositories/project-scraper-code-repository");
class LegacyDisplayV2PublishService {
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
    publishLegacyTickerV2(input) {
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
        if ((0, legacy_display_v2_transform_1.isLegacyPylonV2Html)(published.html)) {
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
                revisionName: activeRevision?.revisionName ?? "v2",
                versionNumber,
                transformedFromV1: false,
                skipped: true,
                reason: "Display HTML is already on the v2 NEUD runtime bridge.",
            };
        }
        if (!(0, legacy_display_v2_transform_1.isLegacyPylonSelfPollingHtml)(published.html)) {
            throw new Error(`Display ${displaySlug} is not a legacy self-polling pylon HTML graphic and cannot be auto-transformed.`);
        }
        const v1RevisionId = code.publishedRevisionId;
        const v2Html = (0, legacy_display_v2_transform_1.transformLegacyPylonHtmlV1ToV2)(published.html);
        const revisionId = (0, project_scraper_code_repository_1.createRevisionId)();
        const revisionName = "v2";
        const changeNote = "NEUD canonical runtime bridge: listens for NEUD_DATA_UPDATE and maps current.* to auctionDisplay fields.";
        const message = "Published v2 with canonical NEUD display runtime bridge";
        const actorUserId = input?.actorUserId ?? "system";
        const publishedMetadata = published.metadata && typeof published.metadata === "object"
            ? published.metadata
            : {};
        const bundle = {
            html: v2Html,
            css: published.css ?? "",
            javascript: published.javascript ?? "",
            metadata: {
                revisionId,
                revisionName,
                changeNote,
                publishedBy: actorUserId,
                message,
                standaloneDocument: publishedMetadata.standaloneDocument === true,
                derivedFromRevisionId: v1RevisionId,
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
            previousRevisionId: v1RevisionId,
            revisionId,
            revisionName,
            versionNumber,
            transformedFromV1: true,
            skipped: false,
        };
    }
}
exports.LegacyDisplayV2PublishService = LegacyDisplayV2PublishService;
