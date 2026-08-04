#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const photoPath = pathToFileURL(
  path.join(repoRoot, "shared/display-runtime/canonical-photo.ts"),
).href;

const {
  sanitizeCanonicalPhoto,
  sanitizeCanonicalPhotos,
  resolveHostedPhotoUrl,
} = await import(photoPath);
const { sanitizeCanonicalProjectData } = await import(
  pathToFileURL(path.join(repoRoot, "desktop/dist/publishing/index.js")).href
);

test("HTTPS photo string survives sanitization", () => {
  const result = sanitizeCanonicalPhoto("https://cdn.example.test/photo.jpg");
  assert.equal(result, "https://cdn.example.test/photo.jpg");
});

test("structured photo with HTTPS remoteUrl survives sanitization", () => {
  const result = sanitizeCanonicalPhoto({
    localUrl: "http://127.0.0.1:3000/api/offline-assets/pkg/a.jpg",
    remoteUrl: "https://cdn.example.test/a.jpg",
    originalUrl: "https://cdn.example.test/a.jpg",
  });
  assert.ok(result && typeof result === "object");
  assert.equal(result.remoteUrl, "https://cdn.example.test/a.jpg");
  assert.equal(result.originalUrl, "https://cdn.example.test/a.jpg");
  assert.equal("localUrl" in result, false);
});

test("structured photo with only localhost localUrl produces no hosted source", () => {
  const result = sanitizeCanonicalPhoto({
    localUrl: "http://127.0.0.1:3000/api/offline-assets/pkg/a.jpg",
  });
  assert.equal(result, null);
  assert.deepEqual(resolveHostedPhotoUrl({ localUrl: "http://127.0.0.1/a.jpg" }), null);
});

test("Windows path and file URL are removed", () => {
  assert.equal(sanitizeCanonicalPhoto("file:///C:/photos/a.jpg"), null);
  assert.equal(
    sanitizeCanonicalPhoto({ remoteUrl: "C:\\Users\\Trevor\\photos\\a.jpg" }),
    null,
  );
});

test("mixed photo arrays remain ordered and deduplicated", () => {
  const sanitized = sanitizeCanonicalPhotos([
    "https://cdn.example.test/one.jpg",
    {
      localUrl: "http://127.0.0.1/a.jpg",
      remoteUrl: "https://cdn.example.test/two.jpg",
    },
    "https://cdn.example.test/one.jpg",
    { storageObjectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
  ]);
  assert.equal(sanitized.length, 3);
  assert.equal(typeof sanitized[0], "string");
  assert.equal(typeof sanitized[1], "object");
  assert.equal(sanitized[2]?.storageObjectId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

test("unknown object properties are removed from published photos", () => {
  const result = sanitizeCanonicalPhoto({
    remoteUrl: "https://cdn.example.test/a.jpg",
    password: "secret",
    authToken: "abc",
    metadata: { nested: true },
  });
  assert.ok(result && typeof result === "object");
  assert.deepEqual(Object.keys(result).sort(), ["originalUrl", "remoteUrl"].sort());
});

test("canonical project sanitizer preserves structured Local Controller photos", () => {
  const sanitized = sanitizeCanonicalProjectData({
    prev: null,
    current: null,
    next: [],
    lots: [],
    lastSold: null,
    auctionDisplay: {
      photos: [
        {
          localUrl: "http://127.0.0.1:3000/api/offline-assets/pkg/a.jpg",
          remoteUrl: "https://cdn.example.test/a.jpg",
        },
      ],
    },
    updatedAt: "2026-07-21T12:00:00.000Z",
    dataSource: "local-controller",
  });

  const photos = sanitized.auctionDisplay?.photos;
  assert.ok(Array.isArray(photos));
  assert.equal(photos.length, 1);
  assert.equal(typeof photos[0], "object");
  assert.equal((photos[0]?.remoteUrl), "https://cdn.example.test/a.jpg");
});

test("canonical snapshots do not include binary or base64 photo payloads", () => {
  const sanitized = sanitizeCanonicalProjectData({
    prev: null,
    current: null,
    next: [],
    lots: [],
    lastSold: null,
    auctionDisplay: {
      photos: [
        "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        { remoteUrl: "https://cdn.example.test/a.jpg", base64: "ignored" },
      ],
    },
    updatedAt: "2026-07-21T12:00:00.000Z",
    dataSource: "local-controller",
  });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /data:image/);
  assert.doesNotMatch(serialized, /base64/);
});
