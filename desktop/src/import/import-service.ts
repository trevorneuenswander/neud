import { backupDatabase } from "../database/backup";
import type { LocalDatabase } from "../database/connection";
import type { AppPaths } from "../services/app-paths";
import type { AuthLicenseManager } from "../services/auth-license-manager";
import { SIGN_IN_TO_NEUD_ACCOUNT_IMPORT_MESSAGE } from "../auth/messages";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { BagSourceService } from "../services/bag-source-service";
import type { AuthenticatedCloudCoordinator } from "../services/authenticated-cloud-coordinator";
import { ImportHistoryRepository } from "../repositories/import-history-repository";
import { buildImportPreview, sanitizeSelections } from "./import-preview";
import type {
  NeudImportPackage,
  NeudProjectImportRecord,
  ImportExecuteResult,
  ImportExecuteSelection,
  ImportPreviewResult,
} from "./import-types";
import { validateImportPackage, countImportTotals } from "./import-validator";
import {
  ImportWriter,
  buildCopyMaps,
  buildCopySlug,
  buildCreateMaps,
  getImportVersion,
} from "./import-writer";
import { SupabaseExportService } from "./supabase-export-service";

export class ImportService {
  private readonly history: ImportHistoryRepository;
  private readonly exportService: SupabaseExportService;

  constructor(
    private readonly paths: AppPaths,
    private readonly db: LocalDatabase,
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly auth: AuthLicenseManager,
    private readonly bagSources: BagSourceService,
    private readonly cloud: AuthenticatedCloudCoordinator,
  ) {
    this.history = new ImportHistoryRepository(db);
    this.exportService = new SupabaseExportService(cloud);
  }

  async preview(): Promise<ImportPreviewResult> {
    const user = this.requireAuthenticatedUser();
    const pkg = await this.loadExportPackage(user.userId, user.role);
    return this.buildPreviewResult(pkg);
  }

