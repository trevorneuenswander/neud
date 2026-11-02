import fs from "fs";
import path from "path";
import { hashRuntimeDisplayBundle } from "../../displays/display-source-content-hash";
import { buildStreamDisplayRevisionName } from "../../displays/broad-arrow-stream-display-specs";
import type { DisplaysRepository } from "../../repositories/displays-repository";
import type { ProjectCodeRevisionsRepository } from "../../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../../repositories/project-display-code-repository";
import type { ProjectPackagesRepository } from "../../repositories/project-packages-repository";
import { createRevisionId } from "../../repositories/project-scraper-code-repository";
import type { ProjectCodeStorageService } from "../../services/project-code-storage-service";
import type { ProjectPackageDisplayDefinition, ProjectPackageManifest } from "../types";
import {
  createDefaultSemaScheduleTickerEditableSchema,
  EDITABLE_GRAPHIC_SCHEMA_VERSION,
  SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE,
} from "./editable-graphic-schema";

/** @deprecated Prefer per-display identity from the package definition. Kept for ticker compat. */
export const SEMA_DISPLAY_IMPORT_KEY = "sema-schedule-ticker-v1";

/**
 * Prior packaged SEMA Schedule Ticker HTML hashes that may be auto-upgraded
 * to the current package HTML. Custom / edited ticker displays (any other hash)
 * are left alone — matching Mic Tally safe-upgrade behavior.
 *
 * v0.3.2 / SEMA baseline v10 ticker (shrink-to-fit then continuous marquee):
 * 9a86a7fb874f4aaae16a4520c754856ec72c556b42742a32948b9168a474449e
 *
 * v0.3.3-dev intermediate (fixed 57/52 + BA marquee, but fitField always
 * stopMarquee — highlight remasure still restarted unrelated fields):
 * bede95a1314ba30531340e5757aa2d35da9220adb3a80ed10d171ff6c536edd6
 *
 * Without listing that intermediate hash, stock SEMA installs that already
 * auto-upgraded once during v0.3.3 development stay stuck on the buggy
 * revision while BrowserWindow tests (which load bundled HTML directly) pass.
 */
export const SEMA_SCHEDULE_TICKER_PREVIOUS_PACKAGED_SOURCE_HASHES: ReadonlySet<string> = new Set([
  // v0.3.2 SEMA v10 ticker — shrink-to-fit + continuous RAF marquee
  "9a86a7fb874f4aaae16a4520c754856ec72c556b42742a32948b9168a474449e",
  // v0.3.3-dev intermediate — fixed fonts + marquee, missing fitField no-op
  "bede95a1314ba30531340e5757aa2d35da9220adb3a80ed10d171ff6c536edd6",
]);

/**
 * Prior packaged SEMA Fullscreen Schedule UHD HTML hashes eligible for auto-upgrade.
 * Custom / edited fullscreen displays (any other hash) are left alone.
 *
 * v0.3.2 / SEMA baseline v10 fullscreen (shrink-to-fit then continuous marquee):
 * b5ad9fad25d4acaa5c927d221f3f0e0ed3cf14e0321e6d0c219fa3af0edbfb6d
 *
 * v0.3.3-dev highlight-stable fullscreen at 40px/s (before 50px/s speed bump):
 * 48da36be144a047bf3786e0766d297a69a67923a485770c2a54a5a09c07a8891
 */
export const SEMA_SCHEDULE_FULLSCREEN_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES: ReadonlySet<string> =
  new Set([
    // v0.3.2 SEMA v10 fullscreen UHD — shrink-to-fit + continuous RAF marquee
    "b5ad9fad25d4acaa5c927d221f3f0e0ed3cf14e0321e6d0c219fa3af0edbfb6d",
    // v0.3.3-dev highlight-stable fullscreen @ 40px/s
    "48da36be144a047bf3786e0766d297a69a67923a485770c2a54a5a09c07a8891",
  ]);

export type SemaDisplayHydrationResult = {
  slug: string;
  created: boolean;
  revisionPublished: boolean;
  displayId: string | null;
  reason?: string;
};

