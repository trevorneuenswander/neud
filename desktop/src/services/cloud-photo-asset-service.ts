import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalPhoto } from "../displays/canonical-photo";
import type {
  ProjectPhotoUploadRecord,
  ProjectPhotoUploadRepository,
} from "../repositories/project-photo-upload-repository";

const BUCKET = "project-display-assets";

export function sha256File(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildStoragePath(projectId: string, contentHash: string, filename: string): string {
  const ext = path.extname(filename).toLowerCase() || ".jpg";
  return `${projectId}/photos/${contentHash.slice(0, 16)}${ext}`;
}

export type CloudPhotoUploadResult = {
  record: ProjectPhotoUploadRecord;
  photo: CanonicalPhoto;
  uploaded: boolean;
};

export class CloudPhotoAssetService {
  constructor(
    private readonly uploads: ProjectPhotoUploadRepository,
    private readonly getClient: () => Promise<SupabaseClient | null>,
  ) {}

  registerLocalPhoto(input: {
    projectId: string;
    lotKey?: string | null;
    displayUrl: string;
    localPath: string;
    originalFilename?: string | null;
  }): ProjectPhotoUploadRecord {
    const contentHash = sha256File(input.localPath);
    return this.uploads.upsertPending({
      projectId: input.projectId,
      lotKey: input.lotKey ?? null,
      displayUrl: input.displayUrl,
      localPath: input.localPath,
      contentHash,
      originalFilename: input.originalFilename ?? path.basename(input.localPath),
    });
  }

  getCanonicalPhotoForDisplayUrl(
    projectId: string,
    displayUrl: string,
    localPath?: string | null,
  ): CanonicalPhoto | null {
    const record = this.uploads.getByDisplayUrl(projectId, displayUrl);
    if (!record) {
      return localPath ? { localUrl: displayUrl } : { localUrl: displayUrl };
    }
    const photo: CanonicalPhoto = { localUrl: displayUrl };
    if (record.storageObjectId) {
      photo.storageObjectId = record.storageObjectId;
    }
    if (record.originalFilename) {
      photo.filename = record.originalFilename;
    }
    return photo;
  }

  enrichCanonicalPhotos(
    projectId: string,
    photos: Array<string | CanonicalPhoto>,
  ): CanonicalPhoto[] {
    const enriched: CanonicalPhoto[] = [];
    for (const entry of photos) {
      if (typeof entry === "string") {
        const merged = this.getCanonicalPhotoForDisplayUrl(projectId, entry);
        if (merged) {
          enriched.push(merged);
        }
        continue;
      }
      const displayUrl = entry.localUrl ?? "";
      const record = displayUrl
        ? this.uploads.getByDisplayUrl(projectId, displayUrl)
        : null;
      enriched.push({
        ...entry,
        localUrl: displayUrl || entry.localUrl,
        storageObjectId: entry.storageObjectId ?? record?.storageObjectId ?? undefined,
        filename: entry.filename ?? record?.originalFilename ?? undefined,
      });
    }
    return enriched;
  }

  markPhotoRemoved(projectId: string, displayUrl: string): void {
    this.uploads.markOrphanCandidateByDisplayUrl(projectId, displayUrl);
  }

  async processUploadRecord(record: ProjectPhotoUploadRecord): Promise<CloudPhotoUploadResult> {
    if (record.status === "uploaded" && record.storageObjectId) {
      return {
        record,
        uploaded: false,
        photo: {
          localUrl: record.displayUrl,
          storageObjectId: record.storageObjectId,
          filename: record.originalFilename ?? undefined,
        },
      };
    }

    if (!fs.existsSync(record.localPath)) {
      this.uploads.markFailed(record.id, "Local photo file was not found.");
      throw new Error("Local photo file was not found.");
    }

    const client = await this.getClient();
    if (!client) {
      return {
        record,
        uploaded: false,
        photo: { localUrl: record.displayUrl, filename: record.originalFilename ?? undefined },
      };
    }

    this.uploads.markUploading(record.id);

    const filename = record.originalFilename ?? path.basename(record.localPath);
    const storagePath = buildStoragePath(record.projectId, record.contentHash, filename);
    const buffer = fs.readFileSync(record.localPath);

    const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, buffer, {
      upsert: true,
      contentType: "image/jpeg",
    });

    if (uploadError) {
      this.uploads.markFailed(record.id, uploadError.message);
      return {
        record: this.uploads.getById(record.id)!,
        uploaded: false,
        photo: { localUrl: record.displayUrl, filename: record.originalFilename ?? undefined },
      };
    }

    const { data, error: registerError } = await client.rpc("register_project_photo_asset", {
      p_project_id: record.projectId,
      p_storage_path: storagePath,
      p_content_hash: record.contentHash,
      p_lot_key: record.lotKey,
      p_original_filename: filename,
      p_mime_type: "image/jpeg",
      p_byte_size: buffer.byteLength,
    });

    if (registerError || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
      this.uploads.markFailed(
        record.id,
        registerError?.message ?? "Unable to register cloud photo asset.",
      );
      return {
        record: this.uploads.getById(record.id)!,
        uploaded: false,
        photo: { localUrl: record.displayUrl, filename: record.originalFilename ?? undefined },
      };
    }

    const storageObjectId =
      typeof (data as { storage_object_id?: string }).storage_object_id === "string"
        ? (data as { storage_object_id: string }).storage_object_id
        : typeof (data as { asset_id?: string }).asset_id === "string"
          ? (data as { asset_id: string }).asset_id
          : null;

    if (!storageObjectId) {
      this.uploads.markFailed(record.id, "Cloud registration did not return storage object id.");
      return {
        record: this.uploads.getById(record.id)!,
        uploaded: false,
        photo: { localUrl: record.displayUrl, filename: record.originalFilename ?? undefined },
      };
    }

    this.uploads.markUploaded(record.id, storageObjectId);
    const updated = this.uploads.getById(record.id)!;
    return {
      record: updated,
      uploaded: true,
      photo: {
        localUrl: record.displayUrl,
        storageObjectId,
        filename: record.originalFilename ?? undefined,
      },
    };
  }

  async retryPendingUploads(input?: {
    projectId?: string;
    onUploaded?: (projectId: string) => void;
  }): Promise<number> {
    const pending = this.uploads.listRetryable(100);
    let uploadedCount = 0;
    for (const record of pending) {
      if (input?.projectId && record.projectId !== input.projectId) {
        continue;
      }
      try {
        const result = await this.processUploadRecord(record);
        if (result.uploaded) {
          uploadedCount += 1;
          input?.onUploaded?.(record.projectId);
        }
      } catch {
        // Keep failed state in repository; continue with next record.
      }
    }
    return uploadedCount;
  }
}
