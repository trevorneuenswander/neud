import fs from "fs";
import os from "os";
import path from "path";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../bag/broad-arrow-phase";
import type { AppPaths } from "../services/app-paths";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectPackagesRepository } from "../repositories/project-packages-repository";
import { buildBroadArrowPackageV1 } from "./broad-arrow-package-builder";
import { buildSemaPackageV1 } from "./sema-package-builder";
import { buildModularPackageV1 } from "./modular-package-builder";
import {
  BUILTIN_PROJECT_PACKAGE_CATALOG,
  getBuiltinCatalogEntry,
} from "./builtin-package-catalog";
import { ProjectPackageStore } from "./project-package-store";
import { ProjectPackageValidationError } from "./manifest";
import type {
  ProjectPackageCardState,
  ProjectPackageDirectoryItem,
  ProjectPackageInstallRecord,
  ProjectPackageManifest,
} from "./types";
import { ensureProjectPackageDirs } from "./project-package-paths";
import type { ProjectCapabilityId } from "../projects/project-capabilities";
import type { CloudPackagePublisher } from "./cloud-package-publisher";

export type ProjectPackageProgressEvent = {
  slug: string;
  phase: "download" | "validate" | "activate" | "complete" | "error";
  progress: number;
  message: string;
};

type ProgressListener = (event: ProjectPackageProgressEvent) => void;

function resolveCardState(input: {
  install: ProjectPackageInstallRecord | null;
  availableVersion: number | null;
}): ProjectPackageCardState {
  if (!input.install) {
    return "not_downloaded";
  }
  if (input.install.installState === "downloading") {
    return "downloading";
  }
  if (input.install.installState === "updating") {
    return "updating";
  }
  if (input.install.installState === "error") {
    return "error";
  }
  const available =
    input.availableVersion ??
    input.install.availableVersion ??
    input.install.installedVersion;
  if (available > input.install.installedVersion) {
    return "update_available";
  }
  return "downloaded";
}

export class ProjectPackageService {
  private readonly store: ProjectPackageStore;
  private readonly listeners = new Set<ProgressListener>();
  private scheduleTickerHtmlLoader: (() => string) | null = null;
  private onFirstInstallHooks:
    | ((projectId: string, manifest: ProjectPackageManifest) => void | Promise<void>)
    | null = null;
  private onPackageActivated:
    | ((
        projectId: string,
        manifest: ProjectPackageManifest,
        meta: { isUpdate: boolean; legacyMigration: boolean },
      ) => void | Promise<void>)
    | null = null;
  private cloudPackagePublisher: CloudPackagePublisher | null = null;

  constructor(
    private readonly paths: AppPaths,
    private readonly packages: ProjectPackagesRepository,
    private readonly projects: ProjectsRepository,
  ) {
    this.store = new ProjectPackageStore(paths);
  }

  setCloudPackagePublisher(publisher: CloudPackagePublisher): void {
    this.cloudPackagePublisher = publisher;
  }

  setScheduleTickerHtmlLoader(loader: () => string): void {
    this.scheduleTickerHtmlLoader = loader;
  }

  setFirstInstallHooks(
    handler: (projectId: string, manifest: ProjectPackageManifest) => void | Promise<void>,
  ): void {
    this.onFirstInstallHooks = handler;
  }

  setPackageActivatedHandler(
    handler: (
      projectId: string,
      manifest: ProjectPackageManifest,
      meta: { isUpdate: boolean; legacyMigration: boolean },
    ) => void | Promise<void>,
  ): void {
    this.onPackageActivated = handler;
  }

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ProjectPackageProgressEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  isProjectInstalled(projectId: string): boolean {
    const install = this.packages.getInstallByProjectId(projectId);
    return Boolean(install && install.installState !== "not_downloaded");
  }

  isSlugInstalled(slug: string): boolean {
    const install = this.packages.getInstallBySlug(slug);
    return Boolean(install && install.installState !== "not_downloaded");
  }

  getInstall(projectId: string): ProjectPackageInstallRecord | null {
    return this.packages.getInstallByProjectId(projectId);
  }

  getInstalledDisplayKeys(projectId: string): Set<string> | null {
    const install = this.packages.getInstallByProjectId(projectId);
    if (!install?.manifest) {
      return null;
    }
    return new Set(install.manifest.displays.map((display) => display.slug));
  }

