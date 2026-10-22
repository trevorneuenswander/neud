#!/usr/bin/env node
/**
 * Runtime tests for project_package_directory slug reconciliation (no native sqlite).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEMA_CLOUD = "5e0a0001-0000-4000-8000-000000000001";

function pickCanonicalDirectoryCloudProjectId(existingCloudProjectId, incomingCloudProjectId) {
  const existing = existingCloudProjectId.trim();
  const incoming = incomingCloudProjectId.trim();
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing === incoming) return existing;
  const existingBuiltin = existing.startsWith("builtin:");
  const incomingBuiltin = incoming.startsWith("builtin:");
  if (existingBuiltin && !incomingBuiltin) return incoming;
  if (!existingBuiltin && incomingBuiltin) return existing;
  return incoming;
}

/** Minimal in-memory store mirroring UNIQUE(slug) + PK(cloud_project_id). */
function createDirectoryStore() {
  /** @type {Map<string, Record<string, unknown>>} */
  const byCloudId = new Map();
  /** @type {Map<string, string>} */
  const cloudIdBySlug = new Map();

  function getBySlug(slug) {
    const cloudId = cloudIdBySlug.get(slug);
    return cloudId ? byCloudId.get(cloudId) ?? null : null;
  }

  function removeByCloudId(cloudId) {
    const row = byCloudId.get(cloudId);
    if (!row) return;
    byCloudId.delete(cloudId);
    if (cloudIdBySlug.get(/** @type {string} */ (row.slug)) === cloudId) {
      cloudIdBySlug.delete(/** @type {string} */ (row.slug));
    }
  }

  function upsert(entry) {
    const existingBySlug = getBySlug(entry.slug);
    let cloudProjectId = entry.cloudProjectId;
    if (existingBySlug && existingBySlug.cloudProjectId !== entry.cloudProjectId) {
      cloudProjectId = pickCanonicalDirectoryCloudProjectId(
        /** @type {string} */ (existingBySlug.cloudProjectId),
        entry.cloudProjectId,
      );
      if (cloudProjectId !== existingBySlug.cloudProjectId) {
        removeByCloudId(/** @type {string} */ (existingBySlug.cloudProjectId));
      }
    }

    const previous = byCloudId.get(cloudProjectId);
    if (previous && previous.slug !== entry.slug) {
      throw new Error("UNIQUE constraint failed: project_package_directory.slug");
    }
    // Enforce slug uniqueness against other cloud ids.
    const slugOwner = cloudIdBySlug.get(entry.slug);
    if (slugOwner && slugOwner !== cloudProjectId) {
      throw new Error("UNIQUE constraint failed: project_package_directory.slug");
    }

    const row = {
      cloudProjectId,
      localProjectId: entry.localProjectId ?? previous?.localProjectId ?? existingBySlug?.localProjectId ?? null,
      slug: entry.slug,
      name: entry.name,
      projectType: entry.projectType,
      availableVersion: entry.availableVersion,
      updatedAt: entry.updatedAt,
    };
    byCloudId.set(cloudProjectId, row);
    cloudIdBySlug.set(entry.slug, cloudProjectId);
    return row;
  }

  return {
    upsert,
    getBySlug,
    countBySlug(slug) {
      return getBySlug(slug) ? 1 : 0;
    },
    total() {
      return byCloudId.size;
    },
  };
}

test("fresh SEMA directory upsert", () => {
  const store = createDirectoryStore();
  const row = store.upsert({
    cloudProjectId: SEMA_CLOUD,
    localProjectId: null,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t1",
  });
  assert.equal(row.cloudProjectId, SEMA_CLOUD);
  assert.equal(store.countBySlug("sema"), 1);
});

test("pre-existing same slug/same id upserts in place", () => {
  const store = createDirectoryStore();
  store.upsert({
    cloudProjectId: SEMA_CLOUD,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t1",
  });
  const row = store.upsert({
    cloudProjectId: SEMA_CLOUD,
    localProjectId: "local-1",
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 2,
    updatedAt: "t2",
  });
  assert.equal(store.countBySlug("sema"), 1);
  assert.equal(row.localProjectId, "local-1");
  assert.equal(row.availableVersion, 2);
});