  async execute(
    selections: ImportExecuteSelection[],
  ): Promise<ImportExecuteResult> {
    const user = this.requireAuthenticatedUser();
    const pkg = await this.loadExportPackage(user.userId, user.role);
    const preview = this.buildPreviewResult(pkg);
    const validation = preview.validation;

    if (!validation.valid) {
      return {
        ok: false,
        backupPath: null,
        importedProjects: 0,
        copiedProjects: 0,
        skippedProjects: selections.filter((item) => item.action === "skip").length,
        importedEngines: 0,
        importedScraperSources: 0,
        importedSnapshots: 0,
        projects: [],
        warnings: validation.warnings,
        errors: validation.errors,
      };
    }

    const normalizedSelections = sanitizeSelections(preview.projects, selections);
    const selectedActions = normalizedSelections.filter(
      (selection) => selection.action !== "skip",
    );
    const skippedProjects = normalizedSelections.filter(
      (selection) => selection.action === "skip",
    );

    let backupPath: string | null = null;
    try {
      backupPath = backupDatabase(this.paths, "pre-import");
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Unable to create a local backup before import: ${error.message}`
          : "Unable to create a local backup before import.",
      );
    }

    const writer = new ImportWriter(this.db);
    const results: ImportExecuteResult["projects"] = [];
    let importedProjects = 0;
    let copiedProjects = 0;
    let importedEngines = 0;
    let importedScraperSources = 0;
    let importedSnapshots = 0;

    try {
      this.db.transaction(() => {
        const reservedSlugs = new Set(this.projects.list().map((project) => project.slug));

        for (const selection of selectedActions) {
          const project = pkg.projects.find(
            (item) => item.id === selection.sourceProjectId,
          );

          if (!project) {
            throw new Error("Selected project is no longer available.");
          }

          if (selection.action === "create") {
            if (this.projects.getById(project.id)) {
              throw new Error(
                `Project "${project.name}" already exists locally with the same cloud ID.`,
              );
            }
            if (this.projects.slugExists(project.slug)) {
              throw new Error(
                `Project slug "${project.slug}" already exists locally.`,
              );
            }

            const maps = buildCreateMaps(project);
            writer.insertProject(project, maps, {
              slug: project.slug,
              name: project.name,
            });
            importedProjects += 1;
            importedEngines += project.engines.length;
            importedScraperSources += countScraperSources(project);
            importedSnapshots += countSnapshots(project);
            reservedSlugs.add(project.slug);

            this.history.insert({
              sourceType: "supabase",
              sourceProjectId: project.id,
              localProjectId: project.id,
              importVersion: getImportVersion(),
              sourceUpdatedAt: project.updatedAt ?? null,
              result: "success",
              importedAsCopy: false,
              details: { action: "create" },
            });

            results.push({
              sourceProjectId: project.id,
              action: "create",
              status: "imported",
              localProjectId: project.id,
              localSlug: project.slug,
            });
            continue;
          }

          if (selection.action === "copy") {
            const targetSlug = buildCopySlug(project.slug, reservedSlugs);
            const copyMaps = buildCopyMaps(project, targetSlug);
            writer.insertProject(project, copyMaps, {
              slug: targetSlug,
              name: copyMaps.targetName,
            });
            copiedProjects += 1;
            importedEngines += project.engines.length;
            importedScraperSources += countScraperSources(project);
            importedSnapshots += countSnapshots(project);
            reservedSlugs.add(targetSlug);

            const localProjectId = copyMaps.projectIdMap.get(project.id)!;
            this.history.insert({
              sourceType: "supabase",
              sourceProjectId: project.id,
              localProjectId,
              importVersion: getImportVersion(),
              sourceUpdatedAt: project.updatedAt ?? null,
              result: "success",
              importedAsCopy: true,
              details: {
                action: "copy",
                localSlug: targetSlug,
              },
            });

            results.push({
              sourceProjectId: project.id,
              action: "copy",
              status: "copied",
              localProjectId,
              localSlug: targetSlug,
            });
          }
        }
      });
    } catch (error) {
      console.error("[import] Transaction failed:", error);
      return {
        ok: false,
        backupPath,
        importedProjects: 0,
        copiedProjects: 0,
        skippedProjects: skippedProjects.length,
        importedEngines: 0,
        importedScraperSources: 0,
        importedSnapshots: 0,
        projects: results,
        warnings: validation.warnings,
        errors: [
          {
            path: "execute",
            message:
              error instanceof Error
                ? error.message
                : "Import failed and was rolled back.",
          },
        ],
      };
    }

    for (const skipped of skippedProjects) {
      results.push({
        sourceProjectId: skipped.sourceProjectId,
        action: "skip",
        status: "skipped",
      });
    }

    for (const result of results) {
      if (!result.localProjectId) continue;
      const project = this.projects.getById(result.localProjectId);
      if (project?.projectType !== "bag-graphics") continue;
      for (const engine of this.dataSources.listByProject(result.localProjectId)) {
        if (this.bagSources.isBagAuctionEngine(engine)) {
          this.bagSources.ensureBagScraperSources(engine.id);
        }
      }
    }

    return {
      ok: true,
      backupPath,
      importedProjects,
      copiedProjects,
      skippedProjects: skippedProjects.length,
      importedEngines,
      importedScraperSources,
      importedSnapshots,
      projects: results,
      warnings: validation.warnings,
      errors: [],
    };
  }

  createBackup(): string {
    return backupDatabase(this.paths, "manual-backup");
  }

  private async loadExportPackage(userId: string, role: string) {
    try {
      return await this.exportService.exportForUser({ userId, role });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (
        message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("enotfound") ||
        message.includes("econnrefused")
      ) {
        throw new Error(
          "Unable to reach Supabase. Check your internet connection and try again.",
        );
      }
      throw error;
    }
  }

  private buildPreviewResult(pkg: NeudImportPackage): ImportPreviewResult {
    const validation = validateImportPackage(pkg);
    const context = this.buildLocalContext(pkg);
    const projects = buildImportPreview(pkg, context, validation);

    return {
      package: pkg,
      validation,
      totals: countImportTotals(pkg),
      projects,
    };
  }

  private requireAuthenticatedUser() {
    const user = this.auth.getAuthenticatedUser();
    if (!user) {
      throw new Error(SIGN_IN_TO_NEUD_ACCOUNT_IMPORT_MESSAGE);
    }
    return user;
  }

  private buildLocalContext(pkg: NeudImportPackage) {
    const localProjects = this.projects.list();
    return {
      projectsById: new Map(localProjects.map((project) => [project.id, project])),
      projectsBySlug: new Map(localProjects.map((project) => [project.slug, project])),
      activeEngineIds: this.loadActiveEngineIds(),
      importHistoryBySourceId: new Map(
        this.history
          .listSuccessfulBySourceIds(pkg.projects.map((project) => project.id))
          .map((record) => [record.sourceProjectId ?? "", record]),
      ),
    };
  }

  private loadActiveEngineIds(): Set<string> {
    const active = new Set<string>();
    for (const project of this.projects.list()) {
      for (const engine of this.dataSources.listByProject(project.id)) {
        const status = this.dataSources.getStatus(engine.id);
        if (
          engine.desiredState === "running" ||
          status?.actualState === "running" ||
          status?.actualState === "starting"
        ) {
          active.add(engine.id);
        }
      }
    }
    return active;
  }
}

function countScraperSources(project: NeudProjectImportRecord): number {
  return project.engines.reduce(
    (count, engine) => count + engine.scraperSources.length,
    0,
  );
}

function countSnapshots(project: NeudProjectImportRecord): number {
  return project.engines.filter((engine) => engine.latestSnapshot).length;
}