  /** Seed builtin catalog rows into the package directory without installing packages. */
  ensureCatalogDirectoryEntries(): number {
    const now = new Date().toISOString();
    for (const entry of BUILTIN_PROJECT_PACKAGE_CATALOG) {
      if (this.packages.getDirectoryBySlug(entry.slug)) {
        // Refresh available version / metadata for existing catalog or cloud-linked rows.
        const existing = this.packages.getDirectoryBySlug(entry.slug)!;
        this.packages.upsertDirectoryEntry({
          cloudProjectId: existing.cloudProjectId,
          localProjectId: existing.localProjectId ?? this.projects.getBySlug(entry.slug)?.id ?? null,
          slug: entry.slug,
          name: existing.name || entry.name,
          projectType: existing.projectType || entry.projectType,
          availableVersion: entry.availableVersion,
          description: existing.description ?? entry.description,
          updatedAt: existing.updatedAt || now,
        });
        continue;
      }
      this.packages.upsertDirectoryEntry({
        cloudProjectId: `builtin:${entry.slug}`,
        localProjectId: this.projects.getBySlug(entry.slug)?.id ?? null,
        slug: entry.slug,
        name: entry.name,
        projectType: entry.projectType,
        availableVersion: entry.availableVersion,
        description: entry.description,
        updatedAt: now,
      });
    }
    return BUILTIN_PROJECT_PACKAGE_CATALOG.length;
  }

  /**
   * Migrate legacy bundled Broad Arrow installs to package v1 without redownload.
   * Fresh machines without a local BA project do NOT auto-install.
   */
  migrateLegacyInstalls(): {
    migrated: string[];
    catalogSeeded: number;
  } {
    const migrated: string[] = [];
    const catalogSeeded = this.ensureCatalogDirectoryEntries();

    const broadArrow = this.projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);
    if (broadArrow && !this.packages.getInstallByProjectId(broadArrow.id)) {
      this.installBuiltinPackage(broadArrow.slug, {
        existingProjectId: broadArrow.id,
        isUpdate: false,
        legacyMigration: true,
      });
      migrated.push(broadArrow.slug);
    }

