#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const fingerprintPath = pathToFileURL(
  path.join(repoRoot, "shared/display-runtime/canonical-payload-fingerprint.ts"),
).href;
const photoPath = pathToFileURL(
  path.join(repoRoot, "shared/display-runtime/canonical-photo.ts"),
).href;

const { fingerprintCanonicalPayloadContent } = await import(fingerprintPath);
const {
  resolvePhotoUrlsForHostedDisplay,
  resolvePhotoUrlsForLocalDisplay,
  isLocalOnlyPhotoUrl,
} = await import(photoPath);

const basePayload = {
  current: { lot: "101", title: "Lot A", price: "$ 10,000", status: "No Reserve" },
  auctionDisplay: {
    photos: [
      {
        localUrl: "/api/offline-assets/pkg/photos/a.jpg",
        remoteUrl: "https://cdn.example.test/a.jpg",
      },
    ],
  },
  dataSource: "webpage-scraper",
  updatedAt: "2026-07-21T12:00:00.000Z",
};

test("content fingerprint changes when bid changes at same revision", () => {
  const first = fingerprintCanonicalPayloadContent(basePayload);
  const second = fingerprintCanonicalPayloadContent({
    ...basePayload,
    current: { ...basePayload.current, price: "$ 20,000" },
  });
  assert.notEqual(first, second);
});

test("content fingerprint ignores updatedAt only", () => {
  const first = fingerprintCanonicalPayloadContent(basePayload);
  const second = fingerprintCanonicalPayloadContent({
    ...basePayload,
    updatedAt: "2026-07-21T13:00:00.000Z",
  });
  assert.equal(first, second);
});

test("hosted resolver prefers remote URL over local offline asset", () => {
  const urls = resolvePhotoUrlsForHostedDisplay(basePayload.auctionDisplay.photos);
  assert.deepEqual(urls, ["https://cdn.example.test/a.jpg"]);
});

test("local resolver prefers local offline asset over remote URL", () => {
  const urls = resolvePhotoUrlsForLocalDisplay(basePayload.auctionDisplay.photos);
  assert.deepEqual(urls, ["/api/offline-assets/pkg/photos/a.jpg"]);
});

test("hosted resolver rejects localhost and file paths", () => {
  assert.equal(isLocalOnlyPhotoUrl("http://127.0.0.1:8787/api/x"), true);
  assert.equal(isLocalOnlyPhotoUrl("file:///C:/photos/a.jpg"), true);
  const urls = resolvePhotoUrlsForHostedDisplay([
    "http://127.0.0.1/photo.jpg",
    "https://cdn.example.test/ok.jpg",
  ]);
  assert.deepEqual(urls, ["https://cdn.example.test/ok.jpg"]);
});

test("legacy string photo URLs remain supported", () => {
  assert.deepEqual(resolvePhotoUrlsForHostedDisplay(["https://cdn.example.test/legacy.jpg"]), [
    "https://cdn.example.test/legacy.jpg",
  ]);
});
