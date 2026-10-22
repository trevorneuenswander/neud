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
    const install = this.packages.getInstallByProjectId(projectId);
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
