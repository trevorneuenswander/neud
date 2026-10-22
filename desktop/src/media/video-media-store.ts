import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { LocalDatabase } from "../database/connection";
import type { AppPaths } from "../services/app-paths";
import {
  assertMovFileExtension,
  probeMovProRes4444,
  type MovProResProbeResult,
} from "./mov-prores-probe";

export type VideoMediaAssetRecord = {
  id: string;
  projectId: string;
  displayId: string | null;
  originalFileName: string;
  storedFileName: string;
  relativePath: string;
  contentSha256: string;
  byteSize: number;
  container: string;
  codecFourCc: string;
  codecLabel: string;
  width: number;
  height: number;
  frameRate: number | null;
  durationSeconds: number | null;
  hasAlpha: boolean;
  loopEnabled: boolean;
  orphanRecoverySuppressed: boolean;
  createdAt: string;
  updatedAt: string;
};

type VideoMediaRow = {
  id: string;
  project_id: string;
  display_id: string | null;
  original_file_name: string;
  stored_file_name: string;
  relative_path: string;
  content_sha256: string;
  byte_size: number;
  container: string;
  codec_four_cc: string;
  codec_label: string;
  width: number;
  height: number;
  frame_rate: number | null;
  duration_seconds: number | null;
  has_alpha: number;
  loop_enabled: number;
  orphan_recovery_suppressed?: number | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: VideoMediaRow): VideoMediaAssetRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    displayId: row.display_id,
    originalFileName: row.original_file_name,
    storedFileName: row.stored_file_name,
    relativePath: row.relative_path,
    contentSha256: row.content_sha256,
    byteSize: row.byte_size,
    container: row.container,
    codecFourCc: row.codec_four_cc,
    codecLabel: row.codec_label,
    width: row.width,
    height: row.height,
    frameRate: row.frame_rate,
    durationSeconds: row.duration_seconds,
    hasAlpha: row.has_alpha === 1,
    loopEnabled: row.loop_enabled === 1,
    orphanRecoverySuppressed: row.orphan_recovery_suppressed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeFileBase(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-]+/g, "_");
  return base.length > 0 ? base.slice(0, 120) : "video.mov";
}

/**
 * Stores validated ProRes media under userData/media/displays.
 * Does not decode frames — playback requires a future native decoder adapter.
 */
export class VideoMediaStore {
  constructor(
    private readonly db: LocalDatabase,
    private readonly paths: AppPaths,
  ) {}

  mediaRoot(): string {
    const root = path.join(this.paths.root, "media", "displays");
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  absolutePathFor(relativePath: string): string {
    const root = this.mediaRoot();
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error("Invalid media path.");
    }
    return resolved;
  }

  getById(id: string): VideoMediaAssetRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM display_media_assets WHERE id = ?`)
      .get(id) as VideoMediaRow | undefined;
    return row ? mapRow(row) : null;
  }

  getByDisplayId(displayId: string): VideoMediaAssetRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM display_media_assets WHERE display_id = ?`)
      .get(displayId) as VideoMediaRow | undefined;
    return row ? mapRow(row) : null;
  }

  /**
   * Media imported but never attached (or detached after display delete).
   * Intentionally deleted displays suppress recovery so they are not recreated.
   */
  listOrphanAssets(projectId?: string): VideoMediaAssetRecord[] {
    const rows = projectId
      ? (this.db
          .prepare(
            `SELECT * FROM display_media_assets
             WHERE project_id = ? AND display_id IS NULL
               AND COALESCE(orphan_recovery_suppressed, 0) = 0
             ORDER BY created_at ASC`,
          )
          .all(projectId) as VideoMediaRow[])
      : (this.db
          .prepare(
            `SELECT * FROM display_media_assets
             WHERE display_id IS NULL
               AND COALESCE(orphan_recovery_suppressed, 0) = 0
             ORDER BY created_at ASC`,
          )
          .all() as VideoMediaRow[]);
    return rows.map(mapRow);
  }

  /** Mark media so orphan recovery will not recreate a display after intentional delete. */
  suppressOrphanRecovery(assetId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_media_assets
         SET orphan_recovery_suppressed = 1, updated_at = ?
         WHERE id = ?`,
      )
      .run(now, assetId);
  }

  async importProResMov(input: {
    projectId: string;
    sourceFilePath: string;
    originalFileName: string;
  }): Promise<{ asset: VideoMediaAssetRecord; probe: Extract<MovProResProbeResult, { ok: true }> }> {
    const extensionError = assertMovFileExtension(input.originalFileName);
    if (extensionError) {
      throw new Error(extensionError);
    }
    if (!path.isAbsolute(input.sourceFilePath)) {
      throw new Error("Media import requires an absolute local file path.");
    }
    if (input.sourceFilePath.includes("\0") || input.originalFileName.includes("\0")) {
      throw new Error("Invalid media path.");
    }

    const probe = await probeMovProRes4444(input.sourceFilePath);
    if (!probe.ok) {
      throw new Error(probe.error);
    }

    const id = crypto.randomUUID();
    const storedFileName = `${id}-${safeFileBase(input.originalFileName)}`;
    const projectDir = path.join(this.mediaRoot(), input.projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    const destination = path.join(projectDir, storedFileName);
    await fs.promises.copyFile(input.sourceFilePath, destination);

    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(destination);
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    const contentSha256 = hash.digest("hex");
    const now = new Date().toISOString();
    const relativePath = path.join(input.projectId, storedFileName);

    this.db
      .prepare(
        `INSERT INTO display_media_assets (
          id, project_id, display_id, original_file_name, stored_file_name, relative_path,
          content_sha256, byte_size, container, codec_four_cc, codec_label, width, height,
          frame_rate, duration_seconds, has_alpha, loop_enabled, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 0, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.originalFileName,
        storedFileName,
        relativePath,
        contentSha256,
        probe.fileSizeBytes,
        probe.container,
        probe.codecFourCc,
        probe.profileLabel,
        probe.width,
        probe.height,
        probe.durationSeconds,
        now,
        now,
      );

    const asset = this.getById(id);
    if (!asset) {
      throw new Error("Media asset was imported but could not be reloaded.");
    }
    return { asset, probe };
  }

  attachToDisplay(assetId: string, displayId: string): VideoMediaAssetRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_media_assets SET display_id = ?, updated_at = ? WHERE id = ?`,
      )
      .run(displayId, now, assetId);
    const asset = this.getById(assetId);
    if (!asset) {
      throw new Error("Media asset not found.");
    }
    return asset;
  }

  setLoopEnabled(assetId: string, loopEnabled: boolean): VideoMediaAssetRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_media_assets SET loop_enabled = ?, updated_at = ? WHERE id = ?`,
      )
      .run(loopEnabled ? 1 : 0, now, assetId);
    const asset = this.getById(assetId);
    if (!asset) {
      throw new Error("Media asset not found.");
    }
    return asset;
  }

  deleteAsset(assetId: string): void {
    const asset = this.getById(assetId);
    if (!asset) return;
    this.db.prepare(`DELETE FROM display_media_assets WHERE id = ?`).run(assetId);
    try {
      const absolute = this.absolutePathFor(asset.relativePath);
      if (fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    } catch {
      // Best-effort cleanup.
    }
  }
}