function resolveDisplayIdentity(definition: ProjectPackageDisplayDefinition): {
  importKey: string;
  graphicType: string;
  runtimeAdapterKey: string;
  description: string;
  editorSchemaVersion?: number;
  editableGraphicSchema?: ReturnType<typeof createDefaultSemaScheduleTickerEditableSchema>;
} {
  const runtimeAdapterKey =
    definition.runtimeAdapterKey ??
    (definition.slug === "schedule-pylon"
      ? "sema-schedule-pylon"
      : definition.slug === "schedule-ticker-editable"
        ? "sema-schedule-ticker-editable"
        : "sema-schedule-ticker");
  const importKey = `${runtimeAdapterKey}-v1`;
  const isEditable = definition.slug === "schedule-ticker-editable";
  const graphicType = isEditable
    ? SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE
    : runtimeAdapterKey;
  const description = isEditable
    ? `SEMA ${definition.name} (graphic editor prototype)`
    : `SEMA ${definition.name} (NOW / NEXT / LATER)`;
  return {
    importKey,
    graphicType,
    runtimeAdapterKey,
    description,
    ...(isEditable
      ? {
          editorSchemaVersion: EDITABLE_GRAPHIC_SCHEMA_VERSION,
          editableGraphicSchema: createDefaultSemaScheduleTickerEditableSchema(),
        }
      : {}),
  };
}

/**
 * Registers the packaged SEMA display(s) as project display rows so they are served through the
 * normal NEUD display path (`/api/display/:projectId/:slug`) and receive schedule updates over
 * the existing display-bridge SSE channel. Idempotent: unchanged HTML never creates a revision.
 */
export class SemaPackageDisplayHydration {
  constructor(
    private readonly packages: ProjectPackagesRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
  ) {}

