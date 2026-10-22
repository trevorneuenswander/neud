/**
 * Publish / fetch modular project packages via Supabase Storage + catalog table.
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type { AuthenticatedCloudCoordinator } from "../services/authenticated-cloud-coordinator";

const BUCKET = "project-packages";

export type CloudPackagePublishInput = {
  cloudProjectId: string;
  localProjectId: string;
  slug: string;
  name: string;
  projectType: string;
  description: string | null;
  capabilities: string[];
  version: number;
  packageRoot: string;
};

export type CloudPackagePublishResult = {
  ok: boolean;
  contentHash?: string;
  error?: string;
};

function hashDirectory(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        hash.update(entry.name);
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return hash.digest("hex");
}

function collectFiles(root: string): Array<{ relativePath: string; bytes: Buffer }> {
  const files: Array<{ relativePath: string; bytes: Buffer }> = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        files.push({ relativePath: rel.replace(/\\/g, "/"), bytes: fs.readFileSync(full) });
      }
    }
  };
  walk(root, "");
  return files;
}

export class CloudPackagePublisher {
  constructor(private readonly cloud: AuthenticatedCloudCoordinator) {}

  async publishVersion(
    input: CloudPackagePublishInput,
  ): Promise<CloudPackagePublishResult> {
    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      return { ok: false, error: "Cloud session unavailable." };
    }
    const client = await this.cloud.getClient();
    if (!client) {
      return { ok: false, error: "Cloud client unavailable." };
    }

    const contentHash = hashDirectory(input.packageRoot);
    const storagePrefix = `${input.cloudProjectId}/v${input.version}`;

    // Idempotent: if catalog row already matches this hash, succeed.
    const { data: existing } = await client
      .from("project_package_versions")
      .select("id, content_hash")
      .eq("project_id", input.cloudProjectId)
      .eq("version", input.version)
      .maybeSingle();

    if (
      existing &&
      typeof (existing as { content_hash?: string }).content_hash === "string" &&
      (existing as { content_hash: string }).content_hash === contentHash
    ) {
      return { ok: true, contentHash };
    }

    const files = collectFiles(input.packageRoot);
    for (const file of files) {
      const storagePath = `${storagePrefix}/${file.relativePath}`;
      const { error: uploadError } = await client.storage
        .from(BUCKET)
        .upload(storagePath, file.bytes, {
          upsert: true,
          contentType: file.relativePath.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
        });
      if (uploadError) {
        return { ok: false, error: uploadError.message };
      }
    }

    const manifestPath = path.join(input.packageRoot, "manifest.json");
    let manifestJson: Record<string, unknown> = {};
    if (fs.existsSync(manifestPath)) {
      try {
        manifestJson = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
          string,
          unknown
        >;
      } catch {
        manifestJson = {};
      }
    }

    const { data, error } = await client.rpc("publish_project_package_version", {
      p_project_id: input.cloudProjectId,
      p_version: input.version,
      p_content_hash: contentHash,
      p_storage_prefix: storagePrefix,
      p_manifest: manifestJson,
      p_capabilities: input.capabilities,
      p_project_slug: input.slug,
      p_project_name: input.name,
      p_project_type: input.projectType,
      p_description: input.description,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
      return {
        ok: false,
        error:
          typeof (data as { message?: string }).message === "string"
            ? (data as { message: string }).message
            : "publish_project_package_version failed",
      };
    }

    return { ok: true, contentHash };
  }
}