test("pre-existing same slug/different id realigns to cloud id", () => {
  const store = createDirectoryStore();
  store.upsert({
    cloudProjectId: "builtin:sema",
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t1",
  });
  const row = store.upsert({
    cloudProjectId: SEMA_CLOUD,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t2",
  });
  assert.equal(row.cloudProjectId, SEMA_CLOUD);
  assert.equal(store.countBySlug("sema"), 1);
  assert.equal(store.total(), 1);
});

test("builtin seeded row → cloud sync → install builtin write stays one row", () => {
  const store = createDirectoryStore();
  store.upsert({
    cloudProjectId: "builtin:sema",
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t1",
  });
  // Refresh Projects / syncCloudAccessibleProjects
  store.upsert({
    cloudProjectId: SEMA_CLOUD,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t2",
  });
  // install path may still propose builtin: — must keep cloud id
  const afterInstall = store.upsert({
    cloudProjectId: "builtin:sema",
    localProjectId: "local-sema",
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t3",
  });
  assert.equal(afterInstall.cloudProjectId, SEMA_CLOUD);
  assert.equal(afterInstall.localProjectId, "local-sema");
  assert.equal(store.countBySlug("sema"), 1);
  assert.equal(store.total(), 1);
});

test("retry / repeated download upserts remain idempotent", () => {
  const store = createDirectoryStore();
  for (let i = 0; i < 3; i += 1) {
    store.upsert({
      cloudProjectId: SEMA_CLOUD,
      localProjectId: "local-sema",
      slug: "sema",
      name: "SEMA",
      projectType: "sema-schedule",
      availableVersion: 1,
      updatedAt: `t${i}`,
    });
  }
  assert.equal(store.countBySlug("sema"), 1);
});

test("Refresh Projects before Download does not create collision", () => {
  const store = createDirectoryStore();
  store.upsert({
    cloudProjectId: "builtin:sema",
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t0",
  });
  store.upsert({
    cloudProjectId: SEMA_CLOUD,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t1",
  });
  assert.doesNotThrow(() => {
    store.upsert({
      cloudProjectId: SEMA_CLOUD,
      localProjectId: "local-sema",
      slug: "sema",
      name: "SEMA",
      projectType: "sema-schedule",
      availableVersion: 1,
      updatedAt: "t2",
    });
  });
  assert.equal(store.total(), 1);
});

test("slug uniqueness preserved; no duplicate rows", () => {
  const store = createDirectoryStore();
  store.upsert({
    cloudProjectId: SEMA_CLOUD,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: 1,
    updatedAt: "t1",
  });
  assert.doesNotThrow(() => {
    store.upsert({
      cloudProjectId: "another-uuid",
      slug: "sema",
      name: "SEMA",
      projectType: "sema-schedule",
      availableVersion: 1,
      updatedAt: "t2",
    });
  });
  assert.equal(store.countBySlug("sema"), 1);
  assert.equal(store.total(), 1);
  assert.equal(store.getBySlug("sema")?.cloudProjectId, "another-uuid");
});

test("source wiring prefers non-builtin cloud id on install", () => {
  const service = fs.readFileSync(
    path.join(repoRoot, "desktop/src/packages/project-package-service.ts"),
    "utf8",
  );
  const repo = fs.readFileSync(
    path.join(repoRoot, "desktop/src/repositories/project-packages-repository.ts"),
    "utf8",
  );
  assert.match(service, /directoryCloudProjectId/);
  assert.match(service, /!existingDirectory\.cloudProjectId\.startsWith\("builtin:"\)/);
  assert.match(repo, /pickCanonicalDirectoryCloudProjectId/);
  assert.match(repo, /removeDirectoryByCloudProjectId/);
});