  ensureHydrated(
    projectId: string,
    manifest: ProjectPackageManifest,
    actorUserId = "system",
  ): SemaDisplayHydrationResult[] {
    if (manifest.projectSlug !== "sema") {
      return [];
    }
    let install = this.packages.getInstallByProjectId(projectId);
    if (!install?.packageRoot && manifest.projectSlug) {
      install = this.packages.getInstallBySlug(manifest.projectSlug);
    }
    if (!install?.packageRoot) {
      return [];
    }

    return manifest.displays.map((definition) => {
      const identity = resolveDisplayIdentity(definition);
      const htmlFile = path.join(install.packageRoot, definition.htmlPath);
      if (!fs.existsSync(htmlFile)) {
        return {
          slug: definition.slug,
          created: false,
          revisionPublished: false,
          displayId: null,
          reason: `Package display file missing: ${definition.htmlPath}`,
        };
      }
      const html = fs.readFileSync(htmlFile, "utf8");
      const bundle = {
        html,
        css: "",
        javascript: "",
      };
      const sourceHash = hashRuntimeDisplayBundle(bundle);
      const settings = {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey: identity.importKey,
        graphicType: identity.graphicType,
        runtimeAdapterKey: identity.runtimeAdapterKey,
        description: identity.description,
        ...(identity.editorSchemaVersion != null
          ? { editorSchemaVersion: identity.editorSchemaVersion }
          : {}),
        ...(identity.editableGraphicSchema
          ? { editableGraphicSchema: identity.editableGraphicSchema }
          : {}),
      };

      const existing = this.displayCode.getBySlug(projectId, definition.slug);
      if (existing) {
        const published = this.storage.readDisplayPublished(projectId, existing.displayId);
        const publishedHash = published
          ? hashRuntimeDisplayBundle({
              html: published.html,
              css: published.css ?? "",
              javascript: published.javascript ?? "",
            })
          : null;
        // Preserve any operator-saved editable schema on reconcile/update.
        const existingDisplay = this.displays.getById(existing.displayId);
        const existingSettings =
          existingDisplay?.settings && typeof existingDisplay.settings === "object"
            ? existingDisplay.settings
            : {};
        const mergedSettings = {
          ...settings,
          ...(typeof existingSettings.editableGraphicSchema === "object" &&
          existingSettings.editableGraphicSchema
            ? { editableGraphicSchema: existingSettings.editableGraphicSchema }
            : {}),
        };
        this.displays.upsert({
          projectId,
          name: definition.name,
          displayKey: definition.slug,
          htmlPath: null,
          enabled: existingDisplay?.enabled ?? true,
          refreshRateMs: existingDisplay?.refreshRateMs ?? 5000,
          displayWidth: definition.width,
          displayHeight: definition.height,
          settings: mergedSettings,
        });
        if (publishedHash === sourceHash) {
          return {
            slug: definition.slug,
            created: false,
            revisionPublished: false,
            displayId: existing.displayId,
            reason: "Display already published with the packaged HTML.",
          };
        }
        // Schedule Ticker / Fullscreen UHD: only auto-upgrade known prior packaged HTML.
        // Operator-customized HTML is preserved.
        if (definition.slug === "schedule-ticker" || definition.slug === "schedule-fullscreen-uhd") {
          const priorHashes =
            definition.slug === "schedule-ticker"
              ? SEMA_SCHEDULE_TICKER_PREVIOUS_PACKAGED_SOURCE_HASHES
              : SEMA_SCHEDULE_FULLSCREEN_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES;
          const label =
            definition.slug === "schedule-ticker"
              ? "SEMA Schedule Ticker"
              : "SEMA Fullscreen Schedule UHD";
          if (publishedHash && priorHashes.has(publishedHash)) {
            this.publishRevision(projectId, existing.displayId, definition.slug, bundle, {
              sourceHash,
              actorUserId,
              changeNote: `Updated ${label} from project package (bundled revision).`,
              identity,
            });
            return {
              slug: definition.slug,
              created: false,
              revisionPublished: true,
              displayId: existing.displayId,
              reason: `Upgraded from prior packaged ${label} HTML.`,
            };
          }
          return {
            slug: definition.slug,
            created: false,
            revisionPublished: false,
            displayId: existing.displayId,
            reason: `Display already registered; leaving published ${label} content unchanged.`,
          };
        }
        this.publishRevision(projectId, existing.displayId, definition.slug, bundle, {
          sourceHash,
          actorUserId,
          changeNote: "Updated SEMA display from project package.",
          identity,
        });
        return {
          slug: definition.slug,
          created: false,
          revisionPublished: true,
          displayId: existing.displayId,
        };
      }

      const display = this.displays.upsert({
        projectId,
        name: definition.name,
        displayKey: definition.slug,
        htmlPath: null,
        enabled: true,
        refreshRateMs: 5000,
        displayWidth: definition.width,
        displayHeight: definition.height,
        settings,
      });
      this.publishRevision(projectId, display.id, definition.slug, bundle, {
        sourceHash,
        actorUserId,
        changeNote: "Initial SEMA display from project package.",
        identity,
      });
      return {
        slug: definition.slug,
        created: true,
        revisionPublished: true,
        displayId: display.id,
      };
    });
  }

  private publishRevision(
    projectId: string,
    displayId: string,
    slug: string,
    bundle: { html: string; css: string; javascript: string },
    input: {
      sourceHash: string;
      actorUserId: string;
      changeNote: string;
      identity: ReturnType<typeof resolveDisplayIdentity>;
    },
  ): void {
    const revisionId = createRevisionId();
    const revisionName = buildStreamDisplayRevisionName(input.identity.importKey);
    const stored = {
      ...bundle,
      metadata: {
        revisionId,
        revisionName,
        changeNote: input.changeNote,
        standaloneDocument: true,
        importKey: input.identity.importKey,
      },
    };
    this.storage.writeDisplayRevision(projectId, displayId, revisionId, stored);
    this.storage.writeDisplayPublished(projectId, displayId, stored);
    this.revisions.create({
      id: revisionId,
      projectId,
      resourceType: "display",
      resourceId: displayId,
      revisionName,
      changeNote: input.changeNote,
      sourceHash: input.sourceHash,
      validationStatus: "valid",
      createdBy: input.actorUserId,
      message: `Published SEMA display ${revisionName}`,
      metadata: {
        storageRevisionId: revisionId,
        importKey: input.identity.importKey,
      },
    });
    this.displayCode.upsert({
      displayId,
      projectId,
      slug,
      description: input.identity.description,
      sourceType: "project-html",
      draftHtml: bundle.html,
      draftCss: bundle.css,
      draftJavascript: bundle.javascript,
      publishedRevisionId: revisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: input.actorUserId,
    });
  }
}
