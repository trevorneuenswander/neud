import type { LocalDatabase } from "../database/connection";
import type {
  ProjectPackageDirectoryEntry,
  ProjectPackageInstallRecord,
  ProjectPackageInstallState,
  ProjectPackageManifest,
} from "../packages/types";
import { parseProjectPackageManifest } from "../packages/manifest";
import { pickCanonicalDirectoryCloudProjectId } from "../packages/directory-identity";

type InstallRow = {
  project_id: string;
  project_slug: string;
  project_type: string;
  installed_version: number;
  previous_version: number | null;
  available_version: number | null;
  install_state: string;
  package_root: string;
  manifest_json: string;
  manifest_hash: string | null;
  last_error: string | null;
  installed_at: string;
  updated_at: string;
};

type DirectoryRow = {
  cloud_project_id: string;
  local_project_id: string | null;
  slug: string;
  name: string;
  project_type: string;
  available_version: number;
  minimum_neud_version: string | null;
  description: string | null;
  metadata_json: string;
  updated_at: string;
};

function mapInstall(row: InstallRow): ProjectPackageInstallRecord {
  let manifest: ProjectPackageManifest | null = null;
  try {
    manifest = parseProjectPackageManifest(JSON.parse(row.manifest_json));
  } catch {
    manifest = null;
  }
  return {
    projectId: row.project_id,
    projectSlug: row.project_slug,
    projectType: row.project_type,
    installedVersion: row.installed_version,
    previousVersion: row.previous_version,
    availableVersion: row.available_version,
    installState: row.install_state as ProjectPackageInstallState,
    packageRoot: row.package_root,
    manifest,
    manifestHash: row.manifest_hash,
    lastError: row.last_error,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

function mapDirectory(row: DirectoryRow): ProjectPackageDirectoryEntry {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    cloudProjectId: row.cloud_project_id,
    localProjectId: row.local_project_id,
    slug: row.slug,
    name: row.name,
    projectType: row.project_type,
    availableVersion: row.available_version,
    minimumNeudVersion: row.minimum_neud_version,
    description: row.description,
    metadata,
    updatedAt: row.updated_at,
  };
}

export class ProjectPackagesRepository {
  constructor(private readonly db: LocalDatabase) {}

  listInstalls(): ProjectPackageInstallRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_package_installs ORDER BY project_slug COLLATE NOCASE ASC`,
      )
      .all() as InstallRow[];
    return rows.map(mapInstall);
  }

  getInstallByProjectId(projectId: string): ProjectPackageInstallRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM project_package_installs WHERE project_id = ?`)
      .get(projectId) as InstallRow | undefined;
    return row ? mapInstall(row) : null;
  }

  getInstallBySlug(slug: string): ProjectPackageInstallRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM project_package_installs WHERE project_slug = ?`)
      .get(slug) as InstallRow | undefined;
    return row ? mapInstall(row) : null;
  }

  upsertInstall(input: {
    projectId: string;
    projectSlug: string;
    projectType: string;
    installedVersion: number;
    previousVersion?: number | null;
    availableVersion?: number | null;
    installState: ProjectPackageInstallState;
    packageRoot: string;
    manifest: ProjectPackageManifest | Record<string, unknown>;
    manifestHash?: string | null;
    lastError?: string | null;
    installedAt?: string;
    updatedAt: string;
  }): ProjectPackageInstallRecord {
    const existing = this.getInstallByProjectId(input.projectId);
    const installedAt = input.installedAt ?? existing?.installedAt ?? input.updatedAt;
    this.db
      .prepare(
        `INSERT INTO project_package_installs (
          project_id, project_slug, project_type, installed_version, previous_version,
          available_version, install_state, package_root, manifest_json, manifest_hash,
          last_error, installed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          project_slug = excluded.project_slug,
          project_type = excluded.project_type,
          installed_version = excluded.installed_version,
          previous_version = excluded.previous_version,
          available_version = excluded.available_version,
          install_state = excluded.install_state,
          package_root = excluded.package_root,
          manifest_json = excluded.manifest_json,
          manifest_hash = excluded.manifest_hash,
          last_error = excluded.last_error,
          installed_at = excluded.installed_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.projectId,
        input.projectSlug,
        input.projectType,
        input.installedVersion,
        input.previousVersion ?? null,
        input.availableVersion ?? null,
        input.installState,
        input.packageRoot,
        JSON.stringify(input.manifest),
        input.manifestHash ?? null,
        input.lastError ?? null,
        installedAt,
        input.updatedAt,
      );
    return this.getInstallByProjectId(input.projectId)!;
  }

  setInstallState(
    projectId: string,
    installState: ProjectPackageInstallState,
    options?: { lastError?: string | null; availableVersion?: number | null; updatedAt?: string },
  ): void {
    const updatedAt = options?.updatedAt ?? new Date().toISOString();
    this.db
      .prepare(
        `UPDATE project_package_installs
         SET install_state = ?,
             last_error = COALESCE(?, last_error),
             available_version = COALESCE(?, available_version),
             updated_at = ?
         WHERE project_id = ?`,
      )
      .run(
        installState,
        options?.lastError ?? null,
        options?.availableVersion ?? null,
        updatedAt,
        projectId,
      );
  }

  setAvailableVersion(projectId: string, availableVersion: number, updatedAt: string): void {
    this.db
      .prepare(
        `UPDATE project_package_installs
         SET available_version = ?, updated_at = ?
         WHERE project_id = ?`,
      )
      .run(availableVersion, updatedAt, projectId);
  }

  removeInstall(projectId: string): void {
    this.db
      .prepare(`DELETE FROM project_package_installs WHERE project_id = ?`)
      .run(projectId);
  }

  /**
   * Move an install row from a stale project id (e.g. pre-realign local UUID)
   * onto the canonical project id. Updates package_root path segments.
   * No-op when ids match or the source row is missing.
   */
  rebindInstallProjectId(
    fromProjectId: string,
    toProjectId: string,
    packageRoot: string,
  ): ProjectPackageInstallRecord | null {
    if (fromProjectId === toProjectId) {
      const current = this.getInstallByProjectId(toProjectId);
      if (current && current.packageRoot !== packageRoot) {
        return this.upsertInstall({
          projectId: current.projectId,
          projectSlug: current.projectSlug,
          projectType: current.projectType,
          installedVersion: current.installedVersion,
          previousVersion: current.previousVersion,
          availableVersion: current.availableVersion,
          installState: current.installState,
          packageRoot,
          manifest: current.manifest ?? {},
          manifestHash: current.manifestHash,
          lastError: current.lastError,
          installedAt: current.installedAt,
          updatedAt: new Date().toISOString(),
        });
      }
      return current;
    }
    const existing = this.getInstallByProjectId(fromProjectId);
    const alreadyCanonical = this.getInstallByProjectId(toProjectId);
    if (!existing) {
      return alreadyCanonical;
    }
    const now = new Date().toISOString();
    // PK change: delete+insert keeps UNIQUE(project_slug) intact.
    this.db.transaction(() => {
      this.db
        .prepare(`DELETE FROM project_package_installs WHERE project_id = ?`)
        .run(fromProjectId);
      if (alreadyCanonical) {
        this.db
          .prepare(
            `UPDATE project_package_installs
             SET package_root = ?, updated_at = ?
             WHERE project_id = ?`,
          )
          .run(packageRoot, now, toProjectId);
      } else {
        this.db
          .prepare(
            `INSERT INTO project_package_installs (
              project_id, project_slug, project_type, installed_version, previous_version,
              available_version, install_state, package_root, manifest_json, manifest_hash,
              last_error, installed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            toProjectId,
            existing.projectSlug,
            existing.projectType,
            existing.installedVersion,
            existing.previousVersion,
            existing.availableVersion,
            existing.installState,
            packageRoot,
            JSON.stringify(existing.manifest ?? {}),
            existing.manifestHash,
            existing.lastError,
            existing.installedAt,
            now,
          );
      }
      this.db
        .prepare(
          `UPDATE project_package_directory
           SET local_project_id = ?, updated_at = ?
           WHERE local_project_id = ? OR slug = ?`,
        )
        .run(toProjectId, now, fromProjectId, existing.projectSlug);
    });
    return this.getInstallByProjectId(toProjectId);
  }

  listDirectory(): ProjectPackageDirectoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_package_directory ORDER BY name COLLATE NOCASE ASC`,
      )
      .all() as DirectoryRow[];
    return rows.map(mapDirectory);
  }

  getDirectoryBySlug(slug: string): ProjectPackageDirectoryEntry | null {
    const row = this.db
      .prepare(`SELECT * FROM project_package_directory WHERE slug = ?`)
      .get(slug) as DirectoryRow | undefined;
    return row ? mapDirectory(row) : null;
  }

  upsertDirectoryEntry(entry: {
    cloudProjectId: string;
    localProjectId?: string | null;
    slug: string;
    name: string;
    projectType: string;
    availableVersion: number;
    minimumNeudVersion?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
    updatedAt: string;
  }): ProjectPackageDirectoryEntry {
    const existingBySlug = this.getDirectoryBySlug(entry.slug);
    let cloudProjectId = entry.cloudProjectId;

    if (existingBySlug && existingBySlug.cloudProjectId !== entry.cloudProjectId) {
      cloudProjectId = pickCanonicalDirectoryCloudProjectId(
        existingBySlug.cloudProjectId,
        entry.cloudProjectId,
      );
      if (cloudProjectId !== existingBySlug.cloudProjectId) {
        // Identity realignment: drop the superseded slug row before insert.
        this.removeDirectoryByCloudProjectId(existingBySlug.cloudProjectId);
      }
    }

    this.db
      .prepare(
        `INSERT INTO project_package_directory (
          cloud_project_id, local_project_id, slug, name, project_type,
          available_version, minimum_neud_version, description, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_project_id) DO UPDATE SET
          local_project_id = COALESCE(excluded.local_project_id, project_package_directory.local_project_id),
          slug = excluded.slug,
          name = excluded.name,
          project_type = excluded.project_type,
          available_version = excluded.available_version,
          minimum_neud_version = excluded.minimum_neud_version,
          description = excluded.description,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        cloudProjectId,
        entry.localProjectId ?? existingBySlug?.localProjectId ?? null,
        entry.slug,
        entry.name,
        entry.projectType,
        entry.availableVersion,
        entry.minimumNeudVersion ?? null,
        entry.description ?? null,
        JSON.stringify(entry.metadata ?? {}),
        entry.updatedAt,
      );
    return this.getDirectoryBySlug(entry.slug)!;
  }

  linkDirectoryLocalProject(
    cloudProjectId: string,
    localProjectId: string | null,
    updatedAt: string,
  ): void {
    this.db
      .prepare(
        `UPDATE project_package_directory
         SET local_project_id = ?, updated_at = ?
         WHERE cloud_project_id = ?`,
      )
      .run(localProjectId, updatedAt, cloudProjectId);
  }

  removeDirectoryByCloudProjectId(cloudProjectId: string): void {
    this.db
      .prepare(`DELETE FROM project_package_directory WHERE cloud_project_id = ?`)
      .run(cloudProjectId);
  }
}