    return {
      migrated,
      catalogSeeded,
    };
  }

  listDirectoryItems(options?: {
    accessibleSlugs?: Set<string> | null;
    query?: string;
  }): ProjectPackageDirectoryItem[] {
    const query = options?.query?.trim().toLowerCase() ?? "";
    const directory = this.packages.listDirectory();
    const installsBySlug = new Map(
      this.packages.listInstalls().map((install) => [install.projectSlug, install]),
    );

    const items: ProjectPackageDirectoryItem[] = [];
    const seen = new Set<string>();

    for (const entry of directory) {
      if (options?.accessibleSlugs && !options.accessibleSlugs.has(entry.slug)) {
        // Always include builtin catalog entries that are locally installed.
        if (!installsBySlug.has(entry.slug)) {
          continue;
        }
      }
      seen.add(entry.slug);
      const install = installsBySlug.get(entry.slug) ?? null;
      const availableVersion = entry.availableVersion;
      const packageState = resolveCardState({ install, availableVersion });
      items.push({
        slug: entry.slug,
        name: entry.name,
        projectType: entry.projectType,
        cloudProjectId: entry.cloudProjectId,
        localProjectId: entry.localProjectId ?? install?.projectId ?? null,
        installedVersion: install?.installedVersion ?? null,
        availableVersion,
        packageState,
        lastError: install?.lastError ?? null,
        description: entry.description,
        isInstalled: Boolean(install && install.installState === "installed"),
        canOpen: Boolean(install && install.installState === "installed"),
        updatedAt: entry.updatedAt ?? null,
      });
    }

    // Ensure builtin catalog visibility even before directory sync.
    for (const entry of BUILTIN_PROJECT_PACKAGE_CATALOG) {
      if (seen.has(entry.slug)) {
        continue;
      }
      if (options?.accessibleSlugs && !options.accessibleSlugs.has(entry.slug)) {
        continue;
      }
      const install = installsBySlug.get(entry.slug) ?? null;
      const packageState = resolveCardState({
        install,
        availableVersion: entry.availableVersion,
      });
      items.push({
        slug: entry.slug,
        name: entry.name,
        projectType: entry.projectType,
        cloudProjectId: `builtin:${entry.slug}`,
        localProjectId: install?.projectId ?? this.projects.getBySlug(entry.slug)?.id ?? null,
        installedVersion: install?.installedVersion ?? null,
        availableVersion: entry.availableVersion,
        packageState,
        lastError: install?.lastError ?? null,
        description: entry.description,
        isInstalled: Boolean(install && install.installState === "installed"),
        canOpen: Boolean(install && install.installState === "installed"),
        updatedAt: null,
      });
    }

    const filtered = query
      ? items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.slug.toLowerCase().includes(query),
        )
      : items;

    return filtered.sort((left, right) => left.name.localeCompare(right.name));
  }

  listInstalledSlugs(): string[] {
    return this.packages
      .listInstalls()
      .filter((install) => install.installState === "installed" || install.installState === "updating" || install.installState === "error")
      .map((install) => install.projectSlug);
  }

  getDirectoryBySlug(slug: string) {
    return this.packages.getDirectoryBySlug(slug);
  }

  updateDirectoryAvailableVersion(input: {
    slug: string;
    cloudProjectId: string;
    availableVersion: number;
    capabilities?: string[];
    contentHash?: string | null;
  }): void {
    const existing = this.packages.getDirectoryBySlug(input.slug);
    if (!existing) {
      return;
    }
    this.packages.upsertDirectoryEntry({
      cloudProjectId: input.cloudProjectId,
      localProjectId: existing.localProjectId,
      slug: existing.slug,
      name: existing.name,
      projectType: existing.projectType,
      availableVersion: input.availableVersion,
      description: existing.description,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(input.capabilities ? { capabilities: input.capabilities } : {}),
        ...(input.contentHash !== undefined
          ? { contentHash: input.contentHash }
          : {}),
      },
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Register a newly created local project in the package directory at v1.
   * Creator install is performed separately via downloadPackage.
   */
  registerNewProjectDirectoryEntry(input: {
    projectId: string;
    slug: string;
    name: string;
    projectType: string;
    description?: string | null;
    capabilities: readonly ProjectCapabilityId[];
    cloudProjectId?: string;
  }): void {
    const now = new Date().toISOString();
    const existing = this.packages.getDirectoryBySlug(input.slug);
    this.packages.upsertDirectoryEntry({
      cloudProjectId:
        input.cloudProjectId ??
        existing?.cloudProjectId ??
        `local:${input.projectId}`,
      localProjectId: input.projectId,
      slug: input.slug,
      name: input.name,
      projectType: input.projectType,
      availableVersion: existing?.availableVersion ?? 1,
      description: input.description ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        capabilities: [...input.capabilities],
        generatedPackage: true,
      },
      updatedAt: now,
    });
  }

  /**
   * Publish modular package v1 (manifest + files) to cloud catalog/storage.
   * Idempotent for the same projectId + version.
   */
  async publishModularPackageVersion(input: {
    projectId: string;
    cloudProjectId: string;
    slug: string;
    name: string;
    projectType: string;
    description?: string | null;
    capabilities: readonly ProjectCapabilityId[];
    version: number;
  }): Promise<{ ok: boolean; error?: string }> {
    const install = this.packages.getInstallBySlug(input.slug);
    const packageRoot = install?.packageRoot;
    if (!packageRoot || !fs.existsSync(packageRoot)) {
      return { ok: false, error: "Installed package root missing for publish." };
    }

    const publisher = this.cloudPackagePublisher;
    if (!publisher) {
      // Local-only: mark directory available so creator UI shows Downloaded · v1.
      this.packages.upsertDirectoryEntry({
        cloudProjectId: input.cloudProjectId.startsWith("local:")
          ? input.cloudProjectId
          : input.cloudProjectId,
        localProjectId: input.projectId,
        slug: input.slug,
        name: input.name,
        projectType: input.projectType,
        availableVersion: input.version,
        description: input.description ?? null,
        metadata: {
          capabilities: [...input.capabilities],
          generatedPackage: true,
          packagePublishedLocally: true,
        },
        updatedAt: new Date().toISOString(),
      });
      if (input.cloudProjectId.startsWith("local:")) {
        return {
          ok: false,
          error:
            "Cloud session unavailable; package installed locally but not published for other users.",
        };
      }
      return {
        ok: false,
        error: "Cloud package publisher is not configured.",
      };
    }

    try {
      const result = await publisher.publishVersion({
        cloudProjectId: input.cloudProjectId,
        localProjectId: input.projectId,
        slug: input.slug,
        name: input.name,
        projectType: input.projectType,
        description: input.description ?? null,
        capabilities: [...input.capabilities],
        version: input.version,
        packageRoot,
      });
      this.packages.upsertDirectoryEntry({
        cloudProjectId: input.cloudProjectId,
        localProjectId: input.projectId,
        slug: input.slug,
        name: input.name,
        projectType: input.projectType,
        availableVersion: input.version,
        description: input.description ?? null,
        metadata: {
          capabilities: [...input.capabilities],
          generatedPackage: true,
          packagePublished: result.ok,
          contentHash: result.contentHash ?? null,
        },
        updatedAt: new Date().toISOString(),
      });
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error ?? "Package publish failed." };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Package publish failed.",
      };
    }
  }

  async downloadPackage(slug: string): Promise<ProjectPackageInstallRecord> {
    if (this.isSlugInstalled(slug)) {
      const existing = this.packages.getInstallBySlug(slug);
      if (existing) {
        return existing;
      }
    }
    const catalog = getBuiltinCatalogEntry(slug);
    if (catalog) {
      return this.installBuiltinPackage(slug, { isUpdate: false, legacyMigration: false });
    }
    return this.installModularPackage(slug, { isUpdate: false });
  }

  async updatePackage(slug: string): Promise<ProjectPackageInstallRecord> {
    const existing = this.packages.getInstallBySlug(slug);
    if (!existing) {
      throw new ProjectPackageValidationError(
        `Cannot update ${slug}: project package is not installed.`,
      );
    }
    return this.installBuiltinPackage(slug, {
      existingProjectId: existing.projectId,
      isUpdate: true,
      legacyMigration: false,
    });
  }

  /**
   * Repair package install rows left on a stale project id after builtin→cloud
   * identity realignment (or any slug-canonical project id change).
   * First failing backend stage for missing SEMA Schedule Ticker when installs
   * stay keyed to the old id: getInstalledDisplayKeys(canonicalId) → null.
   */
  reconcileInstallProjectIdentity(slug: string): {
    rebound: boolean;
    reason: string;
    install: ProjectPackageInstallRecord | null;
    fromProjectId: string | null;
    toProjectId: string | null;
  } {
    const project = this.projects.getBySlug(slug);
    const install = this.packages.getInstallBySlug(slug);
    if (!project) {
      return {
        rebound: false,
        reason: "project_missing",
        install: install ?? null,
        fromProjectId: install?.projectId ?? null,
        toProjectId: null,
      };
    }
    if (!install || install.installState === "not_downloaded") {
      return {
        rebound: false,
        reason: "not_installed",
        install: null,
        fromProjectId: null,
        toProjectId: project.id,
      };
    }
    if (install.projectId === project.id && fs.existsSync(install.packageRoot)) {
      return {
        rebound: false,
        reason: "identity_current",
        install,
        fromProjectId: install.projectId,
        toProjectId: project.id,
      };
    }

    const fromProjectId = install.projectId;
    const toProjectId = project.id;
    const fromPackagesRoot = path.join(this.paths.projects, fromProjectId, "packages");
    const toPackagesRoot = path.join(this.paths.projects, toProjectId, "packages");
    const expectedRoot = path.join(toPackagesRoot, `v${install.installedVersion}`);

    if (fromProjectId !== toProjectId) {
      if (fs.existsSync(fromPackagesRoot) && !fs.existsSync(toPackagesRoot)) {
        fs.mkdirSync(path.dirname(toPackagesRoot), { recursive: true });
        fs.renameSync(fromPackagesRoot, toPackagesRoot);
      } else if (
        fs.existsSync(install.packageRoot) &&
        !fs.existsSync(expectedRoot) &&
        path.resolve(install.packageRoot) !== path.resolve(expectedRoot)
      ) {
        fs.mkdirSync(path.dirname(expectedRoot), { recursive: true });
        fs.renameSync(install.packageRoot, expectedRoot);
      }
    }

    const nextRoot = fs.existsSync(expectedRoot)
      ? expectedRoot
      : fs.existsSync(install.packageRoot)
        ? install.packageRoot.replace(
            `${path.sep}${fromProjectId}${path.sep}`,
            `${path.sep}${toProjectId}${path.sep}`,
          )
        : expectedRoot;

    const rebound = this.packages.rebindInstallProjectId(fromProjectId, toProjectId, nextRoot);
    return {
      rebound: true,
      reason:
        fromProjectId !== toProjectId
          ? "install_project_id_mismatched_slug"
          : "package_root_repaired",
      install: rebound,
      fromProjectId,
      toProjectId,
    };
  }

  /**
   * Development-only repair for unpublished builtin packages (currently SEMA v1).
   * If on-disk package HTML/manifest no longer matches the rebuilt builtin baseline,
   * reinstall the same package version in place and re-run activation hooks.
   * Does not bump the published package version model.
   */
  reconcileDevelopmentBuiltinPackage(slug: string): {
    rebuilt: boolean;
    reason: string;
    install: ProjectPackageInstallRecord | null;
  } {
    const catalog = getBuiltinCatalogEntry(slug);
    if (!catalog || catalog.legacyAutoMigrate) {
      // Only unpublished development packages (SEMA) use content-hash reconcile.
      return { rebuilt: false, reason: "not_development_builtin", install: null };
    }
    // Identity first — content rebuild must target the canonical slug project id.
    this.reconcileInstallProjectIdentity(slug);
    const project = this.projects.getBySlug(slug);
    const install = this.packages.getInstallBySlug(slug);
    if (!install || install.installState === "not_downloaded") {
      return { rebuilt: false, reason: "not_installed", install: null };
    }

    const stagingSource = fs.mkdtempSync(path.join(os.tmpdir(), `neud-reconcile-${slug}-`));
    try {
      let freshManifest: ProjectPackageManifest;
      if (slug === "sema") {
        const html = this.scheduleTickerHtmlLoader?.() ?? undefined;
        freshManifest = html
          ? buildSemaPackageV1(stagingSource, html)
          : buildSemaPackageV1(stagingSource);
      } else {
        return { rebuilt: false, reason: "unsupported_slug", install };
      }

      const installedTickerPath = path.join(
        install.packageRoot,
        "displays",
        "schedule-ticker-v1.html",
      );
      const freshTickerPath = path.join(stagingSource, "displays", "schedule-ticker-v1.html");
      const installedPylonPath = path.join(
        install.packageRoot,
        "displays",
        "schedule-pylon-v1.html",
      );
      const freshPylonPath = path.join(stagingSource, "displays", "schedule-pylon-v1.html");
      const installedEditablePath = path.join(
        install.packageRoot,
        "displays",
        "schedule-ticker-editable-v1.html",
      );
      const freshEditablePath = path.join(
        stagingSource,
        "displays",
        "schedule-ticker-editable-v1.html",
      );
      const installedHasTicker = fs.existsSync(installedTickerPath);
      const freshHasTicker = fs.existsSync(freshTickerPath);
      const installedHasPylon = fs.existsSync(installedPylonPath);
      const freshHasPylon = fs.existsSync(freshPylonPath);
      const installedHasEditable = fs.existsSync(installedEditablePath);
      const freshHasEditable = fs.existsSync(freshEditablePath);
      const installedHash = install.manifestHash ?? install.manifest?.integrity?.manifestHash ?? null;
      const freshHash = freshManifest.integrity.manifestHash ?? null;
      const tickerMismatch =
        !installedHasTicker ||
        !freshHasTicker ||
        (installedHasTicker &&
          freshHasTicker &&
          fs.readFileSync(installedTickerPath, "utf8") !==
            fs.readFileSync(freshTickerPath, "utf8"));
      const pylonMismatch =
        !installedHasPylon ||
        !freshHasPylon ||
        (installedHasPylon &&
          freshHasPylon &&
          fs.readFileSync(installedPylonPath, "utf8") !==
            fs.readFileSync(freshPylonPath, "utf8"));
      const editableMismatch =
        !installedHasEditable ||
        !freshHasEditable ||
        (installedHasEditable &&
          freshHasEditable &&
          fs.readFileSync(installedEditablePath, "utf8") !==
            fs.readFileSync(freshEditablePath, "utf8"));
      const htmlMismatch = tickerMismatch || pylonMismatch || editableMismatch;
      const hashMismatch = Boolean(freshHash && installedHash && freshHash !== installedHash);
      const missingDisplayDef =
        !install.manifest?.displays?.some((display) => display.slug === "schedule-ticker") ||
        !install.manifest?.displays?.some((display) => display.slug === "schedule-pylon") ||
        !install.manifest?.displays?.some(
          (display) => display.slug === "schedule-ticker-editable",
        );

      if (!htmlMismatch && !hashMismatch && !missingDisplayDef) {
        return { rebuilt: false, reason: "content_current", install };
      }

      // Rebuild same development package version (v1) without treating it as a public v2.
      // Prefer canonical slug project id — never recreate against a stale install.projectId.
      const rebuilt = this.installBuiltinPackage(slug, {
        existingProjectId: project?.id ?? install.projectId,
        isUpdate: true,
        legacyMigration: false,
      });
      return {
        rebuilt: true,
        reason: missingDisplayDef
          ? "missing_display_definition"
          : htmlMismatch
            ? "html_content_changed"
            : "manifest_hash_changed",
        install: rebuilt,
      };
    } finally {
      fs.rmSync(stagingSource, { recursive: true, force: true });
    }
  }

  removeDownload(slug: string): { ok: true; retainedData: true } {
    const install = this.packages.getInstallBySlug(slug);
    if (!install) {
      return { ok: true, retainedData: true };
    }
    // Remove package definition files only. Operational/retained data stays.
    this.store.removePackageFiles(install.projectId, { keepRetainedData: true });
    this.packages.removeInstall(install.projectId);
    const directory = this.packages.getDirectoryBySlug(slug);
    if (directory) {
      this.packages.linkDirectoryLocalProject(
        directory.cloudProjectId,
        install.projectId,
        new Date().toISOString(),
      );
    }
    return { ok: true, retainedData: true };
  }

  /**
   * Merge authoritative cloud project directory rows into the local package directory.
   * Replaces builtin: placeholders when a real cloud project id is available.
   * Does not download or install packages.
   */
  syncCloudAccessibleProjects(
    projects: Array<{
      id?: string;
      slug?: string;
      name?: string;
      projectType?: string;
      description?: string | null;
    }>,
  ): { synced: number } {
    const now = new Date().toISOString();
    let synced = 0;

    for (const project of projects) {
      const id = typeof project.id === "string" ? project.id.trim() : "";
      const slug = typeof project.slug === "string" ? project.slug.trim() : "";
      const name = typeof project.name === "string" ? project.name.trim() : "";
      if (!id || !slug || !name) {
        continue;
      }

      const catalog = getBuiltinCatalogEntry(slug);
      const existing = this.packages.getDirectoryBySlug(slug);
      const builtinCloudId = `builtin:${slug}`;
      if (existing?.cloudProjectId === builtinCloudId && id !== builtinCloudId) {
        this.packages.removeDirectoryByCloudProjectId(builtinCloudId);
      }

      this.packages.upsertDirectoryEntry({
        cloudProjectId: id,
        localProjectId: this.projects.getBySlug(slug)?.id ?? existing?.localProjectId ?? null,
        slug,
        name,
        projectType:
          (typeof project.projectType === "string" && project.projectType.trim()) ||
          catalog?.projectType ||
          existing?.projectType ||
          "bag-graphics",
        availableVersion:
          catalog?.availableVersion ?? existing?.availableVersion ?? 1,
        description:
          (typeof project.description === "string" ? project.description : null) ??
          catalog?.description ??
          existing?.description ??
          null,
        updatedAt: now,
      });
      synced += 1;
    }

    // Keep builtin catalog rows for packages not yet present in cloud results.
    for (const entry of BUILTIN_PROJECT_PACKAGE_CATALOG) {
      if (this.packages.getDirectoryBySlug(entry.slug)) {
        continue;
      }
      this.packages.upsertDirectoryEntry({
        cloudProjectId: `builtin:${entry.slug}`,
        localProjectId: this.projects.getBySlug(entry.slug)?.id ?? null,
        slug: entry.slug,
        name: entry.name,
        projectType: entry.projectType,
        availableVersion: entry.availableVersion,
        description: entry.description,
        updatedAt: now,
      });
    }

    return { synced };
  }

  private installModularPackage(
    slug: string,
    options: { isUpdate: boolean },
  ): ProjectPackageInstallRecord {
    const project = this.projects.getBySlug(slug);
    if (!project) {
      throw new ProjectPackageValidationError(
        `Cannot install package: project ${slug} was not found locally.`,
      );
    }

    const directory = this.packages.getDirectoryBySlug(slug);
    const metaCaps = directory?.metadata?.capabilities;
    const capabilities = Array.isArray(metaCaps)
      ? (metaCaps.filter((value): value is ProjectCapabilityId => typeof value === "string") as ProjectCapabilityId[])
      : (["display-only"] as ProjectCapabilityId[]);

    this.emit({
      slug,
      phase: "download",
      progress: 0.1,
      message: options.isUpdate ? "Updating package…" : "Downloading package…",
    });

    const previous = this.packages.getInstallByProjectId(project.id);
    const nextVersion = directory?.availableVersion ?? 1;
    const now = new Date().toISOString();

    this.packages.upsertInstall({
      projectId: project.id,
      projectSlug: project.slug,
      projectType: project.projectType,
      installedVersion: previous?.installedVersion ?? nextVersion,
      previousVersion: previous?.installedVersion ?? null,
      availableVersion: nextVersion,
      installState: options.isUpdate ? "updating" : "downloading",
      packageRoot: previous?.packageRoot ?? "",
      manifest: previous?.manifest ?? {},
      updatedAt: now,
    });

    const stagingSource = fs.mkdtempSync(path.join(os.tmpdir(), `neud-pkg-${slug}-`));
    try {
      const manifest = buildModularPackageV1(stagingSource, {
        projectKey: project.slug,
        projectSlug: project.slug,
        projectName: project.name,
        projectType: project.projectType,
        description: project.description,
        capabilities,
      });

      this.emit({
        slug,
        phase: "validate",
        progress: 0.6,
        message: "Validating package…",
      });

      ensureProjectPackageDirs(this.paths, project.id);
      this.store.stageFromDirectory(project.id, nextVersion, stagingSource);

      this.emit({
        slug,
        phase: "activate",
        progress: 0.85,
        message: "Activating package…",
      });

      const activated = this.store.activateStagedPackage({
        projectId: project.id,
        projectSlug: project.slug,
        version: nextVersion,
        previousVersion: previous?.installedVersion ?? null,
      });

      const record = this.packages.upsertInstall({
        projectId: project.id,
        projectSlug: project.slug,
        projectType: project.projectType,
        installedVersion: nextVersion,
        previousVersion: previous?.installedVersion ?? null,
        availableVersion: nextVersion,
        installState: "installed",
        packageRoot: activated.packageRoot,
        manifest: activated.manifest ?? manifest,
        manifestHash:
          activated.manifest?.integrity.manifestHash ??
          manifest.integrity.manifestHash ??
          null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });

      this.packages.upsertDirectoryEntry({
        cloudProjectId: directory?.cloudProjectId ?? `local:${project.id}`,
        localProjectId: project.id,
        slug: project.slug,
        name: project.name,
        projectType: project.projectType,
        availableVersion: nextVersion,
        description: project.description,
        metadata: {
          ...(directory?.metadata ?? {}),
          capabilities,
          generatedPackage: true,
        },
        updatedAt: new Date().toISOString(),
      });

      this.emit({
        slug,
        phase: "complete",
        progress: 1,
        message: "Package ready.",
      });
      return record;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Package install failed.";
      this.packages.upsertInstall({
        projectId: project.id,
        projectSlug: project.slug,
        projectType: project.projectType,
        installedVersion: previous?.installedVersion ?? 0,
        previousVersion: previous?.previousVersion ?? null,
        availableVersion: nextVersion,
        installState: "error",
        packageRoot: previous?.packageRoot ?? "",
        manifest: previous?.manifest ?? {},
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      this.emit({ slug, phase: "error", progress: 0, message });
      throw error;
    } finally {
      try {
        fs.rmSync(stagingSource, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }
  }

  private installBuiltinPackage(
    slug: string,
    options: {
      existingProjectId?: string;
      isUpdate: boolean;
      legacyMigration: boolean;
    },
  ): ProjectPackageInstallRecord {
    const catalog = getBuiltinCatalogEntry(slug);
    if (!catalog) {
      throw new ProjectPackageValidationError(`Unknown project package: ${slug}`);
    }

    this.emit({
      slug,
      phase: "download",
      progress: 0.1,
      message: options.isUpdate ? "Updating package…" : "Downloading package…",
    });

    let project = options.existingProjectId
      ? this.projects.getById(options.existingProjectId)
      : this.projects.getBySlug(slug);

    if (!project) {
      // Prefer the hosted cloud UUID from the package directory when known so
      // Activity/Display sync keys match peer devices (critical for SEMA).
      const directory = this.packages.getDirectoryBySlug(slug);
      const hostedId = directory?.cloudProjectId?.trim() ?? "";
      const preferredId =
        hostedId &&
        !hostedId.startsWith("builtin:") &&
        !hostedId.startsWith("local:")
          ? hostedId
          : undefined;
      project = this.projects.create({
        name: catalog.name,
        slug: catalog.slug,
        projectType: catalog.projectType,
        description: catalog.description,
        icon: catalog.projectType === "bag-graphics" ? "bag" : "sema",
        id: preferredId,
      });
    }

    const previous = this.packages.getInstallByProjectId(project.id);
    const nextVersion = catalog.availableVersion;
    const now = new Date().toISOString();

    this.packages.upsertInstall({
      projectId: project.id,
      projectSlug: project.slug,
      projectType: project.projectType,
      installedVersion: previous?.installedVersion ?? nextVersion,
      previousVersion: previous?.installedVersion ?? null,
      availableVersion: nextVersion,
      installState: options.isUpdate ? "updating" : "downloading",
      packageRoot: previous?.packageRoot ?? "",
      manifest: previous?.manifest ?? {
        kind: "neud-project-package",
        schemaVersion: 1,
        projectKey: catalog.projectKey,
        projectSlug: catalog.slug,
        projectName: catalog.name,
        projectType: catalog.projectType,
        packageVersion: nextVersion,
        displays: [],
        files: {},
        integrity: { files: {} },
      },
      updatedAt: now,
    });

    const stagingSource = fs.mkdtempSync(path.join(os.tmpdir(), `neud-pkg-${slug}-`));
    try {
      let manifest: ProjectPackageManifest;
      if (slug === "broad-arrow-auctions") {
        manifest = buildBroadArrowPackageV1(stagingSource);
      } else if (slug === "sema") {
        const html = this.scheduleTickerHtmlLoader?.();
        manifest = html
          ? buildSemaPackageV1(stagingSource, html)
          : buildSemaPackageV1(stagingSource);
      } else {
        throw new ProjectPackageValidationError(`No package builder for ${slug}`);
      }

      this.emit({
        slug,
        phase: "validate",
        progress: 0.6,
        message: "Validating package…",
      });

      ensureProjectPackageDirs(this.paths, project.id);
      this.store.stageFromDirectory(project.id, nextVersion, stagingSource);

      this.emit({
        slug,
        phase: "activate",
        progress: 0.85,
        message: "Activating package…",
      });

      const activated = this.store.activateStagedPackage({
        projectId: project.id,
        projectSlug: project.slug,
        version: nextVersion,
        previousVersion: previous?.installedVersion ?? null,
      });

      const record = this.packages.upsertInstall({
        projectId: project.id,
        projectSlug: project.slug,
        projectType: project.projectType,
        installedVersion: nextVersion,
        previousVersion: previous?.installedVersion ?? null,
        availableVersion: nextVersion,
        installState: "installed",
        packageRoot: activated.packageRoot,
        manifest: activated.manifest,
        manifestHash: activated.manifest.integrity.manifestHash ?? null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });

      const existingDirectory = this.packages.getDirectoryBySlug(slug);
      const directoryCloudProjectId =
        existingDirectory && !existingDirectory.cloudProjectId.startsWith("builtin:")
          ? existingDirectory.cloudProjectId
          : `builtin:${slug}`;
      this.packages.upsertDirectoryEntry({
        cloudProjectId: directoryCloudProjectId,
        localProjectId: project.id,
        slug: catalog.slug,
        name: catalog.name,
        projectType: catalog.projectType,
        availableVersion: catalog.availableVersion,
        description: catalog.description,
        updatedAt: new Date().toISOString(),
      });

      if (slug === "sema") {
        if (!activated.manifest.displays.some((display) => display.slug === "schedule-ticker")) {
          throw new ProjectPackageValidationError(
            "SEMA package is missing the Schedule Ticker display definition.",
          );
        }
        if (!activated.manifest.displays.some((display) => display.slug === "schedule-pylon")) {
          throw new ProjectPackageValidationError(
            "SEMA package is missing the Schedule Pylon display definition.",
          );
        }
        if (
          !activated.manifest.displays.some(
            (display) => display.slug === "schedule-ticker-editable",
          )
        ) {
          throw new ProjectPackageValidationError(
            "SEMA package is missing the Schedule Ticker Editable display definition.",
          );
        }
        const tickerHtmlPath = path.join(
          activated.packageRoot,
          "displays",
          "schedule-ticker-v1.html",
        );
        if (!fs.existsSync(tickerHtmlPath)) {
          throw new ProjectPackageValidationError(
            "SEMA package is missing Schedule Ticker HTML assets.",
          );
        }
        const pylonHtmlPath = path.join(
          activated.packageRoot,
          "displays",
          "schedule-pylon-v1.html",
        );
        if (!fs.existsSync(pylonHtmlPath)) {
          throw new ProjectPackageValidationError(
            "SEMA package is missing Schedule Pylon HTML assets.",
          );
        }
        const editableHtmlPath = path.join(
          activated.packageRoot,
          "displays",
          "schedule-ticker-editable-v1.html",
        );
        if (!fs.existsSync(editableHtmlPath)) {
          throw new ProjectPackageValidationError(
            "SEMA package is missing Schedule Ticker Editable HTML assets.",
          );
        }
      }

      if (!options.legacyMigration && !options.isUpdate && this.onFirstInstallHooks) {
        void this.onFirstInstallHooks(project.id, activated.manifest);
      }
      if (this.onPackageActivated) {
        void this.onPackageActivated(project.id, activated.manifest, {
          isUpdate: options.isUpdate,
          legacyMigration: options.legacyMigration,
        });
      }

      this.emit({
        slug,
        phase: "complete",
        progress: 1,
        message: options.isUpdate ? "Update complete" : "Download complete",
      });

      return record;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Package installation failed.";
      this.packages.setInstallState(project.id, previous ? "installed" : "error", {
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      this.emit({
        slug,
        phase: "error",
        progress: 1,
        message,
      });
      throw error;
    } finally {
      fs.rmSync(stagingSource, { recursive: true, force: true });
    }
  }
}
